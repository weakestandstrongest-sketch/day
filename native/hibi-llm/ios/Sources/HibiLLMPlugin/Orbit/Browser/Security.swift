import Foundation
import WebKit

/// セキュリティの設定（設定画面で切り替え。既定はすべてオン）。
/// WebView の処理から直接読むので、UserDefaults の値をそのまま見る。
enum SecurityPrefs {
    static let httpsKey = "sec.httpsUpgrade"
    static let dangerousKey = "sec.blockDangerous"
    static let loginKey = "sec.warnInsecureLogin"
    static let appSwitchKey = "sec.confirmAppSwitch"

    private static func flag(_ key: String) -> Bool {
        OrbitEmbed.defaults.object(forKey: key) as? Bool ?? true
    }
    static var httpsUpgrade: Bool { flag(httpsKey) }
    static var blockDangerous: Bool { flag(dangerousKey) }
    static var warnInsecureLogin: Bool { flag(loginKey) }
    static var confirmAppSwitch: Bool { flag(appSwitchKey) }
}

/// ページの中からの知らせ（暗号化されていないページのパスワード欄など）を受け取る。
@MainActor
final class SecurityBridge: NSObject, WKScriptMessageHandler {
    var onNotice: ((WKWebView?, String) -> Void)?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let kind = message.body as? String { onNotice?(message.webView, kind) }
    }
}

/// 危険なサイト（マルウェア・フィッシング・詐欺・勝手にマイニングするもの）の判定と、警告の画面。
enum DangerousSites {
    /// 内蔵の一覧：ブラウザで勝手に仮想通貨を掘るもの、詐欺広告・偽のウイルス警告でよく使われるもの
    static let builtIn: Set<String> = [
        // クリプトジャッキング
        "coinhive.com", "coin-hive.com", "authedmine.com", "crypto-loot.com", "cryptoloot.pro", "jsecoin.com", "minero.cc",
        "webminepool.com", "coinimp.com", "cryptonoter.com", "monerominer.rocks", "ppoi.org", "projectpoi.com",
        "coinerra.com", "coin-have.com", "minemytraffic.com", "load.jsecoin.com", "webmine.cz", "mineralt.io",
        "kissdoujin.com", "freecontent.bid", "hashforcash.us", "cloudcoins.co", "gridcash.net", "afminer.com",
        // 偽のウイルス警告・当選詐欺・強制リダイレクトでよく使われる配信元
        "adsterratools.com", "highperformanceformat.com", "profitabledisplaynetwork.com", "pl-go.com", "realsrv.com",
        "a-ads.com", "adf.ly", "shorte.st", "linkvertise.com", "ouo.io", "bc.vc", "clk.sh", "sh.st",
        "galaksion.com", "admaven.com", "ad-maven.com", "zeropark.com", "evadav.com", "pushub.net", "notix.io",
        "datsdk.com", "rollerads.com", "tapinfluence.com", "trafficstars.com", "tsyndicate.com", "monetag.com",
        "mobiright.com", "bidvertiser.com", "popmyads.com", "clickaine.com", "adnium.com", "wmadv.net",
    ]

    /// オンラインの一覧（脅威情報）。上から順に試して、取れたものを使う。
    private static let sources = [
        "https://urlhaus.abuse.ch/downloads/hostfile/",
        "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/tif.mini.txt",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/tif.mini.txt",
    ]

    @MainActor private static var online: Set<String> = []
    @MainActor private(set) static var onlineCount = 0

    private static var file: URL {
        let base = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("dangerous-sites.txt")
    }

    static func fileDate() -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: file.path))?[.modificationDate] as? Date
    }

    /// 一覧を読み込む（1日に1回まで取りに行く）。取ってくるのと読むのは裏で行い、画面を止めない。
    @MainActor static func load(forceRefresh: Bool = false) async {
        let hosts = await Task.detached(priority: .utility) { () -> Set<String> in
            await refreshFile(forceRefresh: forceRefresh)
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            return Set(text.split(separator: "\n").map(String.init))
        }.value
        online = hosts
        onlineCount = hosts.count
    }

    private static func refreshFile(forceRefresh: Bool) async {
        let fresh = fileDate().map { Date().timeIntervalSince($0) < 24 * 3600 } ?? false
        guard forceRefresh || !fresh else { return }
        var merged: [String] = []
        var gotHagezi = false
        for source in sources {
            if gotHagezi, source.contains("hagezi") { continue } // GitHub と jsDelivr は同じ中身
            guard let url = URL(string: source) else { continue }
            var request = URLRequest(url: url)
            request.timeoutInterval = 25
            if let (data, response) = try? await URLSession.shared.data(for: request),
               (response as? HTTPURLResponse)?.statusCode == 200, data.count > 500 {
                merged += HostList.parse(String(decoding: data, as: UTF8.self), limit: 300_000)
                if source.contains("hagezi") { gotHagezi = true }
            }
        }
        if merged.count > 100 {
            try? merged.joined(separator: "\n").write(to: file, atomically: true, encoding: .utf8)
        }
    }

    /// このホスト（またはその親のドメイン）が危険な一覧に入っているか。
    @MainActor static func isDangerous(_ host: String?) -> Bool {
        guard var h = host?.lowercased(), !h.isEmpty else { return false }
        while true {
            if builtIn.contains(h) || online.contains(h) { return true }
            guard let dot = h.firstIndex(of: ".") else { return false }
            h = String(h[h.index(after: dot)...])
            if !h.contains(".") { return false }
        }
    }

    /// Punycode（xn--）のドメイン：本物そっくりに見える別の文字のドメインのことがある
    static func looksLikeHomograph(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host.split(separator: ".").contains { $0.hasPrefix("xn--") }
    }
}

/// 一覧のファイルの読み方（hosts 形式・1行1ドメイン・広告ブロックの ||domain^ 形式のどれでも）。
enum HostList {
    static func parse(_ text: String, limit: Int) -> [String] {
        var out: [String] = []
        for raw in text.split(whereSeparator: \.isNewline) {
            var line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("#") || line.hasPrefix("!") || line.hasPrefix("[") { continue }
            if let hash = line.firstIndex(of: "#") { line = String(line[..<hash]).trimmingCharacters(in: .whitespaces) }
            let parts = line.split(whereSeparator: { $0 == " " || $0 == "\t" })
            guard var host = parts.last.map(String.init) else { continue }
            if parts.count > 1, let first = parts.first, !["0.0.0.0", "127.0.0.1", "::1", "::"].contains(String(first)) { continue }
            if host.hasPrefix("||") { host.removeFirst(2) }
            if host.hasSuffix("^") { host.removeLast() }
            if host.hasPrefix("*.") { host.removeFirst(2) }
            host = host.lowercased()
            guard host.count >= 4, host.count <= 120, host.contains("."), host != "localhost",
                  host.range(of: "^[a-z0-9.-]+$", options: .regularExpression) != nil else { continue }
            out.append(host)
            if out.count >= limit { break }
        }
        return out
    }
}

/// 警告の画面（危険なサイト・暗号化できなかったサイト）。ボタンは orbit-action: の URL で知らせる。
enum WarningPage {
    static func html(title: String, message: String, detail: String, primary: (String, String), secondary: (String, String)?) -> String {
        func esc(_ s: String) -> String {
            s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
        }
        return """
        <!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
        <title>\(esc(title))</title><style>
        :root{color-scheme:light dark}
        body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:16px -apple-system,"Hiragino Sans",sans-serif;background:#141416;color:#f2f2f2}
        @media (prefers-color-scheme:light){body{background:#f6f6f5;color:#151516}.d{color:#666!important}.b2{color:#151516!important;border-color:#ccc!important}}
        main{max-width:420px;padding:32px 26px}
        .i{width:64px;height:64px;border-radius:50%;background:#d6453d;display:grid;place-items:center;margin-bottom:22px}
        .i svg{width:34px;height:34px;fill:#fff}
        h1{font-size:24px;line-height:1.3;margin:0 0 12px}
        p{line-height:1.7;margin:0 0 10px}
        .d{color:#999;font-size:13px;word-break:break-all}
        a{display:block;text-align:center;text-decoration:none;border-radius:16px;padding:15px;margin-top:12px;font-weight:600}
        .b1{background:#55b8c7;color:#062226;margin-top:28px}
        .b2{border:1px solid #444;color:#f2f2f2;font-weight:500;font-size:14px}
        </style></head><body><main>
        <div class="i"><svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm0 6 .01 0 0 7h-.02L12 8zm-1 9h2v2h-2v-2z"/></svg></div>
        <h1>\(esc(title))</h1><p>\(esc(message))</p><p class="d">\(esc(detail))</p>
        <a class="b1" href="\(esc(primary.1))">\(esc(primary.0))</a>
        \(secondary.map { "<a class=\"b2\" href=\"\(esc($0.1))\">\(esc($0.0))</a>" } ?? "")
        </main></body></html>
        """
    }

    static func action(_ name: String, _ url: URL) -> String {
        var c = URLComponents()
        c.scheme = "orbit-action"
        c.host = name
        c.queryItems = [URLQueryItem(name: "u", value: url.absoluteString)]
        return c.url?.absoluteString ?? "orbit-action://back"
    }
}

/// ページに入れるスクリプト：暗号化されていないページのパスワード欄を見つけたら知らせる。
enum SecurityScript {
    static let source = """
    (function(){
      if (location.protocol !== 'http:') return;
      var told = false;
      function check(){
        if (told) return;
        if (document.querySelector('input[type="password"]')) {
          told = true;
          try { window.webkit.messageHandlers.orbitSecurity.postMessage('insecure-login'); } catch (e) {}
        }
      }
      check();
      new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true });
    })();
    """
}
