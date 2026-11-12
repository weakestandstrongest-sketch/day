import Foundation

struct LLMMessage: Hashable {
    enum Role: String { case system, user, assistant }
    var role: Role
    var content: String
}

/// 各モデルの公式 chat template（まいにち の templates/*.jinja）のうち、文字だけの会話の部分を Swift に移したもの。
/// ツールはテンプレートに渡さず、こちらで文章として渡す（まいにち と同じ）。考える部分はオフ（enable_thinking = false）。
enum ChatTemplate {
    enum Kind: String, Hashable { case gemma4, qwen35, lfm3, llmjp41 }

    /// system は先頭に1つだけ、同じ側が続いたらつなげる、最初は user から。
    static func normalize(_ messages: [LLMMessage]) -> (system: String, turns: [LLMMessage]) {
        let system = messages.filter { $0.role == .system }.map(\.content).joined(separator: "\n\n")
        var turns: [LLMMessage] = []
        for m in messages where m.role != .system {
            if var last = turns.last, last.role == m.role {
                last.content += "\n\n" + m.content
                turns[turns.count - 1] = last
            } else {
                turns.append(m)
            }
        }
        if turns.first?.role == .assistant {
            turns.insert(LLMMessage(role: .user, content: "（会話の続き）"), at: 0)
        }
        return (system, turns)
    }

    static func render(_ kind: Kind, messages: [LLMMessage], bos: String, now: Date = Date()) -> String {
        let (system, turns) = normalize(messages)
        var out = ""
        switch kind {
        case .qwen35:
            if !system.isEmpty { out += "<|im_start|>system\n\(system)<|im_end|>\n" }
            for t in turns {
                let content = t.content.trimmingCharacters(in: .whitespacesAndNewlines)
                out += "<|im_start|>\(t.role.rawValue)\n\(content)<|im_end|>\n"
            }
            out += "<|im_start|>assistant\n<think>\n\n</think>\n\n"

        case .lfm3:
            out += bos
            if !system.isEmpty { out += "<|im_start|>system\n\(system)<|im_end|>\n" }
            for t in turns {
                if t.role == .assistant {
                    out += "<|im_start|>assistant\n<think></think>\(t.content)<|im_end|>\n"
                } else {
                    out += "<|im_start|>user\n\(t.content)<|im_end|>\n"
                }
            }
            out += "<|im_start|>assistant\n<think></think>"

        case .gemma4:
            out += bos
            if !system.isEmpty {
                out += "<|turn>system\n\(system.trimmingCharacters(in: .whitespacesAndNewlines))<turn|>\n"
            }
            for t in turns {
                let role = t.role == .assistant ? "model" : "user"
                out += "<|turn>\(role)\n\(t.content.trimmingCharacters(in: .whitespacesAndNewlines))<turn|>\n"
            }
            out += "<|turn>model\n"

        case .llmjp41:
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            out += "<|start|>system<|message|>You are LLM-jp-4, a large language model trained by LLM-jp.\n"
            out += "Knowledge cutoff: 2025-12\nCurrent date: \(formatter.string(from: now))\n\n"
            out += "Reasoning: low\n\n# Valid channels: analysis, commentary, final. Channel must be included for every message.<|end|>"
            if !system.isEmpty {
                out += "<|start|>developer<|message|># Instructions\n\n\(system)\n\n<|end|>"
            }
            for t in turns {
                if t.role == .assistant {
                    out += "<|start|>assistant<|channel|>final<|message|>\(t.content)<|end|>"
                } else {
                    out += "<|start|>user<|message|>\(t.content)<|end|>"
                }
            }
            out += "<|start|>assistant"
        }
        return out
    }
}

/// <think>…</think>（と Gemma の <|channel>…<channel|>）を答えから取り除く。少しずつ届く文字に使える。
struct ThinkFilter {
    private var buffer = ""
    private var closing: String?
    private let pairs = [("<think>", "</think>"), ("<|channel>", "<channel|>")]

    mutating func feed(_ text: String) -> String {
        buffer += text
        var out = ""
        while true {
            if let close = closing {
                if let r = buffer.range(of: close) {
                    buffer = String(buffer[r.upperBound...])
                    closing = nil
                    continue
                }
                buffer = String(buffer.suffix(close.count - 1))
                return out
            }
            var earliest: (Range<String.Index>, String)?
            for (open, close) in pairs {
                if let r = buffer.range(of: open), earliest == nil || r.lowerBound < earliest!.0.lowerBound {
                    earliest = (r, close)
                }
            }
            if let found = earliest {
                out += buffer[..<found.0.lowerBound]
                buffer = String(buffer[found.0.upperBound...])
                closing = found.1
                continue
            }
            // 書きかけのタグかもしれない末尾は残しておく
            var hold = 0
            for (open, _) in pairs {
                for n in stride(from: min(open.count - 1, buffer.count), to: 0, by: -1) where buffer.hasSuffix(String(open.prefix(n))) {
                    hold = max(hold, n)
                    break
                }
            }
            out += buffer.dropLast(hold)
            buffer = String(buffer.suffix(hold))
            return out
        }
    }

    mutating func finish() -> String {
        defer { buffer = "" }
        return closing == nil ? buffer : ""
    }
}

/// LLM-jp-4.1 のチャンネル形式。final だけが答え、analysis は考えている部分。
enum Harmony {
    static func parse(_ full: String) -> (text: String, reasoning: String) {
        if !full.contains("<|channel|>") && !full.hasPrefix("<|") {
            if let keep = full.range(of: "<|", options: .backwards), !full[keep.lowerBound...].contains("|>") {
                return (String(full[..<keep.lowerBound]), "")
            }
            return (full, "")
        }
        var text = "", reasoning = ""
        let pattern = #"<\|channel\|>([a-z]+)[^<]*?(?:<\|constrain\|>[^<]*)?<\|message\|>([\s\S]*?)(?=<\|end\|>|<\|return\|>|<\|call\|>|<\|start\|>|$)"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return (full, "") }
        let ns = full as NSString
        for m in re.matches(in: full, range: NSRange(location: 0, length: ns.length)) {
            let channel = ns.substring(with: m.range(at: 1))
            var body = ns.substring(with: m.range(at: 2))
            if m.range.location + m.range.length >= ns.length, let cut = body.range(of: "<|", options: .backwards) {
                body = String(body[..<cut.lowerBound])
            }
            if channel == "analysis" { reasoning += body } else { text += body }
        }
        return (text, reasoning)
    }
}
