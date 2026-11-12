import Foundation
import Observation
import UIKit

enum LocalAIError: LocalizedError {
    case noModel
    case notDownloaded(String)
    case unavailable(String)
    case tooLong
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .noModel: return "AIモデルが選ばれていません。設定 →「AIモデル」でダウンロードしてください。"
        case .notDownloaded(let name): return "\(name) がまだダウンロードされていません。設定 →「AIモデル」でダウンロードしてください。"
        case .unavailable(let why): return why
        case .tooLong: return "AIに渡す文章が長すぎました。"
        case .failed(let why): return why
        }
    }
}

/// 端末の中の AI（llama.cpp / Apple Intelligence）。モデルのダウンロード・読み込み・文章の生成をまとめる。
@MainActor
@Observable
final class LocalAI {
    struct DownloadProgress: Equatable {
        var loaded: Int64
        var total: Int64
        var fraction: Double { total > 0 ? Double(loaded) / Double(total) : 0 }
    }

    enum Phase: Equatable {
        case idle
        case loading(String)
        case ready(String)
    }

    var selectedModelID: String { didSet { OrbitEmbed.defaults.set(selectedModelID, forKey: "localModel") } }
    /// 0 = 自動（メモリが 8GB 前後以上なら 8192、それ以外は 4096）
    var contextSetting: Int { didSet { OrbitEmbed.defaults.set(contextSetting, forKey: "localContext") } }
    var downloaded: Set<String> = []
    var downloads: [String: DownloadProgress] = [:]
    var downloadErrors: [String: String] = [:]
    var appleState = "osTooOld"
    var phase: Phase = .idle
    var freeBytes: Int64 = 0

    @ObservationIgnored private let engine = OrbitLlamaEngine()
    @ObservationIgnored private var downloaders: [String: ModelDownloader] = [:]
    @ObservationIgnored private var loaded: OrbitLlamaEngine.Loaded?
    @ObservationIgnored private var loadedModelID: String?
    @ObservationIgnored private var memoryObserver: NSObjectProtocol?

    let physicalMemory = Int64(ProcessInfo.processInfo.physicalMemory)

    init() {
        selectedModelID = OrbitEmbed.defaults.string(forKey: "localModel") ?? ""
        contextSetting = OrbitEmbed.defaults.integer(forKey: "localContext")
        refresh()
        if selectedModelID.isEmpty {
            selectedModelID = appleState == "available" ? "apple-intelligence" : (LocalModel.catalog.first { downloaded.contains($0.id) }?.id ?? "")
        }
        memoryObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.unload() }
        }
    }

    var selectedModel: LocalModel? { LocalModel.find(selectedModelID) }

    var contextLength: Int {
        if contextSetting > 0 { return contextSetting }
        return physicalMemory >= 7_500_000_000 ? 8192 : 4096
    }

    /// 選ばれているモデルがすぐ使えるか
    var isReady: Bool {
        guard let model = selectedModel else { return false }
        return model.kind == .apple ? appleState == "available" : downloaded.contains(model.id)
    }

    var statusLabel: String {
        guard let model = selectedModel else { return "モデル未設定" }
        return model.name
    }

    // MARK: Files

    static func modelsDir() throws -> URL {
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var dir = base.appendingPathComponent("orbit-models", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            // 大きくて、また落とせるので iCloud のバックアップには入れない
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? dir.setResourceValues(values)
        }
        return dir
    }

    static func fileURL(_ model: LocalModel) throws -> URL {
        let name = model.file
        guard !name.isEmpty, !name.contains("/"), !name.contains(".."), name.hasSuffix(".gguf") else {
            throw LocalAIError.failed("ファイル名が正しくありません")
        }
        return try modelsDir().appendingPathComponent(name)
    }

    func refresh() {
        appleState = AppleLLM.availability()
        var found: Set<String> = []
        for model in LocalModel.catalog where model.kind == .gguf {
            if let url = try? Self.fileURL(model), FileManager.default.fileExists(atPath: url.path) {
                found.insert(model.id)
            }
        }
        downloaded = found
        if let dir = try? Self.modelsDir(),
           let values = try? dir.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
           let capacity = values.volumeAvailableCapacityForImportantUsage {
            freeBytes = capacity
        }
    }

    // MARK: Download

    func download(_ model: LocalModel) {
        guard model.kind == .gguf, downloaders[model.id] == nil, !downloaded.contains(model.id) else { return }
        guard let url = URL(string: model.url), url.scheme == "https", url.host == "huggingface.co" else {
            downloadErrors[model.id] = "ダウンロード先が正しくありません"
            return
        }
        let dest: URL
        do { dest = try Self.fileURL(model) } catch {
            downloadErrors[model.id] = error.localizedDescription
            return
        }
        refresh()
        if freeBytes > 0 && freeBytes < model.bytes + 500_000_000 {
            let need = Double(model.bytes + 500_000_000 - freeBytes) / 1e9
            downloadErrors[model.id] = String(format: "iPhoneの空き容量が足りません（あと約%.1fGB必要です）", need)
            return
        }
        downloadErrors[model.id] = nil
        downloads[model.id] = DownloadProgress(loaded: 0, total: model.bytes)
        let downloader = ModelDownloader(url: url, dest: dest)
        downloaders[model.id] = downloader

        let background = BackgroundTaskBox()
        background.id = UIApplication.shared.beginBackgroundTask(withName: "orbit-model") {
            background.end()
        }
        var last = Date.distantPast
        let id = model.id
        downloader.start(progress: { [weak self] loaded, total in
            let now = Date()
            guard now.timeIntervalSince(last) > 0.25 else { return }
            last = now
            Task { @MainActor in
                self?.downloads[id] = DownloadProgress(loaded: loaded, total: total > 0 ? total : model.bytes)
            }
        }, done: { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                self.downloaders[id] = nil
                self.downloads[id] = nil
                background.end()
                if let error {
                    let ns = error as NSError
                    if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled {
                        self.downloadErrors[id] = nil
                    } else if ns.domain == NSCocoaErrorDomain && ns.code == NSFileWriteOutOfSpaceError {
                        self.downloadErrors[id] = "iPhoneの空き容量が足りません"
                    } else {
                        self.downloadErrors[id] = "ダウンロードできませんでした（\(error.localizedDescription)）"
                    }
                } else {
                    self.downloaded.insert(id)
                    if self.selectedModel == nil || !self.isReady { self.selectedModelID = id }
                }
                self.refresh()
            }
        })
    }

    func cancelDownload(_ model: LocalModel) {
        downloaders[model.id]?.cancel()
    }

    func delete(_ model: LocalModel) async {
        guard model.kind == .gguf, let url = try? Self.fileURL(model) else { return }
        await engine.unloadIf(name: url.lastPathComponent)
        if loadedModelID == model.id {
            loadedModelID = nil
            loaded = nil
            phase = .idle
        }
        try? FileManager.default.removeItem(at: url)
        refresh()
    }

    func unload() {
        engine.requestStop()
        engine.unload {}
        loaded = nil
        loadedModelID = nil
        phase = .idle
    }

    // MARK: Generation

    /// 選ばれているモデルを（必要なら）読み込む。
    @discardableResult
    func prepare() async throws -> LocalModel {
        guard let model = selectedModel else { throw LocalAIError.noModel }
        switch model.kind {
        case .apple:
            appleState = AppleLLM.availability()
            guard appleState == "available" else { throw LocalAIError.unavailable(AppleLLM.explain(appleState)) }
            phase = .ready(model.id)
            return model
        case .gguf:
            if loadedModelID == model.id, let loaded, loaded.contextLength == contextLength { return model }
            guard downloaded.contains(model.id), let url = try? Self.fileURL(model) else {
                throw LocalAIError.notDownloaded(model.name)
            }
            phase = .loading(model.id)
            do {
                loaded = try await engine.load(url: url, contextLength: contextLength)
                loadedModelID = model.id
                phase = .ready(model.id)
                return model
            } catch {
                phase = .idle
                throw error
            }
        }
    }

    /// トークン数のおおまかな見積もり（日本語は1文字 ≒ 1トークン、英数字は約3.5文字で1トークン）。
    static func estimateTokens(_ text: String) -> Int {
        var wide = 0, narrow = 0
        for scalar in text.unicodeScalars {
            if scalar.value < 0x2E80 { narrow += 1 } else { wide += 1 }
        }
        return wide + narrow / 3 + 1
    }

    /// 見積もりで maxTokens に収まるように文章を切る。
    static func fit(_ text: String, tokens maxTokens: Int) -> String {
        guard maxTokens > 0 else { return "" }
        let estimate = estimateTokens(text)
        guard estimate > maxTokens else { return text }
        let keep = Int(Double(text.count) * Double(maxTokens) / Double(estimate) * 0.95)
        return String(text.prefix(max(0, keep))) + "\n…（以下省略）"
    }

    /// 答えを1つ作る。見える文字だけを onText に少しずつ渡し、最後に全文を返す。
    @discardableResult
    func generate(_ messages: [LLMMessage], maxTokens: Int = 768, temperature: Float = 0.6,
                  grammar: String? = nil, onText: @escaping @MainActor (String) -> Void = { _ in }) async throws -> String {
        let model = try await prepare()
        var visible = ""

        let failure = ErrorBox()

        if model.kind == .apple {
            let stream = AsyncStream<String> { continuation in
                let task = Task {
                    do {
                        try await AppleLLM.generate(messages: messages, temperature: Double(temperature), maxTokens: maxTokens) {
                            _ = continuation.yield($0)
                        }
                    } catch {
                        failure.error = error
                    }
                    continuation.finish()
                }
                continuation.onTermination = { _ in task.cancel() }
            }
            for await piece in stream {
                visible += piece
                onText(piece)
            }
            try Task.checkCancellation()
            if let error = failure.error { throw error }
            return visible
        }

        guard let loaded else { throw LocalAIError.failed("モデルが読み込まれていません") }
        let prompt = ChatTemplate.render(model.template, messages: messages, bos: loaded.bos)
        let options = OrbitLlamaEngine.Options(
            maxTokens: maxTokens,
            temperature: temperature,
            topP: 0.95,
            renderSpecial: model.output == .harmony,
            seed: UInt32.random(in: 1...UInt32(Int32.max)),
            grammar: model.output == .think ? grammar : nil)

        let engine = self.engine
        let pieces = AsyncStream<String> { continuation in
            let task = Task {
                do {
                    let result = try await engine.generate(prompt: prompt, options: options) { _ = continuation.yield($0) }
                    if result.finish == "error" { failure.error = LocalAIError.failed("AIが途中で止まりました") }
                } catch {
                    let ns = error as NSError
                    failure.error = ns.domain == OrbitLlamaEngine.tooLongDomain ? LocalAIError.tooLong : error
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                task.cancel()
                engine.requestStop()
            }
        }

        var think = ThinkFilter()
        var raw = ""
        for await piece in pieces {
            if model.output == .harmony {
                raw += piece
                let text = Harmony.parse(raw).text
                if text.count > visible.count {
                    let delta = String(text.dropFirst(visible.count))
                    visible = text
                    onText(delta)
                }
            } else {
                let delta = think.feed(piece)
                if !delta.isEmpty {
                    visible += delta
                    onText(delta)
                }
            }
        }
        try Task.checkCancellation()
        if model.output == .think {
            let rest = think.finish()
            if !rest.isEmpty {
                visible += rest
                onText(rest)
            }
        }
        if let error = failure.error { throw error }
        return visible
    }

    func stop() {
        engine.requestStop()
    }
}

/// 生成中のエラーを、別のタスクから受け取るための入れ物。
private final class ErrorBox: @unchecked Sendable {
    var error: Error?
}

/// バックグラウンドでダウンロードを続けるための ID の入れ物。
private final class BackgroundTaskBox: @unchecked Sendable {
    var id = UIBackgroundTaskIdentifier.invalid

    func end() {
        DispatchQueue.main.async {
            if self.id != .invalid {
                UIApplication.shared.endBackgroundTask(self.id)
                self.id = .invalid
            }
        }
    }
}
