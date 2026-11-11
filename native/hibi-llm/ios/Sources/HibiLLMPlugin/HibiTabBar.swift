import UIKit
import SwiftUI

// アプリ版の下のバーと右下の丸いボタンを、iPhone 本物の部品にする（iOS 26 では Liquid Glass）。
// ひび手帳の画面（Web）の上に重ね、押されたらひび手帳に伝える。中身の切り替えはひび手帳がする。

struct HibiTab: Identifiable, Equatable {
    let id: String
    let title: String
    let symbol: String
}

final class HibiTabState: ObservableObject {
    @Published var tabs: [HibiTab] = []
    @Published var selected = ""
    @Published var fab = "plus"
    @Published var fabLabel = "追加"
    @Published var tint: Color = Color(red: 0.88, green: 0.5, blue: 0.47)
    @Published var fabInk: Color = .white
    @Published var hidden = false
    /// false: no round button (灯 or an app opened inside ひび手帳 that has none)
    @Published var fabShown = true
}

/// Lets touches through everywhere except where `hit` says there is a real button.
/// (The SwiftUI host is a full-width strip; without this its empty parts, and the whole strip
/// while the bar is hidden, swallowed taps meant for ひび手帳's own buttons under it.)
final class HibiPassView: UIView {
    var hit: ((CGPoint, CGSize) -> Bool)?
    override func hitTest(_ p: CGPoint, with e: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, !isHidden, alpha > 0.01, hit?(p, bounds.size) ?? false else { return nil }
        return super.hitTest(p, with: e)
    }
    override func point(inside p: CGPoint, with e: UIEvent?) -> Bool { (hit?(p, bounds.size) ?? false) && super.point(inside: p, with: e) }
}

struct HibiBarView: View {
    @ObservedObject var s: HibiTabState
    var onTab: (String) -> Void
    var onFab: () -> Void
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 10) {
            bar
            if s.fabShown { fabButton.transition(.scale.combined(with: .opacity)) }
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: s.fabShown)
        .padding(.horizontal, 12)
        .offset(y: s.hidden ? 140 : 0)
        .opacity(s.hidden ? 0 : 1)
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: s.hidden)
    }

    private var items: some View {
        HStack(spacing: 0) {
            ForEach(s.tabs) { t in
                Button { onTab(t.id) } label: {
                    VStack(spacing: 2) {
                        Image(systemName: t.symbol).font(.system(size: 19, weight: .medium))
                        Text(t.title).font(.system(size: 10, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .foregroundColor(s.selected == t.id ? s.tint : Color.primary)
                    .background {
                        if s.selected == t.id {
                            Capsule().fill(Color.primary.opacity(0.1)).matchedGeometryEffect(id: "sel", in: ns)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(t.title)
                .accessibilityAddTraits(s.selected == t.id ? .isSelected : [])
            }
        }
        .padding(5)
        .animation(.spring(response: 0.38, dampingFraction: 0.78), value: s.selected)
    }

    @ViewBuilder private var bar: some View {
        if #available(iOS 26.0, *) {
            items.glassEffect(.regular.interactive(), in: .capsule)
        } else {
            items.background(.ultraThinMaterial, in: Capsule())
        }
    }

    @ViewBuilder private var fabButton: some View {
        let label = Image(systemName: s.fab).font(.system(size: 25, weight: .semibold)).foregroundColor(s.fabInk).frame(width: 62, height: 62).contentShape(Circle())
        if #available(iOS 26.0, *) {
            Button(action: onFab) { label }.buttonStyle(.plain)
                .glassEffect(.regular.tint(s.tint).interactive(), in: .circle)
                .accessibilityLabel(s.fabLabel)
        } else {
            Button(action: onFab) { label.background(s.tint, in: Circle()) }.buttonStyle(.plain).accessibilityLabel(s.fabLabel)
        }
    }
}

/// Puts the bar over ひび手帳's page (once) and keeps its state.
final class HibiTabBar {
    static let shared = HibiTabBar()
    let state = HibiTabState()
    private var host: UIHostingController<HibiBarView>?
    private var box: HibiPassView?
    var onTab: ((String) -> Void)?
    var onFab: (() -> Void)?

    func install(on vc: UIViewController) {
        guard host == nil, let root = vc.view else { return }
        let h = UIHostingController(rootView: HibiBarView(s: state, onTab: { [weak self] k in self?.onTab?(k) }, onFab: { [weak self] in self?.onFab?() }))
        h.view.backgroundColor = .clear
        h.view.translatesAutoresizingMaskIntoConstraints = false
        let b = HibiPassView()
        b.backgroundColor = .clear
        b.translatesAutoresizingMaskIntoConstraints = false
        let st = state
        // the capsule: 12pt in from each side; the round button: the last 62pt before the right margin
        b.hit = { p, size in
            if st.hidden || p.y < 0 || p.y > size.height { return false }
            let right = size.width - 12
            if st.fabShown && p.x >= right - 62 && p.x <= right { return true }
            return p.x >= 12 && p.x <= (st.fabShown ? right - 72 : right)
        }
        vc.addChild(h)
        root.addSubview(b)
        b.addSubview(h.view)
        NSLayoutConstraint.activate([
            b.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            b.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            b.bottomAnchor.constraint(equalTo: root.safeAreaLayoutGuide.bottomAnchor, constant: -10),
            b.heightAnchor.constraint(equalToConstant: 62),
            h.view.leadingAnchor.constraint(equalTo: b.leadingAnchor),
            h.view.trailingAnchor.constraint(equalTo: b.trailingAnchor),
            h.view.topAnchor.constraint(equalTo: b.topAnchor),
            h.view.bottomAnchor.constraint(equalTo: b.bottomAnchor),
        ])
        h.didMove(toParent: vc)
        host = h; box = b
    }

    /// while hidden, nothing on the strip takes a touch at all
    func setHidden(_ v: Bool) { state.hidden = v; box?.isUserInteractionEnabled = !v }

    /// "light" / "dark" / "" (the iPhone's own)
    func setScheme(_ s: String) {
        host?.overrideUserInterfaceStyle = s == "dark" ? .dark : s == "light" ? .light : .unspecified
    }

    func remove() {
        host?.willMove(toParent: nil); host?.view.removeFromSuperview(); host?.removeFromParent(); host = nil
        box?.removeFromSuperview(); box = nil
    }
}

// MARK: - Liquid Glass の丸いボタン（予定の編集画面の ×・…・パレット、灯の × と ＋ など）
// ひび手帳が、ページの中のボタンの場所（画面の左上からの位置と大きさ）を毎回知らせ、その上に本物を重ねる。
// 押されたらひび手帳に伝え、ひび手帳がページのボタンを押したことにする。

struct HibiMenuItem: Identifiable, Equatable {
    let id: String
    let title: String
    let symbol: String
    let destructive: Bool
}

struct HibiGlassItem: Identifiable, Equatable {
    let id: String
    let frame: CGRect
    let symbol: String
    let ink: Color
    let tint: Color?
    /// "btn"（押すだけ）・"menu"（押すとメニュー）・"time"（時刻のホイール）
    var kind: String = "btn"
    /// "time": "HH:MM"
    var value: String = ""
    var menu: [HibiMenuItem] = []
}

/// 時刻を選ぶ iPhone 本物のホイール（アラームの時刻）
struct HibiTimeWheel: View {
    let item: HibiGlassItem
    var onChange: (String, String) -> Void
    @State private var d = Date()
    private static let fmt: DateFormatter = { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "HH:mm"; return f }()
    private func parse(_ s: String) -> Date {
        let p = s.split(separator: ":").compactMap { Int($0) }
        return Calendar.current.date(bySettingHour: p.first ?? 7, minute: p.count > 1 ? p[1] : 0, second: 0, of: Date()) ?? Date()
    }
    var body: some View {
        DatePicker("", selection: Binding(get: { d }, set: { v in d = v; onChange(item.id, Self.fmt.string(from: v)) }), displayedComponents: .hourAndMinute)
            .datePickerStyle(.wheel)
            .labelsHidden()
            .environment(\.locale, Locale(identifier: "en_GB")) // 24 時間
            .frame(width: item.frame.width, height: item.frame.height)
            .clipped()
            .onAppear { d = parse(item.value) }
            .onChange(of: item.value) { v in if Self.fmt.string(from: d) != v { d = parse(v) } }
    }
}

final class HibiGlassState: ObservableObject {
    @Published var items: [HibiGlassItem] = []
}

struct HibiGlassLayer: View {
    @ObservedObject var s: HibiGlassState
    var onTap: (String) -> Void
    var onMenu: (String, String) -> Void = { _, _ in }
    var onTime: (String, String) -> Void = { _, _ in }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear
            ForEach(s.items) { it in
                Group {
                    if it.kind == "time" { HibiTimeWheel(item: it, onChange: onTime) } else { button(it) }
                }
                .frame(width: it.frame.width, height: it.frame.height)
                .position(x: it.frame.midX, y: it.frame.midY)
            }
        }
        .ignoresSafeArea()
    }

    private func label(_ it: HibiGlassItem) -> some View {
        Image(systemName: it.symbol)
            .font(.system(size: max(13, min(it.frame.width, it.frame.height) * 0.42), weight: .semibold))
            .foregroundStyle(it.ink)
            .frame(width: it.frame.width, height: it.frame.height)
            .contentShape(Circle())
    }

    /// a round glass button that opens a real menu from itself (like "…" in iPhone's own apps)
    @ViewBuilder private func menuButton(_ it: HibiGlassItem) -> some View {
        let m = Menu {
            ForEach(it.menu) { x in
                Button(role: x.destructive ? .destructive : nil) { onMenu(it.id, x.id) } label: {
                    if x.symbol.isEmpty { Text(x.title) } else { Label(x.title, systemImage: x.symbol) }
                }
            }
        } label: { label(it) }
        .buttonStyle(.plain)
        if #available(iOS 26.0, *) {
            m.glassEffect(.regular.interactive(), in: .circle)
        } else {
            m.background(.ultraThinMaterial, in: Circle())
        }
    }

    @ViewBuilder private func button(_ it: HibiGlassItem) -> some View {
        let lb = label(it)
        if it.kind == "menu" {
            menuButton(it)
        } else if #available(iOS 26.0, *) {
            if let t = it.tint {
                Button { onTap(it.id) } label: { lb }.buttonStyle(.plain).glassEffect(.regular.tint(t).interactive(), in: .circle)
            } else {
                Button { onTap(it.id) } label: { lb }.buttonStyle(.plain).glassEffect(.regular.interactive(), in: .circle)
            }
        } else {
            Button { onTap(it.id) } label: { lb.background(it.tint.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.ultraThinMaterial), in: Circle()) }.buttonStyle(.plain)
        }
    }
}

final class HibiGlass {
    static let shared = HibiGlass()
    let state = HibiGlassState()
    private var host: UIHostingController<HibiGlassLayer>?
    private var box: HibiPassView?
    var onTap: ((String) -> Void)?
    var onMenu: ((String, String) -> Void)?
    var onTime: ((String, String) -> Void)?

    func install(on vc: UIViewController) {
        guard host == nil, let root = vc.view else { return }
        let h = UIHostingController(rootView: HibiGlassLayer(s: state, onTap: { [weak self] id in self?.onTap?(id) },
                                                             onMenu: { [weak self] id, p in self?.onMenu?(id, p) },
                                                             onTime: { [weak self] id, v in self?.onTime?(id, v) }))
        h.view.backgroundColor = .clear
        h.view.translatesAutoresizingMaskIntoConstraints = false
        if #available(iOS 16.4, *) { h.safeAreaRegions = [] }
        let b = HibiPassView()
        b.backgroundColor = .clear
        b.translatesAutoresizingMaskIntoConstraints = false
        let st = state
        b.hit = { p, _ in st.items.contains { $0.frame.insetBy(dx: -4, dy: -4).contains(p) } }
        vc.addChild(h)
        // under the tab bar (if it is there), over the page
        if let bar = root.subviews.first(where: { $0 is HibiPassView }) { root.insertSubview(b, belowSubview: bar) } else { root.addSubview(b) }
        b.addSubview(h.view)
        NSLayoutConstraint.activate([
            b.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            b.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            b.topAnchor.constraint(equalTo: root.topAnchor),
            b.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            h.view.leadingAnchor.constraint(equalTo: b.leadingAnchor),
            h.view.trailingAnchor.constraint(equalTo: b.trailingAnchor),
            h.view.topAnchor.constraint(equalTo: b.topAnchor),
            h.view.bottomAnchor.constraint(equalTo: b.bottomAnchor),
        ])
        h.didMove(toParent: vc)
        host = h; box = b
    }

    func setScheme(_ s: String) {
        host?.overrideUserInterfaceStyle = s == "dark" ? .dark : s == "light" ? .light : .unspecified
    }
}

extension Color {
    /// "#RRGGBB" or "rgb(r, g, b)"
    static func hibi(_ s: String?) -> Color? {
        guard var t = s?.trimmingCharacters(in: .whitespaces), !t.isEmpty else { return nil }
        if t.hasPrefix("#"), t.count == 7, let v = Int(t.dropFirst(), radix: 16) {
            return Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
        }
        if t.hasPrefix("rgb") {
            t = t.replacingOccurrences(of: "rgba(", with: "").replacingOccurrences(of: "rgb(", with: "").replacingOccurrences(of: ")", with: "")
            let p = t.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            if p.count >= 3 { return Color(red: p[0] / 255, green: p[1] / 255, blue: p[2] / 255) }
        }
        return nil
    }
}
