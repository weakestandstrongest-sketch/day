import Foundation

/// Safari・Chrome などが書き出すブックマークの HTML（Netscape 形式）を読む。
enum BookmarkImport {
    struct Folder: Identifiable, Hashable {
        let id = UUID()
        var name: String
        var items: [SpeedDialItem]
    }

    /// Safari の「お気に入り」やブックマークバーにあたるフォルダの名前
    static let favoriteNames: Set<String> = [
        "favorites", "favourites", "お気に入り", "bookmarksbar", "bookmarks bar", "ブックマークバー",
        "お気に入りバー", "favorites bar", "ブックマーク バー",
    ]

    static func parse(_ html: String) -> [Folder] {
        var folders: [Folder] = []
        var stack: [Int] = []          // indexes into folders
        var pendingName: String?
        let loose = Folder(name: "その他のブックマーク", items: [])
        folders.append(loose)

        let tag = try? NSRegularExpression(pattern: #"<(/?)(DL|H3|A)\b([^>]*)>(?:([^<]*)</(?:H3|A)>)?"#, options: [.caseInsensitive])
        let href = try? NSRegularExpression(pattern: #"HREF\s*=\s*"([^"]*)""#, options: [.caseInsensitive])
        guard let tag, let href else { return [] }
        let ns = html as NSString

        for match in tag.matches(in: html, range: NSRange(location: 0, length: ns.length)) {
            let closing = ns.substring(with: match.range(at: 1)) == "/"
            let name = ns.substring(with: match.range(at: 2)).uppercased()
            let attrs = match.range(at: 3).location != NSNotFound ? ns.substring(with: match.range(at: 3)) : ""
            let text = match.range(at: 4).location != NSNotFound ? decode(ns.substring(with: match.range(at: 4))) : ""

            switch (name, closing) {
            case ("H3", false):
                pendingName = text.isEmpty ? "フォルダ" : text
            case ("DL", false):
                if let pending = pendingName {
                    folders.append(Folder(name: pending, items: []))
                    stack.append(folders.count - 1)
                    pendingName = nil
                } else if !stack.isEmpty {
                    stack.append(stack.last!)
                }
            case ("DL", true):
                if !stack.isEmpty { stack.removeLast() }
            case ("A", false):
                let a = attrs as NSString
                guard let m = href.firstMatch(in: attrs, range: NSRange(location: 0, length: a.length)) else { continue }
                let url = decode(a.substring(with: m.range(at: 1)))
                guard url.hasPrefix("http://") || url.hasPrefix("https://") else { continue }
                let title = text.isEmpty ? URLParser.displayHost(URL(string: url)) : text
                folders[stack.last ?? 0].items.append(SpeedDialItem(title: title, url: url))
            default:
                break
            }
        }
        // 中身のあるフォルダだけ。お気に入りにあたるものを先頭に
        return folders.filter { !$0.items.isEmpty }.sorted { a, b in
            let fa = isFavorites(a.name), fb = isFavorites(b.name)
            return fa != fb ? fa : false
        }
    }

    static func isFavorites(_ name: String) -> Bool {
        favoriteNames.contains(name.lowercased().trimmingCharacters(in: .whitespaces))
    }

    private static func decode(_ s: String) -> String {
        var out = s
        for (k, v) in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&#x27;", "'"), ("&nbsp;", " ")] {
            out = out.replacingOccurrences(of: k, with: v)
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
