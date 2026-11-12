import Foundation

struct AnthropicError: LocalizedError {
    let status: Int
    let type: String
    let message: String

    var errorDescription: String? {
        switch status {
        case 401: return "APIキーが無効です。設定を確認してください。"
        case 429: return "レート制限に達しました。しばらく待ってから再試行してください。"
        case 529: return "APIが混雑しています。しばらく待ってから再試行してください。"
        default: return "APIエラー (\(status) \(type)): \(message)"
        }
    }
}

/// One assistant response, accumulated from the SSE stream.
struct AssistantTurn {
    /// Content blocks exactly as streamed (text, thinking + signature, tool_use, server tool blocks, fallback…).
    var content: [JSONValue]
    var stopReason: String?
    var model: String?
    /// tool_use blocks whose streamed input could not be parsed as a JSON object.
    var invalidToolUseIDs: Set<String>
}

enum StreamEvent: Sendable {
    case blockStarted(type: String, name: String?)
    case textDelta(String)
}

/// Minimal Claude Messages API client over raw HTTP with SSE streaming.
/// (There is no official Anthropic SDK for Swift.)
final class AnthropicClient: @unchecked Sendable {
    static let apiVersion = "2026-10-21"

    private let apiKey: String
    private let baseURL: URL
    private let betas: [String]
    private let session: URLSession

    init(apiKey: String, baseURL: URL, betas: [String] = []) {
        self.apiKey = apiKey
        self.baseURL = baseURL
        self.betas = betas
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300
        config.timeoutIntervalForResource = 1800
        session = URLSession(configuration: config)
    }

    func streamMessage(body: JSONValue, onEvent: @escaping @MainActor (StreamEvent) -> Void) async throws -> AssistantTurn {
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/messages"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("text/event-stream", forHTTPHeaderField: "accept")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(Self.apiVersion, forHTTPHeaderField: "anthropic-version")
        if !betas.isEmpty {
            request.setValue(betas.joined(separator: ","), forHTTPHeaderField: "anthropic-beta")
        }
        request.httpBody = try body.encoded()

        var attempt = 0
        while true {
            let (bytes, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw AnthropicError(status: 0, type: "network", message: "不正なレスポンス")
            }
            if http.statusCode == 200 {
                return try await parseStream(bytes, onEvent: onEvent)
            }

            var data = Data()
            for try await byte in bytes { data.append(byte) }
            let error = Self.makeError(status: http.statusCode, data: data)

            let retryable = [408, 429, 500, 502, 503, 504, 529].contains(http.statusCode)
            if retryable && attempt < 2 {
                attempt += 1
                let retryAfter = http.value(forHTTPHeaderField: "retry-after").flatMap(Double.init) ?? pow(2, Double(attempt))
                try await Task.sleep(nanoseconds: UInt64(min(max(retryAfter, 1), 20) * 1_000_000_000))
                continue
            }
            throw error
        }
    }

    private static func makeError(status: Int, data: Data) -> AnthropicError {
        if let json = try? JSONValue.decode(data), let err = json["error"] {
            return AnthropicError(status: status,
                                  type: err["type"]?.stringValue ?? "error",
                                  message: err["message"]?.stringValue ?? "")
        }
        return AnthropicError(status: status, type: "http_error", message: String(decoding: data.prefix(500), as: UTF8.self))
    }

    private func parseStream(_ bytes: URLSession.AsyncBytes,
                             onEvent: @escaping @MainActor (StreamEvent) -> Void) async throws -> AssistantTurn {
        var blocks: [Int: [String: JSONValue]] = [:]
        var partialJSON: [Int: String] = [:]
        var invalid: Set<String> = []
        var stopReason: String?
        var model: String?

        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue }
            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            guard !payload.isEmpty, let event = try? JSONValue.decode(Data(payload.utf8)) else { continue }

            switch event["type"]?.stringValue {
            case "message_start":
                model = event["message"]?["model"]?.stringValue

            case "content_block_start":
                guard let index = event["index"]?.intValue, let block = event["content_block"]?.objectValue else { continue }
                let type = block["type"]?.stringValue ?? ""
                if type == "tool_use" || type == "server_tool_use" { partialJSON[index] = "" }
                blocks[index] = block
                await onEvent(.blockStarted(type: type, name: block["name"]?.stringValue))

            case "content_block_delta":
                guard let index = event["index"]?.intValue, let delta = event["delta"], var block = blocks[index] else { continue }
                switch delta["type"]?.stringValue {
                case "text_delta":
                    let text = delta["text"]?.stringValue ?? ""
                    block["text"] = .string((block["text"]?.stringValue ?? "") + text)
                    await onEvent(.textDelta(text))
                case "thinking_delta":
                    block["thinking"] = .string((block["thinking"]?.stringValue ?? "") + (delta["thinking"]?.stringValue ?? ""))
                case "signature_delta":
                    block["signature"] = delta["signature"] ?? .string("")
                case "input_json_delta":
                    partialJSON[index, default: ""] += delta["partial_json"]?.stringValue ?? ""
                case "citations_delta":
                    if let citation = delta["citation"] {
                        var list = block["citations"]?.arrayValue ?? []
                        list.append(citation)
                        block["citations"] = .array(list)
                    }
                default:
                    break
                }
                blocks[index] = block

            case "content_block_stop":
                guard let index = event["index"]?.intValue, var block = blocks[index], let raw = partialJSON[index] else { continue }
                let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.isEmpty {
                    if block["input"] == nil { block["input"] = .object([:]) }
                } else if let parsed = try? JSONValue.decode(Data(trimmed.utf8)), parsed.objectValue != nil {
                    block["input"] = parsed
                } else {
                    // Eager input streaming does not validate JSON; report it back as INVALID_JSON.
                    block["input"] = .object([:])
                    if let id = block["id"]?.stringValue { invalid.insert(id) }
                }
                blocks[index] = block
                partialJSON[index] = nil

            case "message_delta":
                if let reason = event["delta"]?["stop_reason"]?.stringValue { stopReason = reason }

            case "error":
                throw AnthropicError(status: 0,
                                     type: event["error"]?["type"]?.stringValue ?? "stream_error",
                                     message: event["error"]?["message"]?.stringValue ?? "ストリーム中にエラーが発生しました")
            default:
                break
            }
        }

        let content = blocks.keys.sorted().compactMap { blocks[$0].map(JSONValue.object) }
        return AssistantTurn(content: content, stopReason: stopReason, model: model, invalidToolUseIDs: invalid)
    }
}
