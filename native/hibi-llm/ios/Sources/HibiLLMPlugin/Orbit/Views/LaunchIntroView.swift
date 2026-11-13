import SwiftUI

/// 開いたときのアニメーション「軌道を一周」：
/// 点が輪のまわりを一周し、通ったあとに輪が描かれていく。点が切れ目（右上）に止まると「orbit」の文字が出て、
/// そのまま始まりのページのロゴの位置へ縮んで収まる（始まりのページが出ていないときは、その場で小さくなって消える）。
///
/// 黒い幕は `app.introCover` のあいだ出ている。動きは `app.introGo` が true になってから始まる
/// （ひび手帳の中では、Orbit が出きってから。単独のアプリでは、画面が出たらすぐ）。
struct LaunchIntroView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 幕の上のロゴの大きさ（文字の大きさ）。始まりのページの Wordmark は 32
    private let size: CGFloat = 44

    @State private var dotTurn = -323.0   // 点の回り（0 で切れ目の位置）
    @State private var ringTrim = 0.0      // 輪の描けたぶん
    @State private var dotScale = 0.45
    @State private var wordShown = false
    @State private var landed = false      // 始まりのページのロゴへ収まった
    @State private var coverOpacity = 1.0
    @State private var logoFrame: CGRect = .zero
    @State private var started = false

    /// 文字の色：黒い幕の上では白。着地するときは、始まりのページのロゴと同じ色（明るい見た目なら黒）へ
    private var ink: Color { landed ? .primary : .white }

    private var fullTrim: Double { 148 / (2 * .pi * 30) }

    var body: some View {
        ZStack {
            Color.black.opacity(coverOpacity)
            logo
                .background(GeometryReader { g in
                    Color.clear.onAppear { logoFrame = g.frame(in: .global) }
                        .onChange(of: g.size) { logoFrame = g.frame(in: .global) }
                })
                // 文字が出る前は、印が画面の真ん中に来るようにずらしておく
                .offset(x: wordShown || logoFrame.width == 0 ? 0 : (logoFrame.width - size * 0.65) / 2)
                .opacity(logoFrame.width > 0 ? 1 : 0) // 大きさを測るまでは出さない
                .modifier(LandingEffect(landed: landed, from: logoFrame, to: app.wordmarkFrame))
        }
        .ignoresSafeArea()
        .allowsHitTesting(coverOpacity > 0.5)
        .accessibilityHidden(true)
        .onAppear { if app.introGo { play() } }
        .onChange(of: app.introGo) { if app.introGo { play() } }
    }

    /// 印（切れた輪と点）と文字。並びは Wordmark と同じ比率（着地したときにぴったり重なるように）
    private var logo: some View {
        let mark = size * 1.05
        return HStack(spacing: size * 0.18) {
            ZStack {
                Circle()
                    .trim(from: 0, to: ringTrim)
                    .stroke(Theme.accent, style: StrokeStyle(lineWidth: mark * 0.12, lineCap: .round))
                    .frame(width: mark * 0.6, height: mark * 0.6)
                    .rotationEffect(.degrees(-6))
                Circle()
                    .fill(Theme.accent)
                    .frame(width: mark * 0.132, height: mark * 0.132)
                    .scaleEffect(dotScale)
                    .offset(x: mark * 0.247, y: -mark * 0.186)
                    .rotationEffect(.degrees(dotTurn))
            }
            .frame(width: mark, height: mark)
            .padding(.horizontal, -size * 0.2)
            Text("orbit")
                .font(.system(size: size, weight: .semibold, design: .rounded))
                .tracking(-size * 0.035)
                .foregroundStyle(LinearGradient(colors: [ink, ink.opacity(0.72)], startPoint: .top, endPoint: .bottom))
                .opacity(wordShown ? 1 : 0)
                .blur(radius: wordShown ? 0 : 8)
                .offset(x: wordShown ? 0 : -18)
        }
    }

    private func play() {
        guard !started else { return }
        started = true
        if reduceMotion {
            ringTrim = fullTrim; dotTurn = 0; dotScale = 1; wordShown = true
            withAnimation(.easeOut(duration: 0.35)) { coverOpacity = 0 }
            finish(after: 0.4)
            return
        }
        let orbit = Animation.timingCurve(0.45, 0.05, 0.25, 1, duration: 1.0)
        withAnimation(orbit) { dotTurn = 0; dotScale = 1 }
        withAnimation(.timingCurve(0.45, 0.05, 0.25, 1, duration: 0.88)) { ringTrim = fullTrim }
        let ease = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.5)
        withAnimation(ease.delay(0.95)) { wordShown = true }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.65))
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.65)) { landed = true }
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.6).delay(0.08)) { coverOpacity = 0 }
            finish(after: 0.7)
        }
    }

    private func finish(after seconds: Double) {
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(seconds))
            app.introCover = false
        }
    }
}

/// 着地：幕のロゴを、始まりのページのロゴの位置・大きさへ動かす。
/// 始まりのページが出ていない（`to` が空）ときは、その場で少し小さくなって消える。
private struct LandingEffect: ViewModifier {
    let landed: Bool
    let from: CGRect
    let to: CGRect

    func body(content: Content) -> some View {
        let hasTarget = to.height > 0 && from.height > 0
        let scale = landed ? (hasTarget ? to.height / from.height : 0.8) : 1
        let dx = landed && hasTarget ? to.midX - from.midX : 0
        let dy = landed && hasTarget ? to.midY - from.midY : 0
        content
            .scaleEffect(scale)
            .offset(x: dx, y: dy)
            .opacity(landed && !hasTarget ? 0 : 1)
    }
}
