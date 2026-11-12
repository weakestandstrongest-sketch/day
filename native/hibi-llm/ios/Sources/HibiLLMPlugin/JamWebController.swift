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
    /// URL が入っていない・読み込めなかったときの案内（真っ黒の画面にしない）
    private let empty = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)

    override func loadView() {
        view = UIView()
        view.backgroundColor = .systemBackground
        web.frame = view.bounds
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(web)
        // 文字と読み込み中の印は Auto Layout で真ん中に（作った時点では画面の大きさがまだ 0 なので、枠の数字で置くと消える）
        empty.textColor = .secondaryLabel
        empty.font = .preferredFont(forTextStyle: .body)
        empty.numberOfLines = 0
        empty.textAlignment = .center
        empty.translatesAutoresizingMaskIntoConstraints = false
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.hidesWhenStopped = true
        view.addSubview(empty)
        view.addSubview(spinner)
        NSLayoutConstraint.activate([
            empty.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            empty.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            empty.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        if let url {
            web.load(URLRequest(url: url)) // 初めて開くときに読み込む
            showMessage(nil)
        } else {
            showMessage("Jam の URL がまだ入っていません。\n\nひび手帳に戻って（右端から左へスワイプ）、\n設定 → iPhoneとの連携 →「Jam の URL」に入れてください。")
        }
    }

    private func showMessage(_ text: String?) {
        empty.text = text
        empty.isHidden = text == nil
        web.isHidden = text != nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if webView.url == nil || webView.backForwardList.currentItem == nil { spinner.startAnimating() }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        showMessage(nil)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain, ns.code == NSURLErrorCancelled { return } // 次のページへ移っただけ
        guard webView.backForwardList.currentItem == nil else { return } // 前のページが出ていれば、それを見せたまま
        showMessage("Jam を開けませんでした。\n\n\(url?.host ?? "")\n\(error.localizedDescription)\n\nURL が正しいか、インターネットにつながっているか確かめてください。")
    }

    /// 開く URL（ひび手帳の設定から）。変わったときだけ読み込み直す
    func setURL(_ new: URL?) {
        guard new?.absoluteString != url?.absoluteString else { return }
        url = new
        guard isViewLoaded else { return } // まだ一度も開いていなければ、開くときに読み込む
        if let new {
            showMessage(nil)
            web.load(URLRequest(url: new))
        } else {
            showMessage("Jam の URL がまだ入っていません。\n\nひび手帳に戻って（右端から左へスワイプ）、\n設定 → iPhoneとの連携 →「Jam の URL」に入れてください。")
        }
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
