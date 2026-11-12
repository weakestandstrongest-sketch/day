import Foundation
import UIKit
import llama

/// llama.cpp を iPhone の中で動かす（ひび手帳の HibiLLMPlugin と同じ作り）。
/// すべての llama.cpp の呼び出しは専用のキューで順番に行う。
final class OrbitLlamaEngine: @unchecked Sendable {
    struct Options {
        var maxTokens: Int
        var temperature: Float
        var topP: Float
        var renderSpecial: Bool
        var seed: UInt32
        /// GBNF。指定すると、その形の文字列しか出さない（エージェントの JSON 用）。
        var grammar: String?
    }

    struct Result {
        var finish: String
        var promptTokens: Int
        var completionTokens: Int
        var ms: Double
        var firstMs: Double
    }

    struct Loaded {
        var contextLength: Int
        var bos: String
        var eos: String
    }

    static let tooLongDomain = "Orbit.LLM.tooLong"

    private let queue = DispatchQueue(label: "orbit.llama", qos: .userInitiated)
    private var model: OpaquePointer?
    private var ctx: OpaquePointer?
    private var nCtx: Int = 0
    private(set) var loadedName: String?
    private let stopLock = NSLock()
    private var stopFlag = false
    private static var backendReady = false

    private static func err(_ msg: String, domain: String = "Orbit.LLM") -> NSError {
        NSError(domain: domain, code: 1, userInfo: [NSLocalizedDescriptionKey: msg])
    }

    func requestStop() { stopLock.lock(); stopFlag = true; stopLock.unlock() }
    private func shouldStop() -> Bool { stopLock.lock(); defer { stopLock.unlock() }; return stopFlag }

    private func freeAll() {
        if let c = ctx { llama_free(c); ctx = nil }
        if let m = model { llama_model_free(m); model = nil }
        loadedName = nil
    }

    // MARK: async API

    func load(url: URL, contextLength: Int) async throws -> Loaded {
        try await withCheckedThrowingContinuation { cont in
            load(url: url, nCtx: contextLength) { cont.resume(with: $0) }
        }
    }

    func unload() async {
        await withCheckedContinuation { cont in unload { cont.resume() } }
    }

    func unloadIf(name: String) async {
        await withCheckedContinuation { cont in
            queue.async { if self.loadedName == name { self.freeAll() }; cont.resume() }
        }
    }

    func generate(prompt: String, options: Options, onText: @escaping (String) -> Void) async throws -> Result {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { cont in
                generate(prompt: prompt, opts: options, onText: onText) { cont.resume(with: $0) }
            }
        } onCancel: {
            self.requestStop()
        }
    }

    // MARK: queue-based implementation

    func unload(_ done: @escaping () -> Void) {
        requestStop()
        queue.async { self.freeAll(); done() }
    }

    private func load(url: URL, nCtx want: Int, _ done: @escaping (Swift.Result<Loaded, Error>) -> Void) {
        queue.async {
            if !Self.backendReady { llama_backend_init(); Self.backendReady = true }
            if self.loadedName == url.lastPathComponent, self.ctx != nil, self.nCtx == want {
                return done(.success(self.describe()))
            }
            self.freeAll()
            var mp = llama_model_default_params()
            mp.n_gpu_layers = 999 // すべて GPU（Metal）で
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
                return done(.failure(Self.err("メモリが足りず、モデルを動かせませんでした。コンテキスト長を短くするか、小さいモデルを選んでください。")))
            }
            self.model = m
            self.ctx = c
            self.nCtx = Int(llama_n_ctx(c))
            self.loadedName = url.lastPathComponent
            done(.success(self.describe()))
        }
    }

    private func describe() -> Loaded {
        guard let m = model else { return Loaded(contextLength: 0, bos: "", eos: "") }
        let vocab = llama_model_get_vocab(m)
        func text(_ t: llama_token) -> String {
            if t < 0 { return "" }
            guard let p = llama_vocab_get_text(vocab, t) else { return "" }
            return String(cString: p)
        }
        return Loaded(contextLength: nCtx, bos: text(llama_vocab_bos(vocab)), eos: text(llama_vocab_eos(vocab)))
    }

    private func generate(prompt: String, opts: Options, onText: @escaping (String) -> Void,
                          _ done: @escaping (Swift.Result<Result, Error>) -> Void) {
        stopLock.lock(); stopFlag = false; stopLock.unlock()
        queue.async {
            guard let m = self.model, let c = self.ctx else { return done(.failure(Self.err("モデルが読み込まれていません"))) }
            let started = Date()
            let elapsed = { Date().timeIntervalSince(started) * 1000 }
            let vocab = llama_model_get_vocab(m)
            llama_memory_clear(llama_get_memory(c), true)

            // プロンプトはモデルの会話の書式になっている（特殊トークンも文字列で入っている）
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
            if tokens.count >= self.nCtx - 64 {
                return done(.failure(Self.err("AIに渡す文章が長すぎました（\(tokens.count) トークン）", domain: Self.tooLongDomain)))
            }
            let maxNew = min(opts.maxTokens, self.nCtx - tokens.count - 1)

            // プロンプトを 512 トークンずつ読む
            var i = 0
            while i < tokens.count {
                if self.shouldStop() {
                    return done(.success(Result(finish: "abort", promptTokens: tokens.count, completionTokens: 0, ms: elapsed(), firstMs: 0)))
                }
                let len = min(512, tokens.count - i)
                let rc = tokens.withUnsafeMutableBufferPointer { p in llama_decode(c, llama_batch_get_one(p.baseAddress! + i, Int32(len))) }
                if rc != 0 { return done(.failure(Self.err("AIが文章を読めませんでした（\(rc)）"))) }
                i += len
            }

            let sp = llama_sampler_chain_default_params()
            guard let smpl = llama_sampler_chain_init(sp) else { return done(.failure(Self.err("準備に失敗しました"))) }
            defer { llama_sampler_free(smpl) }
            if let grammar = opts.grammar {
                guard let g = llama_sampler_init_grammar(vocab, grammar, "root") else {
                    return done(.failure(Self.err("出力の形（grammar）を読み込めませんでした")))
                }
                llama_sampler_chain_add(smpl, g)
            }
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
                if k < 0 {
                    buf = [CChar](repeating: 0, count: Int(-k) + 8)
                    k = llama_token_to_piece(vocab, tok, &buf, Int32(buf.count), 0, opts.renderSpecial)
                }
                if k > 0 { pending.append(contentsOf: buf[0..<Int(k)].map { UInt8(bitPattern: $0) }) }
                let s = Self.takeValidUTF8(&pending)
                if !s.isEmpty {
                    if firstMs == 0 { firstMs = elapsed() }
                    onText(s)
                }
                produced += 1
                let rc = withUnsafeMutablePointer(to: &tok) { p in llama_decode(c, llama_batch_get_one(p, 1)) }
                if rc != 0 { finish = "error"; break }
            }
            if !pending.isEmpty { onText(String(decoding: pending, as: UTF8.self)) }
            done(.success(Result(finish: finish, promptTokens: tokens.count, completionTokens: produced, ms: elapsed(), firstMs: firstMs)))
        }
    }

    /// UTF-8 として完結している先頭部分（日本語の1文字が2つのトークンに分かれることがある）。
    static func takeValidUTF8(_ bytes: inout [UInt8]) -> String {
        var cut = bytes.count
        var j = bytes.count - 1
        var back = 0
        while j >= 0 && back < 4 {
            let b = bytes[j]
            if b & 0xC0 != 0x80 {
                let need = b < 0x80 ? 1 : b >= 0xF0 ? 4 : b >= 0xE0 ? 3 : b >= 0xC0 ? 2 : 1
                if j + need > bytes.count { cut = j }
                break
            }
            j -= 1
            back += 1
        }
        if cut <= 0 { return "" }
        let s = String(decoding: bytes[0..<cut], as: UTF8.self)
        bytes.removeFirst(cut)
        return s
    }
}

/// モデルのファイルを Hugging Face から一度だけダウンロードする（ひび手帳と同じ）。
final class ModelDownloader: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    private let url: URL
    private let dest: URL
    private var session: URLSession?
    private var task: URLSessionDownloadTask?
    private var onProgress: ((Int64, Int64) -> Void)?
    private var onDone: ((Error?) -> Void)?
    private var finished = false
    private let lock = NSLock()

    init(url: URL, dest: URL) {
        self.url = url
        self.dest = dest
    }

    func start(progress: @escaping (Int64, Int64) -> Void, done: @escaping (Error?) -> Void) {
        onProgress = progress
        onDone = done
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
        lock.lock()
        if finished { lock.unlock(); return }
        finished = true
        let done = onDone
        onDone = nil
        onProgress = nil
        lock.unlock()
        session?.finishTasksAndInvalidate()
        done?(err)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        onProgress?(totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // 一時ファイルはこの関数を抜けると消えるので、すぐ移す
        if let http = downloadTask.response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            return finish(NSError(domain: "Orbit.LLM", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode)"]))
        }
        do {
            let part = dest.appendingPathExtension("part")
            try? FileManager.default.removeItem(at: part)
            try FileManager.default.moveItem(at: location, to: part)
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: part, to: dest)
            finish(nil)
        } catch {
            finish(error)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error { finish(error) }
    }
}
