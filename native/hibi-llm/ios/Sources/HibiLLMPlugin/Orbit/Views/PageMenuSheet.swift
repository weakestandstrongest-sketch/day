import SwiftUI
import UIKit

/// Comet と同じ形の「…」メニュー：角の丸いカードに並ぶ行。
struct PageMenuSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let tab = app.tabs.current
        let hasPage = !(tab?.isBlank ?? true)
        ScrollView {
            VStack(spacing: 10) {
                card {
                    let fav = app.history.isFavorite(tab?.url)
                    row(fav ? "star.slash" : "star", fav ? "お気に入りから外す" : "お気に入りに追加", enabled: hasPage) {
                        dismiss()
                        app.toggleFavoriteForCurrentPage()
                    }
                    row("text.alignleft", "要約する", enabled: hasPage) {
                        if let skill = app.skills.skills.first { app.run(skill) }
                    }
                    row("bubble.left.and.text.bubble.right", "このページについて質問する", enabled: hasPage) {
                        dismiss()
                        app.showAssistant = true
                    }
                    row("character.bubble", "翻訳", enabled: hasPage) {
                        if let skill = app.skills.skill(named: "翻訳") { app.run(skill) }
                    }
                    row("magnifyingglass", "ページ内を検索", enabled: hasPage) {
                        dismiss()
                        tab?.findInPage()
                    }
                    row("eye.slash", "気を逸らす項目を非表示", enabled: hasPage) {
                        dismiss()
                        app.tabs.startPicking()
                    }
                    row("desktopcomputer", (tab?.desktopMode ?? false) ? "モバイル用サイトに戻す" : "デスクトップサイトをリクエスト", enabled: hasPage) {
                        dismiss()
                        tab?.toggleDesktopMode()
                    }
                    row((tab?.isPinned ?? false) ? "pin.slash" : "pin", (tab?.isPinned ?? false) ? "ピン留めを外す" : "ピン留め", enabled: hasPage) {
                        if let tab { app.tabs.togglePin(tab) }
                        dismiss()
                    }
                    row("doc.on.doc", "URLをコピー", enabled: hasPage) {
                        UIPasteboard.general.url = tab?.url
                        dismiss()
                    }
                    if let url = tab?.url {
                        ShareLink(item: url) {
                            rowLabel("square.and.arrow.up", "共有", enabled: true)
                        }
                        .buttonStyle(.plain)
                    }
                }
                card {
                    row("eyeglasses", "プライベートタブ") {
                        dismiss()
                        app.tabs.newTab(in: BrowserSpace.privateID)
                    }
                    row("wand.and.stars", "スキル") {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { app.showSkills = true }
                    }
                    row("gearshape", "設定") {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { app.showSettings = true }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 26)
            .padding(.bottom, 20)
        }
        .scrollIndicators(.hidden)
    }

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private func row(_ icon: String, _ title: String, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            rowLabel(icon, title, enabled: enabled)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private func rowLabel(_ icon: String, _ title: String, enabled: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .frame(width: 26)
                Text(title)
                    .font(.body)
                Spacer(minLength: 0)
            }
            .foregroundStyle(enabled ? Color.primary.opacity(0.9) : Color.secondary.opacity(0.45))
            .padding(.horizontal, 18)
            .frame(height: 54)
            Rectangle()
                .fill(Color.primary.opacity(0.08))
                .frame(height: 1)
        }
        .contentShape(Rectangle())
    }
}
