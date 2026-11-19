import UIKit
import WebKit
import SwiftUI

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

    /// Dine（ごはん探し：リポジトリ eat）：日記のフォークとナイフのボタンから。URL は 設定 → ごはん（Dine）
    static let dine = EdgeWebController(
        name: "Dine", url: nil,
        hint: "Dine の URL がまだ入っていません。\n\nひび手帳に戻って（左端から右へスワイプ）、\n設定 →「ごはん（Dine）」に入れてください。",
        glass: [GlassSpec(sel: "#search-form button[type=submit]", title: "検索", tinted: true),
                GlassSpec(sel: "#here", symbol: "location.fill", title: "現在地"),
                GlassSpec(sel: "#detail-close", symbol: "xmark"),
                GlassSpec(sel: ".login button[type=submit]", title: "ログイン", tinted: true)])

    /// ページの下のタブバーを、iPhone 本物の Liquid Glass のバー（ひび手帳と同じ部品）に置きかえる設定。
    /// ページのバーは見えなくするだけで場所はそのまま。押されたら、ページのそのタブを押したことにする
    struct TabSpec {
        let bar: String       // ページのバー（見えなくする）
        let items: String     // タブひとつひとつ
        let key: String       // タブを見分ける属性
        let symbols: [String: String] // タブ → SF Symbols
        var hideWhen: String? = nil   // これが見えているあいだはバーを隠す（起動のアニメーションなど）
    }

    /// ページのボタンの上に、iPhone 本物の Liquid Glass のボタンを重ねる設定（ひび手帳の丸いボタンと同じ部品）。
    /// ページのボタンは見えなくするだけ。押されたら、ページのそのボタンを押したことにする
    struct GlassSpec {
        let sel: String
        var symbol: String = ""
        var title: String = ""
        var tinted: Bool = false  // ページのボタンの色（Dine はコーラルピンク）を、ガラスの色にする
    }

    private let name: String
    private let hint: String
    private let barSpec: TabSpec?
    private let glassSpec: [GlassSpec]
    private var glass: HibiGlass?
    private(set) var url: URL?
    private var tabBar: HibiTabBar?
    /// 下のバー（出入りのときに下へしまう：EdgeAppHost）
    var bar: HibiTabBar? { tabBar }

    init(name: String, url: URL?, hint: String, bar: TabSpec? = nil, glass: [GlassSpec] = []) {
        self.name = name
        self.url = url
        self.hint = hint
        self.barSpec = bar
        self.glassSpec = glass
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
        if !glassSpec.isEmpty {
            config.userContentController.add(self, contentWorld: .defaultClient, name: "edgeGlass")
            config.userContentController.addUserScript(WKUserScript(source: Self.glassScript(glassSpec), injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .defaultClient))
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
        if !glassSpec.isEmpty {
            let g = HibiGlass()
            g.onTap = { [weak self] id in self?.tapGlass(id) }
            g.install(on: self)
            glass = g
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

    // MARK: Liquid Glass のボタン

    /// ページに入れるスクリプト：ボタンの場所（画面の左上から）と色を知らせ、ページのボタンを見えなくする。
    /// ほかのもの（お店の画面など）の下に隠れているボタン・画面の外のボタンは知らせない
    private static func glassScript(_ list: [GlassSpec]) -> String {
        let cfg = list.enumerated().map { i, g in ["id": "g\(i)", "sel": g.sel, "symbol": g.symbol, "title": g.title, "tinted": g.tinted] as [String: Any] }
        let json = (try? JSONSerialization.data(withJSONObject: cfg)).map { String(decoding: $0, as: UTF8.self) } ?? "[]"
        return """
        (function (L) {
          var last = '', raf = 0;
          var st = document.createElement('style');
          st.textContent = L.map(function (g) { return g.sel; }).join(',') + '{opacity:0!important}';
          (document.head || document.documentElement).appendChild(st);
          // キーボードが出ているあいだは、画面が上下にずれてガラスの位置が合わなくなるので、ページのボタンをそのまま見せる
          function typing() {
            var a = document.activeElement; if (!a) return false;
            if (a.isContentEditable) return true;
            if (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
            return a.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(a.type || '');
          }
          function find(g) { var a = document.querySelectorAll(g.sel); for (var i = 0; i < a.length; i++) if (a[i].getClientRects().length) return a[i]; return null; }
          function send() {
            raf = 0;
            var vv = window.visualViewport, ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0, zoom = vv && Math.abs(vv.scale - 1) > 0.01;
            var items = [], kb = typing();
            st.disabled = kb;
            if (!kb && !zoom && document.visibilityState !== 'hidden') L.forEach(function (g) {
              var el = find(g); if (!el || el.disabled) return;
              var r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
              var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
              if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
              var hit = document.elementFromPoint(cx, cy); if (!hit || !(hit === el || el.contains(hit))) return; // 上に何かかぶさっている
              var cs = getComputedStyle(el);
              items.push({ id: g.id, x: Math.round(r.left - ox), y: Math.round(r.top - oy), w: Math.round(r.width), h: Math.round(r.height),
                symbol: g.symbol, title: g.title, tint: g.tinted ? cs.backgroundColor : '', ink: g.tinted ? cs.color : '' });
            });
            var s = JSON.stringify(items);
            if (s !== last) { last = s; try { window.webkit.messageHandlers.edgeGlass.postMessage(s); } catch (e) {} }
          }
          function soon() { if (!raf) raf = requestAnimationFrame(send); }
          window.__edgeGlassTap = function (id) { var g = L.filter(function (x) { return x.id === id; })[0], el = g && find(g); if (el) el.click(); };
          new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'style', 'disabled'] });
          addEventListener('scroll', soon, true); addEventListener('resize', soon);
          if (window.visualViewport) { visualViewport.addEventListener('scroll', soon); visualViewport.addEventListener('resize', soon); }
          addEventListener('transitionend', soon, true); addEventListener('animationend', soon, true);
          addEventListener('focusin', soon, true); addEventListener('focusout', function () { setTimeout(soon, 60); }, true);
          addEventListener('pageshow', soon); setInterval(soon, 400); soon();
        })(\(json));
        """
    }

    private func setGlass(_ text: String) {
        guard let g = glass, let arr = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [[String: Any]] else { return }
        let num: (Any?) -> CGFloat = { v in CGFloat((v as? NSNumber)?.doubleValue ?? 0) }
        let list = arr.map { o in
            HibiGlassItem(id: (o["id"] as? String) ?? "",
                          frame: CGRect(x: num(o["x"]), y: num(o["y"]), width: num(o["w"]), height: num(o["h"])),
                          symbol: (o["symbol"] as? String) ?? "",
                          ink: Color.hibi(o["ink"] as? String) ?? .primary,
                          tint: Color.hibi(o["tint"] as? String),
                          title: (o["title"] as? String) ?? "")
        }
        if list != g.state.items {
            var t = Transaction(); t.disablesAnimations = true
            withTransaction(t) { g.state.items = list }
        }
    }

    private func tapGlass(_ id: String) {
        let arg = (try? JSONSerialization.data(withJSONObject: [id])).map { String(decoding: $0, as: UTF8.self) } ?? "[\"\"]"
        web.evaluateJavaScript("window.__edgeGlassTap && window.__edgeGlassTap(\(arg)[0])", in: nil, in: .defaultClient) { _ in }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "edgeGlass", let text = message.body as? String { setGlass(text); return }
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
