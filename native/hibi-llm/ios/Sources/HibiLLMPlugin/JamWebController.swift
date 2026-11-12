import UIKit
import WebKit

/// Jam（リポジトリ communication：サークル・部活の連絡アプリ）を、ひび手帳の上に画面いっぱいで開く WebView。
/// ログイン（Google）を覚えておけるように、ふつうの（消えない）データ置き場を使う。
/// Google のログインは「アプリの中の WebView」を断ることがあるので、Safari と同じ名乗り方にする（Orbit と同じ）。
@MainActor
final class JamWebController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let shared = JamWebController()

    private(set) var url: URL?
    private lazy var web: WKWebView = {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1"
        config.preferences.isFraudulentWebsiteWarningEnabled = true
        let w = WKWebView(frame: .zero, configuration: config)
        w.navigationDelegate = self
        w.uiDelegate = self
        w.allowsBackForwardNavigationGestures = false // 端のスワイプはひび手帳へ戻る動きに使う
        w.scrollView.contentInsetAdjustmentBehavior = .never // ページが自分で画面の上下のあきをとる（viewport-fit=cover）
        w.isOpaque = false
        w.backgroundColor = .systemBackground
        w.scrollView.backgroundColor = .systemBackground
        return w
    }()
    private let empty = UILabel()

    override func loadView() {
        view = UIView()
        view.backgroundColor = .systemBackground
        web.frame = view.bounds
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(web)
        empty.text = "設定 → iPhoneとの連携 で、Jam の URL を入れてください"
        empty.textColor = .secondaryLabel
        empty.font = .preferredFont(forTextStyle: .body)
        empty.numberOfLines = 0
        empty.textAlignment = .center
        empty.frame = view.bounds.insetBy(dx: 32, dy: 0)
        empty.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(empty)
        empty.isHidden = url != nil
        if let url { web.load(URLRequest(url: url)) } // 初めて開くときに読み込む
    }

    /// 開く URL（ひび手帳の設定から）。変わったときだけ読み込み直す
    func setURL(_ new: URL?) {
        guard new?.absoluteString != url?.absoluteString else { return }
        url = new
        guard isViewLoaded else { return } // まだ一度も開いていなければ、開くときに読み込む
        empty.isHidden = new != nil
        if let new { web.load(URLRequest(url: new)) }
    }

    // 別の窓（target=_blank・Google のログインの窓）も同じ画面で開く
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let u = navigationAction.request.url, let scheme = u.scheme?.lowercased() else { return .allow }
        if ["http", "https", "about", "data", "blob", "javascript"].contains(scheme) { return .allow }
        // tel: mailto: LINE などは、押したときだけほかのアプリで開く
        if navigationAction.navigationType == .linkActivated { _ = await UIApplication.shared.open(u) }
        return .cancel
    }

    // ページの alert / confirm（削除の確認など）
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in c.resume() })
            present(a, animated: true)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await withCheckedContinuation { c in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "キャンセル", style: .cancel) { _ in c.resume(returning: false) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in c.resume(returning: true) })
            present(a, animated: true)
        }
    }
}
