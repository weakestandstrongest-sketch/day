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
}

struct HibiBarView: View {
    @ObservedObject var s: HibiTabState
    var onTab: (String) -> Void
    var onFab: () -> Void
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 10) {
            bar
            fabButton
        }
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
    var onTab: ((String) -> Void)?
    var onFab: (() -> Void)?

    func install(on vc: UIViewController) {
        guard host == nil, let root = vc.view else { return }
        let h = UIHostingController(rootView: HibiBarView(s: state, onTab: { [weak self] k in self?.onTab?(k) }, onFab: { [weak self] in self?.onFab?() }))
        h.view.backgroundColor = .clear
        h.view.translatesAutoresizingMaskIntoConstraints = false
        vc.addChild(h)
        root.addSubview(h.view)
        NSLayoutConstraint.activate([
            h.view.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            h.view.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            h.view.bottomAnchor.constraint(equalTo: root.safeAreaLayoutGuide.bottomAnchor, constant: -10),
            h.view.heightAnchor.constraint(equalToConstant: 62),
        ])
        h.didMove(toParent: vc)
        host = h
    }

    /// "light" / "dark" / "" (the iPhone's own)
    func setScheme(_ s: String) {
        host?.overrideUserInterfaceStyle = s == "dark" ? .dark : s == "light" ? .light : .unspecified
    }

    func remove() {
        host?.willMove(toParent: nil); host?.view.removeFromSuperview(); host?.removeFromParent(); host = nil
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
