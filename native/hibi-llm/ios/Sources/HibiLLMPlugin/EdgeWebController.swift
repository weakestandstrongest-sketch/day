import UIKit
import WebKit

/// ひび手帳の上に画面いっぱいで開くウェブアプリの WebView（Jam：リポジトリ communication／Gyoukai：リポジトリ gyoukai）。
/// ログイン（Google）を覚えておけるように、ふつうの（消えない）データ置き場を使う。
/// Google のログインは「アプリの中の WebView」を断ることがあるので、Safari と同じ名乗り方にする（Orbit と同じ）。
@MainActor
final class EdgeWebController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    /// Jam：URL は ひび手帳の設定から。下のバー：ホーム・トーク・予定・投票・グループ
    static let jam = EdgeWebController(
        name: "Jam", url: nil,
        hint: "Jam の URL がまだ入っていません。\n\nひび手帳に戻って（右端から左へスワイプ）、\n設定 → iPhoneとの連携 →「Jam の URL」に入れてください。",
        bar: TabSpec(bar: "nav.fixed[aria-label=\"メインナビゲーション\"]", items: "nav.fixed[aria-label=\"メインナビゲーション\"] a[href]", key: "href",
                     symbols: ["/": "house", "/talk": "bubble.left.and.bubble.right", "/calendar": "calendar", "/polls": "chart.bar.xaxis", "/groups": "person.3"],
                     hideWhen: ".jam-splash")) // 起動のアニメーション（Jam のロゴ）のあいだは隠す
    /// Gyoukai：公開ページ（GitHub Pages）。下のバー：ホーム・ニュース・業界・地方
    static let gyoukai = EdgeWebController(
        name: "Gyoukai", url: URL(string: "https://weakestandstrongest-sketch.github.io/gyoukai/"), hint: "",
        bar: TabSpec(bar: "nav.tabbar", items: "nav.tabbar .tab[data-tab]", key: "data-tab",
                     symbols: ["home": "house", "news": "newspaper", "industry": "building.2", "region": "map"]))

    /// ページの下のタブバーを、iPhone 本物の Liquid Glass のバー（ひび手帳と同じ部品）に置きかえる設定。
    /// ページのバーは見えなくするだけで場所はそのまま。押されたら、ページのそのタブを押したことにする
    struct TabSpec {
        let bar: String       // ページのバー（見えなくする）
        let items: String     // タブひとつひとつ
        let key: String       // タブを見分ける属性
        let symbols: [String: String] // タブ → SF Symbols
        var hideWhen: String? = nil   // これが見えているあいだはバーを隠す（起動のアニメーションなど）
    }

    private let name: String
    private let hint: String
    private let barSpec: TabSpec?
    private(set) var url: URL?
    private var tabBar: HibiTabBar?

    init(name: String, url: URL?, hint: String, bar: TabSpec? = nil) {
        self.name = name
        self.url = url
        self.hint = hint
        self.barSpec = bar
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    private lazy var web: WKWebView = {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1"
        config.preferences.isFraudulentWebsiteWarningEnabled = true
        if let spec = barSpec {
            config.userContentController.add(self, contentWorld: .defaultClient, name: "edgeBar")
            config.userContentController.addUserScript(WKUserScript(source: Self.barScript(spec), injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .defaultClient))
        }
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
        if barSpec != nil {
            let tb = HibiTabBar()
            tb.onTab = { [weak self] key in self?.tapTab(key) }
            tb.install(on: self)
            tb.state.fabShown = false
            tb.state.tint = .primary
            tb.setHidden(true)
            tabBar = tb
        }
        if let url {
            web.load(URLRequest(url: url)) // 初めて開くときに読み込む
            showMessage(nil)
        } else {
            showMessage(hint)
        }
    }

    // MARK: Liquid Glass のバー

    /// ページに入れるスクリプト：タブの名前・選んでいるタブを知らせ、ページのバーを見えなくする
    private static func barScript(_ spec: TabSpec) -> String {
        let cfg: [String: Any] = ["bar": spec.bar, "items": spec.items, "key": spec.key, "sym": spec.symbols, "hide": spec.hideWhen ?? ""]
        let json = (try? JSONSerialization.data(withJSONObject: cfg)).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
        return """
        (function (C) {
          var last = '', raf = 0;
          var st = document.createElement('style');
          st.textContent = C.bar + '{opacity:0!important;pointer-events:none!important}';
          (document.head || document.documentElement).appendChild(st);
          function items() { return Array.prototype.slice.call(document.querySelectorAll(C.items)); }
          function keyOf(el) { return el.getAttribute(C.key) || ''; }
          function send() {
            raf = 0;
            var bar = document.querySelector(C.bar), list = items();
            var hidden = !bar || !list.length || !bar.getClientRects().length || getComputedStyle(bar).display === 'none';
            if (!hidden && C.hide) {
              var cover = document.querySelector(C.hide);
              if (cover) { var cs = getComputedStyle(cover); if (cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05) hidden = true; }
            }
            var sel = '', tabs = list.map(function (el) {
              var k = keyOf(el);
              if (el.getAttribute('aria-current') === 'page' || el.getAttribute('aria-selected') === 'true') sel = k;
              return { key: k, title: (el.textContent || '').replace(/\\s+/g, ' ').replace(/\\d+$/, '').trim(), symbol: C.sym[k] || 'circle' };
            });
            var s = JSON.stringify({ tabs: tabs, selected: sel, hidden: hidden });
            if (s !== last) { last = s; try { window.webkit.messageHandlers.edgeBar.postMessage(s); } catch (e) {} }
          }
          function soon() { if (!raf) raf = requestAnimationFrame(send); }
          new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-selected', 'hidden', 'style'] });
          window.__edgeTap = function (k) { var el = items().filter(function (e) { return keyOf(e) === k; })[0]; if (el) el.click(); };
          addEventListener('popstate', soon); addEventListener('animationend', soon, true); setInterval(soon, 500); soon();
        })(\(json));
        """
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "edgeBar", let tb = tabBar, let text = message.body as? String,
              let o = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { return }
        let tabs = ((o["tabs"] as? [[String: Any]]) ?? []).map {
            HibiTab(id: ($0["key"] as? String) ?? "", title: ($0["title"] as? String) ?? "", symbol: ($0["symbol"] as? String) ?? "circle")
        }
        if tabs != tb.state.tabs { tb.state.tabs = tabs }
        let sel = (o["selected"] as? String) ?? ""
        if sel != tb.state.selected { tb.state.selected = sel }
        let hidden = (o["hidden"] as? Bool) ?? true
        if hidden != tb.state.hidden { tb.setHidden(hidden) }
    }

    private func tapTab(_ key: String) {
        let arg = (try? JSONSerialization.data(withJSONObject: [key])).map { String(decoding: $0, as: UTF8.self) } ?? "[\"\"]"
        web.evaluateJavaScript("window.__edgeTap && window.__edgeTap(\(arg)[0])", in: nil, in: .defaultClient) { _ in }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
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
        showMessage("\(name) を開けませんでした。\n\n\(url?.host ?? "")\n\(error.localizedDescription)\n\nURL が正しいか、インターネットにつながっているか確かめてください。")
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
            showMessage(hint)
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
