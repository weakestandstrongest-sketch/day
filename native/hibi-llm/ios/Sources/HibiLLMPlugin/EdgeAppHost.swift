import UIKit
import SwiftUI

/// ひび手帳の上に、別のアプリを画面いっぱいに重ねる（Orbit：日記の左端から／Jam：ふりかえりの左端から／Gyoukai：日記の右端から）。
/// 右から出るアプリ（Gyoukai）は、左右がすべて逆（右端から左へで開き、左端から右へで戻る）。
/// Orbit のコードは Orbit/（リポジトリ browser2 から scripts/sync-orbit.sh で写したもの）、Jam・Gyoukai はウェブアプリ（EdgeWebController）。
///
/// - 左端から右へスワイプすると、指についてアプリが左から出てくる（画面いっぱい。ひび手帳の下のバーも隠れる）
/// - Orbit のどの画面でも、右端から左へスワイプすると、Orbit が左へ戻ってひび手帳に戻る
/// - 閉じても Orbit は裏で生きているので、次に開くと同じところから。アプリを閉じたあとも、Orbit が前の
///   タブを覚えている。しばらく見ていないタブは Orbit の「自動でしまう」でしまわれ、ホームから始まる
@MainActor
final class EdgeAppHost: NSObject, UIGestureRecognizerDelegate {
    /// 中に入れる画面を作る（初めて開くときに1回だけ）
    private let build: @MainActor () -> UIViewController
    /// 開くたびに呼ぶ（Orbit：しばらく見ていないタブをしまう）
    var onShow: (@MainActor () -> Void)?

    /// どちらの端から出てくるか
    let fromRight: Bool
    /// 出てくる側の符号（左から：-1、右から：+1）。閉じている位置は この符号 × 画面の幅
    private var sign: CGFloat { fromRight ? 1 : -1 }

    init(fromRight: Bool = false, build: @escaping @MainActor () -> UIViewController) {
        self.fromRight = fromRight
        self.build = build
        super.init()
        EdgeAppHost.all.append(self)
    }

    /// すべての重ねるアプリ（どれかが出ているあいだ・動いているあいだは、ほかのアプリの端のスワイプを受けない）
    private static var all: [EdgeAppHost] = []
    /// 指で動かしている・指を離して動いているとちゅう
    private var moving = false
    private static var anyBusy: Bool { all.contains { $0.isOpen || $0.moving } }
    private static let shadowOpacity: Float = 0.28

    private var host: UIViewController?
    private var openPan: UIScreenEdgePanGestureRecognizer?
    private var closePan: UIScreenEdgePanGestureRecognizer?
    private weak var vc: UIViewController?
    private(set) var isOpen = false
    /// 開いた・閉じた（ひび手帳の JS へ知らせる）
    var onChange: ((Bool) -> Void)?

    /// 左端からのスワイプで開けるようにする（「日記」を見ているときだけ on）。
    func arm(_ on: Bool, vc: UIViewController, webView: UIView?) {
        self.vc = vc
        if openPan == nil, let web = webView {
            let g = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(openPanned(_:)))
            g.edges = fromRight ? .right : .left
            g.delegate = self
            web.addGestureRecognizer(g)
            openPan = g
        }
        openPan?.isEnabled = on && !isOpen
    }

    func open(vc: UIViewController) {
        self.vc = vc
        guard let v = ensure(), let root = vc.view else { return }
        prepareToShow(v, in: root)
        settle(open: true, velocity: 0)
    }

    func close() {
        guard isOpen else { return }
        settle(open: false, velocity: 0)
    }

    // MARK: Building the Orbit screen (once; it stays alive while hidden)

    private func ensure() -> UIView? {
        if let h = host { return h.view }
        guard let vc, let root = vc.view else { return nil }
        let h = build()
        h.view.frame = root.bounds
        h.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        h.view.isHidden = true
        h.view.layer.shadowColor = UIColor.black.cgColor
        h.view.layer.shadowOpacity = 0
        h.view.layer.shadowRadius = 18
        vc.addChild(h)
        root.addSubview(h.view)
        h.didMove(toParent: vc)
        let g = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(closePanned(_:)))
        g.edges = fromRight ? .left : .right
        g.delegate = self
        h.view.addGestureRecognizer(g)
        closePan = g
        host = h
        return h.view
    }

    private func prepareToShow(_ v: UIView, in root: UIView) {
        root.bringSubviewToFront(v) // ひび手帳の下のバー・ガラスのボタンより上に
        v.frame = root.bounds
        v.layer.shadowOpacity = EdgeAppHost.shadowOpacity
        if v.isHidden {
            v.transform = CGAffineTransform(translationX: sign * root.bounds.width, y: 0)
            v.isHidden = false
            onShow?()
        }
        root.endEditing(true)
    }

    // MARK: Gestures

    @objc private func openPanned(_ g: UIScreenEdgePanGestureRecognizer) {
        guard let root = vc?.view else { return }
        let w = max(1, root.bounds.width)
        let x = g.translation(in: root).x
        switch g.state {
        case .began:
            guard let v = ensure() else { return }
            moving = true
            prepareToShow(v, in: root)
        case .changed:
            // 指が進んだぶんだけ、閉じた位置から出てくる（左からなら右へ、右からなら左へ）
            let moved = max(0, -sign * x)
            host?.view.transform = CGAffineTransform(translationX: sign * max(0, w - moved), y: 0)
        case .ended, .cancelled, .failed:
            let vx = -sign * g.velocity(in: root).x // 開く向きをプラスに
            let moved = -sign * x
            // 取り消し（.cancelled）でも、指の位置と勢いで決める（「開く前に戻す」と、がくっと戻って見える）
            settle(open: vx > 600 || (moved > w * 0.35 && vx > -300), velocity: g.velocity(in: root).x)
        default: break
        }
    }

    @objc private func closePanned(_ g: UIScreenEdgePanGestureRecognizer) {
        guard let root = vc?.view, isOpen else { return }
        let w = max(1, root.bounds.width)
        let x = g.translation(in: root).x
        switch g.state {
        case .began:
            moving = true
            root.endEditing(true)
        case .changed:
            // 閉じる向き（左から出たものは左へ、右から出たものは右へ）にだけ動く
            let moved = max(0, min(w, sign * x))
            host?.view.transform = CGAffineTransform(translationX: sign * moved, y: 0)
            // 影は、ほとんど閉じたところで消えていく（端に黒い帯が残って見えないように）
            host?.view.layer.shadowOpacity = EdgeAppHost.shadowOpacity * Float(min(1, (w - moved) / 60))
        case .ended, .cancelled, .failed:
            let vx = sign * g.velocity(in: root).x // 閉じる向きをプラスに
            let moved = sign * x
            // iPhone が途中でスワイプを取り消すこと（.cancelled）がある。そのときも指の位置と勢いで決める
            // （前は「開いたままに戻す」にしていたので、閉じかけで少し残ってから、がくっと開き直していた）
            let close = vx > 600 || (moved > w * 0.3 && vx > -300)
            settle(open: !close, velocity: g.velocity(in: root).x)
        default: break
        }
    }

    /// 指を離したあと：開ききる／閉じきる。速さを引きついで、iPhone のシートのように止まる。
    private func settle(open: Bool, velocity: CGFloat) {
        guard let v = host?.view, let root = vc?.view else { return }
        let w = max(1, root.bounds.width)
        let target: CGFloat = open ? 0 : sign * w
        let distance = abs(target - v.transform.tx)
        // 指の速さを引きつぐが、残りが短いときに一瞬で消えないよう上限をつける。はね返らない（iPhone のシートと同じ）
        let spring = distance > 1 ? min(2.5, abs(velocity) / distance) : 0
        moving = true
        if !open {
            let fade = CABasicAnimation(keyPath: "shadowOpacity")
            fade.fromValue = v.layer.shadowOpacity
            fade.toValue = 0
            fade.duration = 0.3
            v.layer.add(fade, forKey: "fade")
            v.layer.shadowOpacity = 0
        } else {
            v.layer.shadowOpacity = EdgeAppHost.shadowOpacity
        }
        UIView.animate(withDuration: 0.42, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: spring,
                       options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut]) {
            v.transform = CGAffineTransform(translationX: target, y: 0)
        } completion: { [weak self] _ in
            guard let self else { return }
            self.moving = false
            if !open { v.isHidden = true; v.transform = .identity }
            let changed = self.isOpen != open
            self.isOpen = open
            self.openPan?.isEnabled = !open
            if open { UIAccessibility.post(notification: .screenChanged, argument: v) }
            if changed { self.onChange?(open) }
        }
    }

    /// 別のアプリが出ている・動いているあいだは、ひび手帳の端のスワイプで開かない
    /// （ひび手帳の WebView の上に重ねているので、重ねたアプリの上のスワイプも、ひび手帳の WebView に届いてしまう）
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if g === openPan { return !EdgeAppHost.anyBusy }
        return true
    }

    // 画面の端からのスワイプは、ページのスクロールより先にとる
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        g === openPan || g === closePan
    }
}

/// 画面いっぱいに重ねるアプリ（Orbit・Jam）
@MainActor
enum EdgeApps {
    /// Orbit（ブラウザ）
    static let orbit: EdgeAppHost = {
        var model: AppModel?
        let host = EdgeAppHost {
            OrbitEmbed.embedded = true // 設定の保存先を分ける（AppModel を作る前に）
            let m = AppModel()
            model = m
            let h = UIHostingController(rootView: OrbitRoot(model: m))
            h.view.backgroundColor = .black
            return h
        }
        host.onShow = { model?.becameActive() } // しばらく見ていないタブをしまう（日にちが経っていればホームから）
        return host
    }()

    /// Jam（リポジトリ communication のウェブアプリ）
    static let jam = EdgeAppHost { EdgeWebController.jam }

    /// Gyoukai（業界研究。リポジトリ gyoukai の GitHub Pages）：日記の右端から
    static let gyoukai = EdgeAppHost(fromRight: true) { EdgeWebController.gyoukai }
}

/// Orbit の画面（単独のアプリの OrbitApp と同じ組み方）。
struct OrbitRoot: View {
    let model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        BrowserView()
            .environment(model)
            .tint(Theme.accent)
            .preferredColorScheme(model.settings.appearance == .system ? nil : (model.settings.appearance == .dark ? .dark : .light))
            .onChange(of: scenePhase) {
                if scenePhase == .active { model.becameActive() }
            }
    }
}
