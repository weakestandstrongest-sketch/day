import Foundation
import Observation
import UIKit
import WebKit

/// One browser tab backed by its own WKWebView.
@MainActor
@Observable
final class BrowserTab: Identifiable {
    let id: UUID
    var title: String
    var url: URL?
    var isLoading = false
    var progress: Double = 0
    var canGoBack = false
    var canGoForward = false
    var thumbnail: UIImage? = nil
    var spaceID: UUID
    var isPinned = false
    var lastViewed = Date()
    /// パソコン用の表示を頼んでいるか
    var desktopMode = false
    let isPrivate: Bool

    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored private var coordinator: TabCoordinator?
    @ObservationIgnored private var observations: [NSKeyValueObservation] = []
    /// まだ読み込んでいない（復元したタブは、開くまで読み込まない）
    @ObservationIgnored private var pendingLoad = false
    @ObservationIgnored private var lastScrollY: CGFloat = 0
    /// Called when the committed URL changes, so the store can persist the session.
    @ObservationIgnored var onNavigationCommitted: (() -> Void)?
    /// Called when a page has finished loading (for history).
    @ObservationIgnored var onPageFinished: ((URL, String) -> Void)?
    /// Called when the user scrolls the page down (true) or up (false).
    @ObservationIgnored var onScroll: ((Bool) -> Void)?
    /// セキュリティの知らせ（画面の下に出す）
    @ObservationIgnored var onSecurityNotice: ((String) -> Void)?
    /// HTTPS に切り替えて開いているサイト（つながらなければ警告を出す）
    @ObservationIgnored fileprivate var upgradedHosts: Set<String> = []
    /// いつ HTTPS に切り替えたか（https から http へ戻されたときに、行ったり来たりしないように）
    @ObservationIgnored fileprivate var upgradedAt: [String: Date] = [:]
    /// 利用者が「暗号化なしで開く」を選んだサイト
    @ObservationIgnored fileprivate var allowedHTTPHosts: Set<String> = []
    /// 利用者が「それでも開く」を選んだ危険なサイト
    @ObservationIgnored fileprivate var allowedDangerousHosts: Set<String> = []
    /// 今のページについて、知らせを出したかどうか（何度も出さない）
    @ObservationIgnored fileprivate var noticedHost: String?

    init(id: UUID = UUID(), url: URL?, configuration: WKWebViewConfiguration, loadNow: Bool = true,
         spaceID: UUID = UUID(), title: String? = nil) {
        self.id = id
        self.url = url
        self.spaceID = spaceID
        self.isPrivate = spaceID == BrowserSpace.privateID
        let host = URLParser.displayHost(url)
        self.title = title ?? (host.isEmpty ? "新しいタブ" : host)
        self.webView = WKWebView(frame: .zero, configuration: configuration)
        // 左端・右端のスワイプはサイドバーと AI に使う（戻るはカプセルの ‹ とサイドバー）
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = true
        webView.isFindInteractionEnabled = true
        if #available(iOS 16.4, *) { webView.isInspectable = true }

        let coordinator = TabCoordinator(tab: self)
        self.coordinator = coordinator
        webView.navigationDelegate = coordinator
        webView.uiDelegate = coordinator
        coordinator.installRefreshControl(on: webView)

        observeWebView()
        if let url {
            if loadNow { webView.load(URLRequest(url: url)) } else { pendingLoad = true }
        }
    }

    /// 復元したタブを開いたときに読み込む。
    func activate() {
        lastViewed = Date()
        if pendingLoad, let url {
            pendingLoad = false
            webView.load(URLRequest(url: url))
        }
    }

    var isBlank: Bool { url == nil }
    var displayTitle: String { title.isEmpty ? "新しいタブ" : title }

    func load(_ url: URL) {
        self.url = url
        pendingLoad = false
        webView.load(URLRequest(url: url))
    }

    func reload() { webView.reload() }

    func findInPage() {
        webView.findInteraction?.presentFindNavigator(showingReplace: false)
    }

    func toggleDesktopMode() {
        desktopMode.toggle()
        webView.customUserAgent = desktopMode
            ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
            : nil
        webView.reload()
    }
    func stopLoading() { webView.stopLoading() }
    func goBack() { if webView.canGoBack { webView.goBack() } }
    func goForward() { if webView.canGoForward { webView.goForward() } }

    /// Waits until the page has (mostly) finished loading. Used by the agent after actions.
    func waitForLoad(timeout: TimeInterval = 12) async {
        try? await Task.sleep(nanoseconds: 450_000_000)
        let deadline = Date().addingTimeInterval(timeout)
        while webView.isLoading && Date() < deadline {
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        try? await Task.sleep(nanoseconds: 350_000_000)
    }

    /// Runs a JavaScript function body in an isolated content world. The body must return a string.
    func runJS(_ body: String, arguments: [String: Any] = [:]) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            webView.callAsyncJavaScript(body, arguments: arguments, in: nil, in: .defaultClient, completionHandler: { result in
                switch result {
                case .success(let value):
                    continuation.resume(returning: (value as? String) ?? "")
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            })
        }
    }

    func captureThumbnail() async {
        guard !isBlank, webView.bounds.width > 0 else { return }
        let config = WKSnapshotConfiguration()
        config.snapshotWidth = 360
        let image: UIImage? = await withCheckedContinuation { continuation in
            webView.takeSnapshot(with: config, completionHandler: { image, _ in
                continuation.resume(returning: image)
            })
        }
        if let image { thumbnail = image }
    }

    // MARK: State sync

    private func observeWebView() {
        let handler: (WKWebView) -> Void = { [weak self] _ in
            MainActor.assumeIsolated { self?.syncFromWebView() }
        }
        observations = [
            webView.observe(\.title, options: [.new]) { wv, _ in handler(wv) },
            webView.observe(\.url, options: [.new]) { wv, _ in handler(wv) },
            webView.observe(\.isLoading, options: [.new]) { wv, _ in handler(wv) },
            webView.observe(\.estimatedProgress, options: [.new]) { wv, _ in handler(wv) },
            webView.observe(\.canGoBack, options: [.new]) { wv, _ in handler(wv) },
            webView.observe(\.canGoForward, options: [.new]) { wv, _ in handler(wv) },
            webView.scrollView.observe(\.contentOffset, options: [.new]) { [weak self] scrollView, _ in
                let y = scrollView.contentOffset.y
                let dragging = scrollView.isDragging || scrollView.isDecelerating
                MainActor.assumeIsolated { self?.scrolled(to: y, dragging: dragging) }
            },
        ]
    }

    private func scrolled(to y: CGFloat, dragging: Bool) {
        let delta = y - lastScrollY
        guard dragging, abs(delta) > 14 else {
            if !dragging { lastScrollY = y }
            return
        }
        lastScrollY = y
        if y < 40 {
            onScroll?(false)
        } else {
            onScroll?(delta > 0)
        }
    }

    fileprivate func syncFromWebView() {
        let current = webView.url
        if let current, current.absoluteString != "about:blank" {
            if url != current { url = current }
        }
        if let t = webView.title, !t.isEmpty {
            title = t
        } else if let url {
            title = URLParser.displayHost(url)
        }
        isLoading = webView.isLoading
        progress = webView.estimatedProgress
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
    }

    fileprivate func didCommitNavigation() {
        syncFromWebView()
        onNavigationCommitted?()
    }

    fileprivate func didFinishNavigation() {
        syncFromWebView()
        onNavigationCommitted?()
        if let url, !isPrivate { onPageFinished?(url, displayTitle) }
    }
}

/// WKWebView delegates for a tab.
@MainActor
final class TabCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    weak var tab: BrowserTab?
    private let refreshControl = UIRefreshControl()

    init(tab: BrowserTab) {
        self.tab = tab
        super.init()
    }

    func installRefreshControl(on webView: WKWebView) {
        refreshControl.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl
    }

    @objc private func pullToRefresh() {
        tab?.reload()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshControl.endRefreshing()
        tab?.didFinishNavigation()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
        // HTTPS に切り替えて開こうとしたサイトがつながらなかった → 暗号化されていないことを知らせて、選んでもらう
        let ns = error as NSError
        guard let tab, ns.domain == NSURLErrorDomain,
              let failed = (ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? webView.url,
              failed.scheme == "https", let host = failed.host?.lowercased(), tab.upgradedHosts.contains(host) else { return }
        let secureErrors: Set<Int> = [NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateUntrusted,
                                      NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid, NSURLErrorCannotConnectToHost,
                                      NSURLErrorTimedOut, NSURLErrorNetworkConnectionLost, NSURLErrorClientCertificateRejected]
        guard secureErrors.contains(ns.code) else { return }
        var plain = URLComponents(url: failed, resolvingAgainstBaseURL: false)
        plain?.scheme = "http"
        guard let http = plain?.url else { return }
        let html = WarningPage.html(
            title: "このサイトは暗号化されていません",
            message: "このサイトは安全な接続（HTTPS）に対応していません。送った内容（パスワードやカードの番号など）が、途中で盗み見られるおそれがあります。",
            detail: host,
            primary: ("戻る", "orbit-action://back"),
            secondary: ("暗号化なしで開く（おすすめしません）", WarningPage.action("allow-http", http)))
        webView.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let tab, let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return .allow }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true

        // 警告の画面のボタン
        if scheme == "orbit-action" {
            // 警告の画面（about:blank に描いたもの）からだけ受け付ける。ふつうのページが同じリンクを作っても無視する
            guard webView.url == nil || webView.url?.absoluteString == "about:blank" else { return .cancel }
            let target = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "u" }?.value.flatMap { URL(string: $0) }
            switch url.host {
            case "allow-http":
                if let target, let host = target.host?.lowercased() { tab.allowedHTTPHosts.insert(host); tab.load(target) }
            case "allow-danger":
                if let target, let host = target.host?.lowercased() { tab.allowedDangerousHosts.insert(host); tab.load(target) }
            default:
                if webView.canGoBack { webView.goBack() } else { webView.load(URLRequest(url: URL(string: "about:blank")!)) }
            }
            return .cancel
        }

        let webSchemes: Set<String> = ["http", "https", "about", "data", "blob", "javascript"]
        guard webSchemes.contains(scheme) else {
            // tel:, mailto:, 地図, App Store など：指で押したときだけ。広告が勝手にアプリや App Store へ飛ばすのは止める
            guard navigationAction.navigationType == .linkActivated, mainFrame || navigationAction.targetFrame == nil else {
                tab.onSecurityNotice?("ページが勝手にほかのアプリを開こうとしたので止めました")
                return .cancel
            }
            if SecurityPrefs.confirmAppSwitch, !["tel", "mailto", "sms", "facetime", "facetime-audio"].contains(scheme) {
                guard await confirmOpenApp(url) else { return .cancel }
            }
            _ = await UIApplication.shared.open(url)
            return .cancel
        }

        guard scheme == "http" || scheme == "https", let host = url.host?.lowercased() else { return .allow }

        // 危険なサイト（マルウェア・フィッシング・詐欺）
        if SecurityPrefs.blockDangerous, !tab.allowedDangerousHosts.contains(host), DangerousSites.isDangerous(host) {
            if mainFrame {
                let html = WarningPage.html(
                    title: "危険なサイトをブロックしました",
                    message: "このサイトは、ウイルスを配ったり、パスワードやカードの情報をだまし取ったりするサイトとして報告されています。",
                    detail: host,
                    primary: ("安全なところへ戻る", "orbit-action://back"),
                    secondary: ("危険を理解して開く", WarningPage.action("allow-danger", url)))
                webView.loadHTMLString(html, baseURL: nil)
            }
            return .cancel
        }

        // HTTPS へ切り替える（http のままのページは、通信を盗み見られたり書き換えられたりする）
        if scheme == "http", mainFrame, SecurityPrefs.httpsUpgrade, !tab.allowedHTTPHosts.contains(host), !Self.isLocal(host) {
            var secure = URLComponents(url: url, resolvingAgainstBaseURL: false)
            secure?.scheme = "https"
            if secure?.port == 80 { secure?.port = nil }
            // さっき HTTPS にしたのに、サイトが http へ戻してきた → 切り替えをくり返さず、暗号化されていないことを知らせる
            if navigationAction.navigationType == .other, let at = tab.upgradedAt[host], Date().timeIntervalSince(at) < 15 {
                tab.upgradedAt[host] = nil
                let html = WarningPage.html(
                    title: "このサイトは暗号化されていません",
                    message: "このサイトは安全な接続（HTTPS）を使わず、暗号化されていない接続に戻してきました。パスワードやカードの番号は入れないでください。",
                    detail: host,
                    primary: ("戻る", "orbit-action://back"),
                    secondary: ("暗号化なしで開く（おすすめしません）", WarningPage.action("allow-http", url)))
                webView.loadHTMLString(html, baseURL: nil)
                return .cancel
            }
            if let https = secure?.url {
                tab.upgradedHosts.insert(host)
                tab.upgradedAt[host] = Date()
                webView.load(URLRequest(url: https))
                return .cancel
            }
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        tab?.didCommitNavigation()
        guard let tab, let host = webView.url?.host?.lowercased(), tab.noticedHost != host else { return }
        // 見た目が本物そっくりの別の文字のドメイン（例：аpple.com の а がロシア文字）
        if DangerousSites.looksLikeHomograph(host) {
            tab.noticedHost = host
            tab.onSecurityNotice?("このアドレスには見た目の似た特殊な文字が使われています。本物のサイトか確かめてください")
        }
    }

    private static func isLocal(_ host: String) -> Bool {
        if host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".localhost") { return true }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        return parts[0] == 10 || parts[0] == 127 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && (16...31).contains(parts[1]))
    }

    /// ほかのアプリを開く前に確かめる（Safari と同じ）。
    private func confirmOpenApp(_ url: URL) async -> Bool {
        guard let presenter = Self.topViewController() else { return true }
        return await withCheckedContinuation { continuation in
            let alert = UIAlertController(title: "ほかのアプリで開きますか？", message: url.scheme.map { "\($0): のリンクです" }, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "キャンセル", style: .cancel) { _ in continuation.resume(returning: false) })
            alert.addAction(UIAlertAction(title: "開く", style: .default) { _ in continuation.resume(returning: true) })
            presenter.present(alert, animated: true)
        }
    }

    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
        var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }

    /// target="_blank" links open in the same tab.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }
}
