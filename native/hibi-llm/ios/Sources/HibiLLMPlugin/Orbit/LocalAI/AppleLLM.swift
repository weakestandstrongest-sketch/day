import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Apple Intelligence（iOS 26 の Foundation Models）。ダウンロードなしで使える。
enum AppleLLM {
    /// "available" か、使えない理由
    static func availability() -> String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return "available"
            case .unavailable(let reason):
                switch reason {
                case .deviceNotEligible: return "deviceNotEligible"
                case .appleIntelligenceNotEnabled: return "appleIntelligenceNotEnabled"
                case .modelNotReady: return "modelNotReady"
                @unknown default: return "unavailable"
                }
            @unknown default:
                return "unavailable"
            }
        }
        return "osTooOld"
        #else
        return "osTooOld"
        #endif
    }

    static func explain(_ state: String) -> String {
        switch state {
        case "available": return ""
        case "deviceNotEligible": return "このiPhoneは Apple Intelligence に対応していません。ほかのモデルを選んでください。"
        case "appleIntelligenceNotEnabled": return "Apple Intelligence がオフです。iPhoneの 設定 →「Apple Intelligence と Siri」でオンにしてください。"
        case "modelNotReady": return "Apple Intelligence のモデルを準備中です。Wi-Fi と電源につないで、しばらくしてからお試しください。"
        case "osTooOld": return "Apple Intelligence は iOS 26 以降で使えます。"
        default: return "Apple Intelligence を使えません。ほかのモデルを選んでください。"
        }
    }

    /// system はインストラクションに、残りは1つのプロンプトにまとめる（まいにち と同じ）。
    static func split(_ messages: [LLMMessage]) -> (instructions: String, prompt: String) {
        var (system, turns) = ChatTemplate.normalize(messages)
        let last = turns.popLast()
        let history = turns.map { "\($0.role == .user ? "ユーザー" : "あなた"): \($0.content)" }.joined(separator: "\n")
        let question = last?.content ?? ""
        if history.isEmpty { return (system, question) }
        system = system.trimmingCharacters(in: .whitespacesAndNewlines)
        return (system, "これまでの会話:\n\(history)\n\nユーザー: \(question)")
    }

    static func generate(messages: [LLMMessage], temperature: Double?, maxTokens: Int?,
                         onText: @escaping (String) -> Void) async throws {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let state = availability()
            guard state == "available" else { throw LocalAIError.unavailable(explain(state)) }
            let (instructions, prompt) = split(messages)
            let session = LanguageModelSession(instructions: instructions)
            let options = GenerationOptions(temperature: temperature, maximumResponseTokens: maxTokens)
            var sent = ""
            do {
                for try await snapshot in session.streamResponse(to: prompt, options: options) {
                    if Task.isCancelled { break }
                    let text = snapshot.content
                    // スナップショットはそれまでの答え全体なので、増えた分だけ送る
                    if text.hasPrefix(sent) {
                        let delta = String(text.dropFirst(sent.count))
                        if !delta.isEmpty { onText(delta) }
                    }
                    sent = text
                }
            } catch is CancellationError {
                return
            } catch {
                let s = String(describing: error)
                if s.contains("exceededContextWindowSize") { throw LocalAIError.tooLong }
                if s.contains("guardrailViolation") || s.contains("refusal") {
                    throw LocalAIError.failed("Apple Intelligence がこの内容には答えられませんでした。")
                }
                if s.contains("unsupportedLanguageOrLocale") {
                    throw LocalAIError.failed("Apple Intelligence がこの言語に対応していません。")
                }
                throw LocalAIError.failed("Apple Intelligence で答えられませんでした（\(error.localizedDescription)）")
            }
            return
        }
        #endif
        throw LocalAIError.unavailable(explain("osTooOld"))
    }
}
