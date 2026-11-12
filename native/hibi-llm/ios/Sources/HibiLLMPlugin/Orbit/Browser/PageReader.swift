import Foundation

struct PageContent: Decodable {
    let url: String
    let title: String
    let text: String
    let selection: String
    let description: String
}

struct PageSnapshot: Decodable {
    struct Element: Decodable {
        let id: Int
        let tag: String
        let label: String
        let inView: Bool
        let role: String?
        let inputType: String?
        let value: String?
        let checked: Bool?
        let href: String?
        let options: [String]?

        var kind: String {
            if let role { return role }
            switch tag {
            case "a": return "link"
            case "input": return "input[\(inputType ?? "text")]"
            default: return tag
            }
        }

        var line: String {
            var s = "[\(id)]\(inView ? "*" : "") \(kind)"
            if !label.isEmpty { s += " \"\(label)\"" }
            if tag == "input" || tag == "textarea" || tag == "select" { s += " value=\"\(value ?? "")\"" }
            if let checked { s += checked ? " (checked)" : " (unchecked)" }
            if let options, !options.isEmpty { s += " options=[\(options.joined(separator: " | "))]" }
            if let href, !href.isEmpty, !href.lowercased().hasPrefix("javascript") { s += " -> \(href)" }
            return s
        }
    }

    let url: String
    let title: String
    let scrollY: Int
    let scrollHeight: Int
    let viewportHeight: Int
    let elements: [Element]
    let text: String

    var formatted: String {
        var out = """
        URL: \(url)
        タイトル: \(title)
        スクロール位置: \(scrollY) / \(scrollHeight)（表示領域の高さ \(viewportHeight)）

        ## 操作できる要素（* = 画面内に表示中）
        """
        out += "\n" + (elements.isEmpty ? "（なし）" : elements.map(\.line).joined(separator: "\n"))
        out += "\n\n## ページのテキスト\n" + (text.isEmpty ? "（テキストなし）" : text)
        return out
    }
}

enum PageReader {
    static func content(of tab: BrowserTab, maxChars: Int = 40_000) async throws -> PageContent {
        let json = try await tab.runJS(PageScripts.extractContent, arguments: ["maxChars": maxChars])
        return try JSONDecoder().decode(PageContent.self, from: Data(json.utf8))
    }

    static func snapshot(of tab: BrowserTab) async throws -> PageSnapshot {
        let json = try await tab.runJS(PageScripts.snapshot)
        return try JSONDecoder().decode(PageSnapshot.self, from: Data(json.utf8))
    }

    struct ActionResult: Decodable {
        let ok: Bool
        let error: String?
    }

    static func perform(_ script: String, on tab: BrowserTab, arguments: [String: Any]) async throws -> ActionResult {
        let json = try await tab.runJS(script, arguments: arguments)
        return try JSONDecoder().decode(ActionResult.self, from: Data(json.utf8))
    }
}
