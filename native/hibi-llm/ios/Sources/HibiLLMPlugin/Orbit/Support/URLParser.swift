import Foundation

enum URLParser {
    /// Returns a URL if the omnibox input looks like an address rather than a query.
    static func url(from input: String) -> URL? {
        let s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty, !s.contains(" ") else { return nil }

        if let url = URL(string: s), let scheme = url.scheme?.lowercased() {
            if ["http", "https"].contains(scheme), url.host != nil { return url }
            if scheme == "about" { return url }
        }

        let hostLike = #"^(localhost|(\d{1,3}\.){3}\d{1,3}|([A-Za-z0-9-]+\.)+[A-Za-z]{2,})(:\d+)?([/?#].*)?$"#
        if s.range(of: hostLike, options: .regularExpression) != nil {
            return URL(string: "https://" + s)
        }
        return nil
    }

    static func searchURL(for query: String, engine: SearchEngine) -> URL? {
        var components = URLComponents(string: engine.baseURL)
        components?.queryItems = [URLQueryItem(name: "q", value: query)]
        return components?.url
    }

    static func displayHost(_ url: URL?) -> String {
        guard let url else { return "" }
        var host = url.host ?? url.absoluteString
        if host.hasPrefix("www.") { host.removeFirst(4) }
        return host
    }
}

enum SearchEngine: String, CaseIterable, Identifiable, Codable {
    case google, duckDuckGo, bing

    var id: String { rawValue }

    var name: String {
        switch self {
        case .google: return "Google"
        case .duckDuckGo: return "DuckDuckGo"
        case .bing: return "Bing"
        }
    }

    var baseURL: String {
        switch self {
        case .google: return "https://www.google.com/search"
        case .duckDuckGo: return "https://duckduckgo.com/"
        case .bing: return "https://www.bing.com/search"
        }
    }
}
