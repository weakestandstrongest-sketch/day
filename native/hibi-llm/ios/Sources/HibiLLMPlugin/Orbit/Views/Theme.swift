import SwiftUI

/// 色と書体。Comet のダークとティールを基調にする。
enum Theme {
    /// ティール
    static let accent = Color(red: 0.33, green: 0.72, blue: 0.78)
    static let tealDeep = Color(red: 0.13, green: 0.50, blue: 0.56)
    /// AI が動いているときに縁を回る光
    static let rainbow: [Color] = [
        Color(red: 0.33, green: 0.72, blue: 0.78), Color(red: 0.50, green: 0.88, blue: 0.84),
        Color(red: 0.13, green: 0.50, blue: 0.56), Color(red: 0.30, green: 0.62, blue: 0.86),
    ]
    static let gradient = LinearGradient(colors: [tealDeep, accent], startPoint: .leading, endPoint: .trailing)
    static let paper = Color(red: 0.965, green: 0.965, blue: 0.96)
    static let ink = Color(red: 0.082, green: 0.082, blue: 0.086)

    /// 見出し用の細い書体（Comet のワードマークのような）
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .light)
    }
}

/// ロゴ：シンボルマーク（切れた O）と、丸みのある太めの文字を字間を詰めて並べる。
/// 細い標準の書体と色の点だけだと安っぽく見えたので、アイコンと同じ印を使って一体にする。
struct Wordmark: View {
    var text = "orbit"
    var size: CGFloat = 32
    var muted = false

    var body: some View {
        HStack(spacing: size * 0.18) {
            OrbView(size: size * 1.05, color: muted ? .secondary : Theme.accent)
                .padding(.horizontal, -size * 0.2) // 印の余白を詰めて、文字と一続きに見せる
            Text(text)
                .font(.system(size: size, weight: .semibold, design: .rounded))
                .tracking(-size * 0.035)
                .foregroundStyle(
                    LinearGradient(colors: [Color.primary, Color.primary.opacity(0.72)], startPoint: .top, endPoint: .bottom)
                )
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Orbit のシンボルマーク「切れた O」：右上が切れた太い輪と、その切れ目の衛星。
/// AI が動いている間は、輪ごと回る。
struct OrbView: View {
    var size: CGFloat = 36
    var animating = false
    var color: Color = Theme.accent
    @State private var rotation = 0.0

    var body: some View {
        ZStack {
            // 100×100 の枠の中で、半径30・太さ12の輪（円周の約78%）。切れ目は右上
            Circle()
                .trim(from: 0, to: 148 / (2 * .pi * 30))
                .stroke(color, style: StrokeStyle(lineWidth: size * 0.12, lineCap: .round))
                .frame(width: size * 0.6, height: size * 0.6)
                .rotationEffect(.degrees(-6))
            Circle()
                .fill(color)
                .frame(width: size * 0.132, height: size * 0.132)
                .offset(x: size * 0.247, y: -size * 0.186)
        }
        .frame(width: size, height: size)
        .rotationEffect(.degrees(rotation))
        .shadow(color: color.opacity(animating ? 0.7 : 0), radius: size * 0.2)
        .onAppear { updateAnimation() }
        .onChange(of: animating) { updateAnimation() }
        .accessibilityHidden(true)
    }

    private func updateAnimation() {
        if animating {
            withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) { rotation = 360 }
        } else {
            withAnimation(.easeOut(duration: 0.4)) { rotation = 0 }
        }
    }
}

// MARK: - Halo design language (Dia の光 × Comet のサイドカー)

extension View {
    /// ガラスの面。iOS 26 では Liquid Glass、それより前はすりガラス。
    func glass<S: InsettableShape>(_ shape: S, interactive: Bool = false) -> some View {
        modifier(GlassSurface(shape: shape, interactive: interactive))
    }
}

struct GlassSurface<S: InsettableShape>: ViewModifier {
    let shape: S
    var interactive = false

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
        } else {
            content
                .background(.ultraThinMaterial, in: shape)
                .overlay(shape.strokeBorder(Color.primary.opacity(0.1), lineWidth: 1))
        }
    }
}

/// スペースの色がにじむ背景。AI が動いている間はゆっくり揺れる。
struct AuroraBackground: View {
    let theme: SpaceTheme
    var active = false
    var muted = false
    @Environment(\.colorScheme) private var scheme
    @State private var drift = false

    var body: some View {
        let k: Double = muted ? 0.1 : (scheme == .dark ? 0.3 : 0.45)
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                scheme == .dark ? Theme.ink : Theme.paper
                Circle()
                    .fill(theme.colors[0])
                    .frame(width: w * 1.1, height: w * 1.1)
                    .blur(radius: 110)
                    .offset(x: -w * 0.5 + (drift ? 50 : 0), y: h * 0.46)
                    .opacity(0.55 * k)
                Circle()
                    .fill(theme.colors[1])
                    .frame(width: w, height: w)
                    .blur(radius: 120)
                    .offset(x: w * 0.45 - (drift ? 60 : 0), y: h * 0.40)
                    .opacity(0.5 * k)
                Circle()
                    .fill(Theme.rainbow[0])
                    .frame(width: w * 0.6, height: w * 0.6)
                    .blur(radius: 100)
                    .offset(x: w * 0.35, y: -h * 0.46 + (drift ? 70 : 0))
                    .opacity(0.3 * k)
            }
        }
        .ignoresSafeArea()
        .onChange(of: active, initial: true) { _, now in
            if now {
                withAnimation(.easeInOut(duration: 3.5).repeatForever(autoreverses: true)) { drift = true }
            } else {
                withAnimation(.easeInOut(duration: 1.2)) { drift = false }
            }
        }
    }
}

/// 縁を光が回る（AI が考えている・操作している合図）。
struct GlowBorder<S: InsettableShape>: View {
    let shape: S
    var colors: [Color] = Theme.rainbow
    var lineWidth: CGFloat = 2.5
    @State private var angle = 0.0

    var body: some View {
        GeometryReader { geo in
            let side = max(geo.size.width, geo.size.height) * 1.6
            AngularGradient(colors: colors + [colors[0]], center: .center)
                .frame(width: side, height: side)
                .rotationEffect(.degrees(angle))
                .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
        .mask(shape.strokeBorder(lineWidth: lineWidth))
        .shadow(color: colors[3].opacity(0.6), radius: 7)
        .shadow(color: colors[0].opacity(0.4), radius: 14)
        .allowsHitTesting(false)
        .onAppear {
            withAnimation(.linear(duration: 2.8).repeatForever(autoreverses: false)) { angle = 360 }
        }
    }
}
