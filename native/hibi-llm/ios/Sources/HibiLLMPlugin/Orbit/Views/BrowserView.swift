import SwiftUI
import UIKit

/// 画面全体。光の背景の上にページのカードが浮かび、
/// 左端から右へスワイプでサイドバー、右端から左へスワイプで AI が出る。
struct BrowserView: View {
    @Environment(AppModel.self) private var app
    @State private var drag: CGFloat = 0

    private let spring = Animation.spring(response: 0.38, dampingFraction: 0.86)

    var body: some View {
        @Bindable var app = app
        ZStack {
            GeometryReader { geo in
                let width = min(geo.size.width * 0.84, 340)
                let progress = min(1, max(0, (app.showSidebar ? 1 : 0) + drag / width))
                ZStack(alignment: .leading) {
                    AuroraBackground(theme: app.tabs.currentSpace.theme, active: app.assistant.isRunning, muted: app.tabs.isPrivate)

                    SidebarView()
                        .frame(width: width)
                        .offset(x: (progress - 1) * width * 0.35)
                        .opacity(Double(progress))
                        .allowsHitTesting(app.showSidebar)

                    stage(height: geo.size.height, sidebarWidth: width)
                        .scaleEffect(1 - 0.08 * progress, anchor: .leading)
                        .offset(x: progress * width)

                    if !app.showSidebar && !app.showCommandBar && app.tabs.pickingTabID == nil {
                        edgeStrips(sidebarWidth: width)
                    }
                }
            }
            .ignoresSafeArea(app.showAssistant ? [] : .keyboard, edges: .bottom)

            if app.showCommandBar {
                CommandBarView()
                    .transition(.opacity)
                    .zIndex(10)
            }

            if app.introCover {
                LaunchIntroView()
                    .zIndex(100)
            }
        }
        .animation(spring, value: app.showSidebar)
        .animation(spring, value: app.showAssistant)
        .animation(spring, value: app.assistantExpanded)
        .overlay(alignment: .bottom) {
            if let toast = app.toast {
                Label(toast, systemImage: app.toastIcon ?? (toast.contains("外し") ? "star.slash" : "star.fill"))
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .multilineTextAlignment(.leading)
                    .glass(Capsule())
                    .padding(.horizontal, 20)
                    .padding(.bottom, 150)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .allowsHitTesting(false)
            }
        }
        .animation(.snappy, value: app.toast)
        // 単独のアプリでは、画面が出たらすぐ開いたときのアニメーション（ひび手帳の中では、Orbit が出きってから）
        .onAppear { if !OrbitEmbed.embedded { app.startIntro() } }
        .animation(.easeOut(duration: 0.2), value: app.showCommandBar)
        .animation(.snappy(duration: 0.25), value: app.tabs.chromeCollapsed)
        .sheet(isPresented: $app.showSettings) {
            SettingsView().environment(app)
        }
        .sheet(isPresented: $app.showPageMenu) {
            PageMenuSheet()
                .environment(app)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(.clear)
        }
        .sheet(isPresented: $app.showSkills) {
            SkillsView().environment(app)
        }
        .sheet(isPresented: $app.showModels) {
            NavigationStack {
                ModelManagerView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("完了") { app.showModels = false }
                        }
                    }
            }
            .environment(app)
        }
    }

    // MARK: Stage (page card + capsule / assistant)

    private func stage(height: CGFloat, sidebarWidth: CGFloat) -> some View {
        let tab = app.tabs.current
        return VStack(spacing: 8) {
            if app.showAssistant && app.assistantExpanded {
                pageStrip(tab)
            } else {
                pageCard(tab)
                    .frame(height: app.showAssistant ? max(140, height * 0.36) : nil)
            }
            if app.showAssistant {
                AssistantPanel()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                CommandCapsule()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 6)
        .overlay {
            if app.showSidebar {
                Color.black.opacity(0.001)
                    .onTapGesture { app.showSidebar = false }
                    .gesture(
                        // 指の動きは画面全体の座標で測る。動いているカードの座標で測ると、
                        // カードが指についてくるたびに移動量が変わり、位置が行ったり来たりしてガクガクした
                        DragGesture(minimumDistance: 6, coordinateSpace: .global)
                            .onChanged { drag = min(0, $0.translation.width) }
                            .onEnded { value in
                                let close = value.translation.width < -sidebarWidth * 0.25 || value.predictedEndTranslation.width < -sidebarWidth * 0.5
                                withAnimation(spring) {
                                    drag = 0
                                    if close { app.showSidebar = false }
                                }
                            }
                    )
            }
        }
    }

    private func pageCard(_ tab: BrowserTab?) -> some View {
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        let blank = tab?.isBlank ?? true
        return ZStack {
            if let tab, !tab.isBlank {
                WebViewContainer(webView: tab.webView)
                    .id(tab.id)
            } else {
                StartPageView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(blank ? Color.clear : Color(.systemBackground))
        .clipShape(shape)
        .overlay {
            if !blank {
                if app.assistant.isRunning {
                    GlowBorder(shape: shape)
                } else {
                    shape.strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                }
            }
        }
        .shadow(color: .black.opacity(blank ? 0 : 0.1), radius: 20, y: 10)
    }

    /// AI を全画面にしているあいだの、ページの小さな帯。
    private func pageStrip(_ tab: BrowserTab?) -> some View {
        Button {
            app.assistantExpanded = false
        } label: {
            HStack(spacing: 10) {
                if let tab, !tab.isBlank {
                    SiteIcon(url: tab.url, size: 22)
                } else {
                    Image(systemName: "sparkles")
                }
                Text(tab?.displayTitle ?? "新しいタブ")
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "rectangle.split.1x2")
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .glass(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: Edge swipes

    private func edgeStrips(sidebarWidth: CGFloat) -> some View {
        HStack {
            Color.clear
                .frame(width: 20)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 6, coordinateSpace: .global)
                        .onChanged { drag = max(0, $0.translation.width) }
                        .onEnded { value in
                            let open = value.translation.width > sidebarWidth * 0.28 || value.predictedEndTranslation.width > sidebarWidth * 0.6
                            withAnimation(spring) {
                                drag = 0
                                if open { app.showSidebar = true }
                            }
                        }
                )
            Spacer()
            // ひび手帳の中では、右端からのスワイプはひび手帳へ戻る動き（ひび手帳の側で受け取る）
            if !OrbitEmbed.embedded {
            Color.clear
                .frame(width: 20)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 10, coordinateSpace: .global)
                        .onEnded { value in
                            if value.translation.width < -50 { app.showAssistant = true }
                        }
                )
            }
        }
        .padding(.bottom, 140)
    }
}

/// Comet と同じ2段の下バー。上段：サイトの設定・アドレス・再読み込み ＋ AI。下段：戻る・進む・新しいタブ・タブ・メニュー。
struct CommandCapsule: View {
    @Environment(AppModel.self) private var app
    @State private var dragOffset: CGFloat = 0

    var body: some View {
        let tab = app.tabs.current
        if app.tabs.pickingTabID != nil {
            pickerBar
        } else if app.tabs.chromeCollapsed {
            Button {
                app.tabs.chromeCollapsed = false
            } label: {
                HStack(spacing: 7) {
                    Circle().fill(Theme.accent).frame(width: 7, height: 7)
                    Text(addressText(tab))
                        .font(.caption.weight(.medium))
                        .lineLimit(1)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .glass(Capsule())
            }
            .buttonStyle(.plain)
        } else {
            let shape = RoundedRectangle(cornerRadius: 34, style: .continuous)
            VStack(spacing: 4) {
                HStack(spacing: 10) {
                    address(tab)
                    Button {
                        app.showAssistant = true
                    } label: {
                        OrbView(size: 32, animating: app.assistant.isRunning)
                            .frame(width: 50, height: 50)
                            .background(Color.primary.opacity(0.08), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .contextMenu { quickActions(tab) }
                    .accessibilityLabel("AIアシスタント")
                }
                HStack(spacing: 0) {
                    bar("chevron.backward", "戻る", enabled: tab?.canGoBack ?? false) { tab?.goBack() }
                    bar("chevron.forward", "進む", enabled: tab?.canGoForward ?? false) { tab?.goForward() }
                    bar("plus", "新しいタブ") { app.tabs.newTab() }
                    bar("square.on.square", "タブ") { app.showSidebar = true }
                    bar("ellipsis", "メニュー") { app.showPageMenu = true }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
            .padding(.bottom, 4)
            .glass(shape)
            .overlay {
                if app.assistant.isRunning {
                    GlowBorder(shape: shape, lineWidth: 2)
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func bar(_ symbol: String, _ label: String, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 19, weight: .regular))
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .foregroundStyle(enabled ? Color.primary : Color.secondary.opacity(0.45))
        .accessibilityLabel(label)
    }

    /// 左右にスワイプすると隣のタブへ。タップで検索・URL・AI への質問。
    private func address(_ tab: BrowserTab?) -> some View {
        HStack(spacing: 4) {
            siteMenu(tab)
            Spacer(minLength: 0)
            Text(addressText(tab))
                .font(.body)
                .foregroundStyle((tab?.isBlank ?? true) ? Color.secondary : Color.primary.opacity(0.85))
                .lineLimit(1)
            Spacer(minLength: 0)
            if let tab, !tab.isBlank {
                let fav = app.history.isFavorite(tab.url)
                Button {
                    app.toggleFavoriteForCurrentPage()
                } label: {
                    Image(systemName: fav ? "star.fill" : "star")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(fav ? Theme.accent : Color.secondary)
                        .frame(width: 34, height: 50)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(fav ? "お気に入りから外す" : "お気に入りに追加")
            }
            Button {
                if let tab { tab.isLoading ? tab.stopLoading() : tab.reload() }
            } label: {
                Image(systemName: (tab?.isLoading ?? false) ? "xmark" : "arrow.clockwise")
                    .font(.system(size: 16, weight: .medium))
                    .frame(width: 44, height: 50)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .opacity((tab?.isBlank ?? true) ? 0 : 1)
            .accessibilityLabel("再読み込み")
        }
        .frame(height: 50)
        .background(Color.primary.opacity(0.08), in: Capsule())
        .overlay(alignment: .bottomLeading) {
            if let tab, tab.isLoading {
                GeometryReader { geo in
                    Capsule()
                        .fill(Theme.accent)
                        .frame(width: max(8, geo.size.width * tab.progress), height: 2.5)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                }
                .padding(.horizontal, 22)
                .allowsHitTesting(false)
            }
        }
        .contentShape(Capsule())
        .onTapGesture { app.showCommandBar = true }
        .offset(x: dragOffset)
        .simultaneousGesture(
            DragGesture(minimumDistance: 20, coordinateSpace: .global) // 動くカプセルではなく画面の座標で測る（ガクガクしないように）
                .onChanged { value in
                    if abs(value.translation.width) > abs(value.translation.height) {
                        dragOffset = value.translation.width / 3
                    }
                }
                .onEnded { value in
                    let dx = value.translation.width
                    withAnimation(.snappy) { dragOffset = 0 }
                    guard abs(dx) > 60, abs(dx) > abs(value.translation.height) else { return }
                    app.tabs.selectAdjacent(dx < 0 ? 1 : -1)
                }
        )
    }

    /// このサイトの設定（Comet の左のつまみ）
    private func siteMenu(_ tab: BrowserTab?) -> some View {
        Menu {
            if let tab, !tab.isBlank {
                Button {
                    app.tabs.startPicking()
                } label: { Label("気を逸らす項目を非表示", systemImage: "eye.slash") }
                if app.tabs.hiddenCountForCurrent > 0 {
                    Button {
                        app.tabs.resetHidden()
                    } label: { Label("非表示の項目を元に戻す（\(app.tabs.hiddenCountForCurrent)）", systemImage: "eye") }
                }
                Button {
                    tab.toggleDesktopMode()
                } label: { Label(tab.desktopMode ? "モバイル用サイトに戻す" : "デスクトップサイトをリクエスト", systemImage: "desktopcomputer") }
                Divider()
            }
            Picker("広告ブロック", selection: Binding(
                get: { app.settings.adBlockLevel },
                set: { level in
                    app.settings.adBlockLevel = level
                    Task {
                        await app.tabs.setAdBlock(level)
                        app.tabs.current?.reload()
                    }
                })) {
                ForEach(AdBlockLevel.allCases) { level in
                    Text("広告ブロック：\(level.label)").tag(level)
                }
            }
        } label: {
            Image(systemName: app.tabs.isPrivate ? "eyeglasses" : "slider.vertical.3")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(app.settings.adBlockLevel == .off ? Color.secondary : Theme.accent)
                .frame(width: 44, height: 50)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("このサイトの設定")
    }

    /// 「気を逸らす項目を非表示」で項目を選んでいるあいだのバー
    private var pickerBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "eye.slash")
                .foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text("非表示にする項目をタップ").font(.subheadline.weight(.semibold))
                Text("このサイトで \(app.tabs.hiddenCountForCurrent) 件を非表示中")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Button("元に戻す") { app.tabs.undoLastHidden() }
                .disabled(app.tabs.hiddenCountForCurrent == 0)
            Button("完了") { app.tabs.stopPicking() }
                .fontWeight(.semibold)
        }
        .font(.subheadline)
        .padding(.horizontal, 18)
        .frame(height: 64)
        .glass(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private func quickActions(_ tab: BrowserTab?) -> some View {
        if let tab, !tab.isBlank {
            ForEach(app.skills.skills.prefix(4)) { skill in
                Button {
                    app.run(skill)
                } label: { Label(skill.name, systemImage: skill.icon) }
            }
            Divider()
        }
        Button {
            app.showCommandBar = true
        } label: { Label("Webでまとめて調べる", systemImage: "globe") }
    }

    private func addressText(_ tab: BrowserTab?) -> String {
        guard let tab, !tab.isBlank else { return "検索またはAIに質問" }
        return URLParser.displayHost(tab.url)
    }
}
