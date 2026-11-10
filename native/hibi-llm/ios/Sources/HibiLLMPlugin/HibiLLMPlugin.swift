import Foundation
import UIKit
import Capacitor
import llama
#if canImport(FoundationModels)
import FoundationModels
#endif

/// まいにち（ひび手帳の AI）を iPhone の中で動かす。
///
/// - GGUF のモデル（Gemma 4・Qwen3.5・LFM3・LLM-jp・Bonsai）は llama.cpp で動かす。
///   ファイルは Hugging Face から一度だけダウンロードして、アプリの中（Application Support/hibi-models）に置く。
/// - Apple Intelligence は iOS 26 の Foundation Models で動かす（ダウンロードなし）。
/// - 会話の書式（chat template）は JavaScript の側で組み立てて、ここには組み立て済みの文字列が来る。
/// - ひび手帳のデータはどこにも送らない（通信するのはモデルのダウンロードだけ）。
@objc(HibiLLMPlugin)
public class HibiLLMPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HibiLLMPlugin"
    public let jsName = "HibiLLM"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appleGenerate", returnType: CAPPluginReturnPromise),
    ]

    private let engine = LlamaEngine()
    private var downloads: [String: Downloader] = [:]
    private let lock = NSLock()
    private var appleTask: Any? // Task<Void, Never> (kept untyped so the class needs no iOS 26 availability)

    // MARK: - files

    private static func modelsDir() throws -> URL {
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var dir = base.appendingPathComponent("hibi-models", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            // big, and downloadable again: keep it out of the iCloud backup
            var v = URLResourceValues(); v.isExcludedFromBackup = true
            try? dir.setResourceValues(v)
        }
        return dir
    }

    /// Only a plain file name, so nothing outside the models folder can be named.
    private static func fileURL(_ name: String?) throws -> URL {
        guard let name = name, !name.isEmpty, !name.contains("/"), !name.contains(".."), name.hasSuffix(".gguf") else {
            throw NSError(domain: "HibiLLM", code: 1, userInfo: [NSLocalizedDescriptionKey: "ファイル名が正しくありません"])
        }
        return try modelsDir().appendingPathComponent(name)
    }

    private static func appleAvailability() -> String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available: return "available"
            case .unavailable(let reason):
                switch reason {
                case .deviceNotEligible: return "deviceNotEligible"
                case .appleIntelligenceNotEnabled: return "appleIntelligenceNotEnabled"
                case .modelNotReady: return "modelNotReady"
                @unknown default: return "unavailable"
                }
            @unknown default: return "unavailable"
            }
        }
        return "osTooOld"
        #else
        return "osTooOld"
        #endif
    }

    /// { files: { name: bytes (0 = not downloaded) }, apple: "available" | reason, free: bytes, memory: bytes }
    @objc func info(_ call: CAPPluginCall) {
        var files: [String: Any] = [:]
        for name in (call.getArray("files", String.self) ?? []) {
            if let url = try? Self.fileURL(name), let a = try? FileManager.default.attributesOfItem(atPath: url.path), let n = a[.size] as? NSNumber {
                files[name] = n.int64Value
            } else { files[name] = 0 }
        }
        var free: Int64 = 0
        if let dir = try? Self.modelsDir(), let v = try? dir.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]), let c = v.volumeAvailableCapacityForImportantUsage { free = c }
        call.resolve([
            "files": files,
            "apple": Self.appleAvailability(),
            "free": free,
            "memory": Int64(ProcessInfo.processInfo.physicalMemory),
            "loaded": engine.loadedName ?? "",
        ])
    }

    // MARK: - download

    @objc func download(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr), url.scheme == "https", url.host == "huggingface.co" else {
            return call.reject("ダウンロード先が正しくありません")
        }
        let name = call.getString("file") ?? ""
        let dest: URL
        do { dest = try Self.fileURL(name) } catch { return call.reject(error.localizedDescription) }
        if FileManager.default.fileExists(atPath: dest.path) { return call.resolve(["ok": true]) }
        lock.lock()
        if downloads[name] != nil { lock.unlock(); return call.reject("ダウンロード中です", "BUSY") }
        let d = Downloader(url: url, dest: dest)
        downloads[name] = d
        lock.unlock()
        // keep going for a while if the app goes to the background
        var bg = UIBackgroundTaskIdentifier.invalid
        DispatchQueue.main.async { bg = UIApplication.shared.beginBackgroundTask(withName: "hibi-model") { UIApplication.shared.endBackgroundTask(bg); bg = .invalid } }
        var last = Date.distantPast
        d.start(progress: { [weak self] loaded, total in
            let now = Date()
            if now.timeIntervalSince(last) < 0.25 { return }
            last = now
            self?.notifyListeners("progress", data: ["file": name, "loaded": loaded, "total": total])
        }, done: { [weak self] err in
            guard let self = self else { return }
            self.lock.lock(); self.downloads[name] = nil; self.lock.unlock()
            DispatchQueue.main.async { if bg != .invalid { UIApplication.shared.endBackgroundTask(bg); bg = .invalid } }
            if let err = err {
                let ns = err as NSError
                if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { call.reject("ダウンロードをやめました", "CANCELLED") }
                else if ns.domain == NSCocoaErrorDomain && ns.code == NSFileWriteOutOfSpaceError { call.reject("iPhoneの空き容量が足りません", "STORAGE") }
                else { call.reject("ダウンロードできませんでした（\(err.localizedDescription)）", "NETWORK") }
            } else {
                call.resolve(["ok": true])
            }
        })
    }

    @objc func cancelDownload(_ call: CAPPluginCall) {
        let name = call.getString("file") ?? ""
        lock.lock(); let d = downloads[name]; lock.unlock()
        d?.cancel()
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        do {
            let url = try Self.fileURL(call.getString("file"))
            engine.unloadIf(name: url.lastPathComponent) {
                try? FileManager.default.removeItem(at: url)
                call.resolve()
            }
        } catch { call.reject(error.localizedDescription) }
    }

    // MARK: - llama.cpp

    @objc func load(_ call: CAPPluginCall) {
        let url: URL
        do { url = try Self.fileURL(call.getString("file")) } catch { return call.reject(error.localizedDescription) }
        guard FileManager.default.fileExists(atPath: url.path) else { return call.reject("モデルがまだダウンロードされていません", "NOT_DOWNLOADED") }
        let nCtx = max(1024, min(call.getInt("contextLength") ?? 4096, 16384))
        engine.load(url: url, nCtx: nCtx) { result in
            switch result {
            case .success(let r): call.resolve(r)
            case .failure(let e): call.reject(e.localizedDescription, "LOAD_FAILED")
            }
        }
    }

    @objc func unload(_ call: CAPPluginCall) {
        engine.unload { call.resolve() }
    }

    @objc func generate(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt") else { return call.reject("prompt がありません") }
        let id = call.getString("id") ?? ""
        let opts = LlamaEngine.Options(
            maxTokens: max(1, min(call.getInt("maxTokens") ?? 512, 4096)),
            temperature: Float(call.getDouble("temperature") ?? 0.6),
            topP: Float(call.getDouble("topP") ?? 0.95),
            renderSpecial: call.getBool("renderSpecial") ?? false,
            seed: UInt32(truncatingIfNeeded: call.getInt("seed") ?? Int.random(in: 1...Int(Int32.max))))
        engine.generate(prompt: prompt, opts: opts, onText: { [weak self] text in
            self?.notifyListeners("token", data: ["id": id, "text": text])
        }) { result in
            switch result {
            case .success(let r): call.resolve(r)
            case .failure(let e): call.reject(e.localizedDescription, (e as NSError).domain == "HibiLLM.tooLong" ? "TOO_LONG" : "GENERATION_FAILED")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        engine.requestStop()
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) { (appleTask as? Task<Void, Never>)?.cancel() }
        #endif
        call.resolve()
    }

    // MARK: - Apple Intelligence

    @objc func appleGenerate(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let avail = Self.appleAvailability()
            guard avail == "available" else { return call.reject("Apple Intelligence を使えません（\(avail)）", "APPLE_UNAVAILABLE") }
            let instructions = call.getString("instructions") ?? ""
            let prompt = call.getString("prompt") ?? ""
            let id = call.getString("id") ?? ""
            let temperature = call.getDouble("temperature")
            let maxTokens = call.getInt("maxTokens")
            (appleTask as? Task<Void, Never>)?.cancel()
            let started = Date()
            appleTask = Task { [weak self] in
                var sent = ""
                var first: Double? = nil
                do {
                    let session = LanguageModelSession(instructions: instructions)
                    let options = GenerationOptions(temperature: temperature, maximumResponseTokens: maxTokens)
                    let stream = session.streamResponse(to: prompt, options: options)
                    for try await snapshot in stream {
                        if Task.isCancelled { break }
                        let text = snapshot.content
                        // each snapshot is the whole answer so far: send only what is new
                        if text.hasPrefix(sent) {
                            let delta = String(text.dropFirst(sent.count))
                            if !delta.isEmpty {
                                if first == nil { first = Date().timeIntervalSince(started) * 1000 }
                                self?.notifyListeners("token", data: ["id": id, "text": delta])
                            }
                        }
                        sent = text
                    }
                    call.resolve(["finish": Task.isCancelled ? "abort" : "stop", "ms": Date().timeIntervalSince(started) * 1000, "firstMs": first ?? 0])
                } catch is CancellationError {
                    call.resolve(["finish": "abort", "ms": Date().timeIntervalSince(started) * 1000, "firstMs": first ?? 0])
                } catch {
                    let s = String(describing: error)
                    if s.contains("exceededContextWindowSize") { call.reject("Apple Intelligence に渡す記録が長すぎました", "TOO_LONG") }
                    else if s.contains("guardrailViolation") || s.contains("refusal") { call.reject("Apple Intelligence がこの内容には答えられませんでした", "REFUSED") }
                    else if s.contains("unsupportedLanguageOrLocale") { call.reject("Apple Intelligence がこの言語に対応していません", "LANGUAGE") }
                    else { call.reject("Apple Intelligence で答えられませんでした（\(error.localizedDescription)）", "GENERATION_FAILED") }
                }
            }
            return
        }
        #endif
        call.reject("Apple Intelligence は iOS 26 以降で使えます", "APPLE_UNAVAILABLE")
    }
}

// MARK: - download helper

final class Downloader: NSObject, URLSessionDownloadDelegate {
    private let url: URL
    private let dest: URL
    private var session: URLSession?
    private var task: URLSessionDownloadTask?
    private var onProgress: ((Int64, Int64) -> Void)?
    private var onDone: ((Error?) -> Void)?
    private var finished = false

    init(url: URL, dest: URL) { self.url = url; self.dest = dest }

    func start(progress: @escaping (Int64, Int64) -> Void, done: @escaping (Error?) -> Void) {
        onProgress = progress; onDone = done
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 120
        cfg.timeoutIntervalForResource = 6 * 3600
        cfg.waitsForConnectivity = true
        let s = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
        session = s
        let t = s.downloadTask(with: url)
        task = t
        t.resume()
    }

    func cancel() { task?.cancel() }

    private func finish(_ err: Error?) {
        if finished { return }
        finished = true
        session?.finishTasksAndInvalidate()
        onDone?(err)
        onDone = nil; onProgress = nil
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        onProgress?(totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // the temporary file is gone when this returns: move it now
        if let http = downloadTask.response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            return finish(NSError(domain: "HibiLLM", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode)"]))
        }
        do {
            let part = dest.appendingPathExtension("part")
            try? FileManager.default.removeItem(at: part)
            try FileManager.default.moveItem(at: location, to: part)
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: part, to: dest)
            finish(nil)
        } catch { finish(error) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error { finish(error) }
    }
}

// MARK: - llama.cpp

final class LlamaEngine {
    struct Options {
        var maxTokens: Int
        var temperature: Float
        var topP: Float
        var renderSpecial: Bool
        var seed: UInt32
    }

    private let queue = DispatchQueue(label: "hibi.llama", qos: .userInitiated)
    private var model: OpaquePointer?
    private var ctx: OpaquePointer?
    private var nCtx: Int = 0
    private(set) var loadedName: String?
    private let stopLock = NSLock()
    private var stopFlag = false
    private static var backendReady = false

    private static func err(_ msg: String, domain: String = "HibiLLM") -> NSError {
        NSError(domain: domain, code: 1, userInfo: [NSLocalizedDescriptionKey: msg])
    }

    func requestStop() { stopLock.lock(); stopFlag = true; stopLock.unlock() }
    private func shouldStop() -> Bool { stopLock.lock(); defer { stopLock.unlock() }; return stopFlag }

    private func freeAll() {
        if let c = ctx { llama_free(c); ctx = nil }
        if let m = model { llama_model_free(m); model = nil }
        loadedName = nil
    }

    func unload(_ done: @escaping () -> Void) { requestStop(); queue.async { self.freeAll(); done() } }

    func unloadIf(name: String, _ done: @escaping () -> Void) {
        queue.async { if self.loadedName == name { self.freeAll() }; done() }
    }

    func load(url: URL, nCtx want: Int, _ done: @escaping (Result<[String: Any], Error>) -> Void) {
        queue.async {
            if !Self.backendReady { llama_backend_init(); Self.backendReady = true }
            if self.loadedName == url.lastPathComponent, self.ctx != nil, self.nCtx == want {
                return done(.success(self.describe()))
            }
            self.freeAll()
            var mp = llama_model_default_params()
            mp.n_gpu_layers = 999 // everything on the GPU (Metal)
            guard let m = llama_model_load_from_file(url.path, mp) else {
                return done(.failure(Self.err("モデルを読み込めませんでした（ファイルが壊れているか、このアプリの llama.cpp が対応していません）")))
            }
            var cp = llama_context_default_params()
            cp.n_ctx = UInt32(want)
            cp.n_batch = 512
            cp.n_ubatch = 512
            let cores = ProcessInfo.processInfo.activeProcessorCount
            cp.n_threads = Int32(max(2, min(4, cores - 2)))
            cp.n_threads_batch = cp.n_threads
            guard let c = llama_init_from_model(m, cp) else {
                llama_model_free(m)
                return done(.failure(Self.err("メモリが足りず、モデルを動かせませんでした")))
            }
            self.model = m; self.ctx = c
            self.nCtx = Int(llama_n_ctx(c))
            self.loadedName = url.lastPathComponent
            done(.success(self.describe()))
        }
    }

    private func describe() -> [String: Any] {
        guard let m = model else { return [:] }
        let vocab = llama_model_get_vocab(m)
        func text(_ t: llama_token) -> String {
            if t < 0 { return "" }
            guard let p = llama_vocab_get_text(vocab, t) else { return "" }
            return String(cString: p)
        }
        var r: [String: Any] = ["contextLength": nCtx, "bos": text(llama_vocab_bos(vocab)), "eos": text(llama_vocab_eos(vocab))]
        if let t = llama_model_chat_template(m, nil) { r["template"] = String(cString: t) }
        return r
    }

    func generate(prompt: String, opts: Options, onText: @escaping (String) -> Void, _ done: @escaping (Result<[String: Any], Error>) -> Void) {
        stopLock.lock(); stopFlag = false; stopLock.unlock()
        queue.async {
            guard let m = self.model, let c = self.ctx else { return done(.failure(Self.err("モデルが読み込まれていません"))) }
            let started = Date()
            let vocab = llama_model_get_vocab(m)
            llama_memory_clear(llama_get_memory(c), true)

            // the prompt is already in the model's chat format (special tokens as text)
            let utf8 = Array(prompt.utf8CString)
            var tokens = [llama_token](repeating: 0, count: utf8.count + 16)
            var n = utf8.withUnsafeBufferPointer { p in
                llama_tokenize(vocab, p.baseAddress, Int32(utf8.count - 1), &tokens, Int32(tokens.count), false, true)
            }
            if n < 0 {
                tokens = [llama_token](repeating: 0, count: Int(-n))
                n = utf8.withUnsafeBufferPointer { p in
                    llama_tokenize(vocab, p.baseAddress, Int32(utf8.count - 1), &tokens, Int32(tokens.count), false, true)
                }
            }
            if n <= 0 { return done(.failure(Self.err("文章を読み取れませんでした"))) }
            tokens = Array(tokens.prefix(Int(n)))
            if tokens.count >= self.nCtx - 32 {
                return done(.failure(Self.err("AIに渡す記録が長すぎました（\(tokens.count) トークン）", domain: "HibiLLM.tooLong")))
            }
            let maxNew = min(opts.maxTokens, self.nCtx - tokens.count - 1)

            // read the prompt, 512 tokens at a time
            var i = 0
            while i < tokens.count {
                if self.shouldStop() { return done(.success(["finish": "abort", "promptTokens": tokens.count, "completionTokens": 0, "ms": Date().timeIntervalSince(started) * 1000])) }
                let len = min(512, tokens.count - i)
                let rc = tokens.withUnsafeMutableBufferPointer { p in llama_decode(c, llama_batch_get_one(p.baseAddress! + i, Int32(len))) }
                if rc != 0 { return done(.failure(Self.err("AIが文章を読めませんでした（\(rc)）"))) }
                i += len
            }

            let sp = llama_sampler_chain_default_params()
            guard let smpl = llama_sampler_chain_init(sp) else { return done(.failure(Self.err("準備に失敗しました"))) }
            defer { llama_sampler_free(smpl) }
            llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40))
            llama_sampler_chain_add(smpl, llama_sampler_init_penalties(llama_vocab_n_tokens(vocab), 64, 1.08, 0, 0))
            llama_sampler_chain_add(smpl, llama_sampler_init_top_p(opts.topP, 1))
            llama_sampler_chain_add(smpl, llama_sampler_init_min_p(0.05, 1))
            llama_sampler_chain_add(smpl, llama_sampler_init_temp(opts.temperature))
            llama_sampler_chain_add(smpl, llama_sampler_init_dist(opts.seed))

            var pending: [UInt8] = []
            var produced = 0
            var firstMs: Double = 0
            var finish = "length"
            var buf = [CChar](repeating: 0, count: 256)
            while produced < maxNew {
                if self.shouldStop() { finish = "abort"; break }
                var tok = llama_sampler_sample(smpl, c, -1)
                if llama_vocab_is_eog(vocab, tok) { finish = "stop"; break }
                var k = llama_token_to_piece(vocab, tok, &buf, Int32(buf.count), 0, opts.renderSpecial)
                if k < 0 { buf = [CChar](repeating: 0, count: Int(-k) + 8); k = llama_token_to_piece(vocab, tok, &buf, Int32(buf.count), 0, opts.renderSpecial) }
                if k > 0 { pending.append(contentsOf: buf[0..<Int(k)].map { UInt8(bitPattern: $0) }) }
                let s = Self.takeValidUTF8(&pending)
                if !s.isEmpty {
                    if firstMs == 0 { firstMs = Date().timeIntervalSince(started) * 1000 }
                    onText(s)
                }
                produced += 1
                let rc = withUnsafeMutablePointer(to: &tok) { p in llama_decode(c, llama_batch_get_one(p, 1)) }
                if rc != 0 { finish = "error"; break }
            }
            if !pending.isEmpty { onText(String(decoding: pending, as: UTF8.self)) }
            let ms = Date().timeIntervalSince(started) * 1000
            done(.success(["finish": finish, "promptTokens": tokens.count, "completionTokens": produced, "ms": ms, "firstMs": firstMs]))
        }
    }

    /// The longest prefix that is whole UTF-8 (a Japanese letter can be split across two tokens).
    static func takeValidUTF8(_ bytes: inout [UInt8]) -> String {
        var cut = bytes.count
        var j = bytes.count - 1
        var back = 0
        while j >= 0 && back < 4 {
            let b = bytes[j]
            if b & 0xC0 != 0x80 { // a lead byte (or ASCII)
                let need = b < 0x80 ? 1 : b >= 0xF0 ? 4 : b >= 0xE0 ? 3 : b >= 0xC0 ? 2 : 1
                if j + need > bytes.count { cut = j }
                break
            }
            j -= 1; back += 1
        }
        if cut <= 0 { return "" }
        let s = String(decoding: bytes[0..<cut], as: UTF8.self)
        bytes.removeFirst(cut)
        return s
    }
}
