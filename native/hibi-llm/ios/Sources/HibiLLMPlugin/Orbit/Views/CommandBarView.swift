import SwiftUI

/// 統合コマンドバー。入力欄は親指の届く下にあり、候補はその上に積み上がる。
/// URL・検索・AI への質問・Web 調べもの・ブラウザ操作・スキル・タブ・履歴を1か所で。
struct CommandBarView: View {
    @Environment(AppModel.self) private var app
    @State private var text = ""
    @FocusState private var focused: Bool

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isCurrentURL: Bool { app.tabs.current?.url?.absoluteString == trimmed }

    private func close() {
        focused = false
        app.showCommandBar = false
    }

    var body: some View {
        let space = app.tabs.currentSpace
        ZStack(alignment: .bottom) {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()
                .onTapGesture { close() }

            VStack(spacing: 10) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        let tabs = matchingTabs
                        if !tabs.isEmpty {
                            section("開いているタブ") {
                                ForEach(tabs.prefix(5)) { tab in
                                    row("square.on.square", tab.displayTitle, URLParser.displayHost(tab.url)) {
                                        app.tabs.select(tab)
                                        close()
                                    }
                                }
                            }
                        }
                        let historyHits = (isSkillCommand || isCurrentURL) ? [] : app.history.search(trimmed, limit: 4)
                        if !historyHits.isEmpty {
                            section("履歴") {
                                ForEach(historyHits) { entry in
                                    row("clock.arrow.circlepath", entry.title.isEmpty ? entry.host : entry.title, entry.url) {
                                        if let url = URL(string: entry.url) { app.tabs.open(url) }
                                        close()
                                    }
                                }
                            }
                        }
                        let skills = matchingSkills
                        if !skills.isEmpty {
                            section("スキル") {
                                ForEach(skills) { skill in
                                    row(skill.icon, "/" + skill.name, skill.prompt) {
                                        app.run(skill, extra: skillExtra)
                                    }
                                }
                            }
                        }
                        if !trimmed.isEmpty && !isCurrentURL && !isSkillCommand {
                            section(nil) {
                                row("wand.and.stars", "AIに実行させる", "ブラウザを操作して代わりにやる") {
                                    app.ask(trimmed, mode: .agent)
                                }
                                row("globe", "Webでまとめて調べる", "AIが複数のページを読んで答える") {
                                    app.ask(trimmed, mode: .web)
                                }
                                row("sparkles", "AIに質問", trimmed) {
                                    app.ask(trimmed, mode: .chat)
                                }
                                row("magnifyingglass", "\(app.settings.searchEngine.name)で検索", trimmed) {
                                    app.search(trimmed)
                                    close()
                                }
                                if let url = URLParser.url(from: trimmed) {
                                    row("arrow.up.right", "開く", url.absoluteString) {
                                        app.tabs.open(url)
                                        close()
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 12)
                }
                .defaultScrollAnchor(.bottom)
                .scrollIndicators(.hidden)

                HStack(spacing: 10) {
                    OrbView(size: 22)
                    TextField("検索、URL、AIへの質問、/スキル", text: $text)
                        .focused($focused)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.webSearch)
                        .submitLabel(.go)
                        .onSubmit(submit)
                    if !text.isEmpty {
                        Button {
                            text = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary)
                        }
                        .accessibilityLabel("消去")
                    }
                    Button("閉じる") { close() }
                        .font(.subheadline.weight(.semibold))
                }
                .padding(.horizontal, 16)
                .frame(height: 54)
                .background(Color(.secondarySystemGroupedBackground), in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.gradient, lineWidth: 1.2))
                .background {
                    Capsule().fill(Theme.gradient).padding(.horizontal, 26).blur(radius: 16).opacity(0.55).offset(y: 8)
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 8)
            }
        }
        .onAppear {
            if let url = app.tabs.current?.url { text = url.absoluteString }
            focused = true
        }
    }

    // MARK: Matching

    private var isSkillCommand: Bool { trimmed.hasPrefix("/") }

    private var skillQuery: String {
        guard isSkillCommand else { return "" }
        return String(trimmed.dropFirst()).components(separatedBy: " ").first ?? ""
    }

    private var skillExtra: String {
        guard isSkillCommand, let space = trimmed.firstIndex(of: " ") else { return "" }
        return String(trimmed[space...])
    }

    private var matchingSkills: [Skill] {
        if isSkillCommand {
            let q = skillQuery
            return app.skills.skills.filter { q.isEmpty || $0.name.localizedCaseInsensitiveContains(q) }
        }
        return (trimmed.isEmpty || isCurrentURL) ? app.skills.skills : []
    }

    private var matchingTabs: [BrowserTab] {
        if isSkillCommand { return [] }
        let all = app.tabs.tabs.filter { !$0.isBlank && !$0.isPrivate && $0.id != app.tabs.current?.id }
        guard !trimmed.isEmpty, !isCurrentURL else { return all }
        return all.filter {
            $0.displayTitle.localizedCaseInsensitiveContains(trimmed) ||
            ($0.url?.absoluteString.localizedCaseInsensitiveContains(trimmed) ?? false)
        }
    }

    private func submit() {
        guard !trimmed.isEmpty else { return }
        if isSkillCommand, let skill = app.skills.skills.first(where: { $0.name == skillQuery }) ?? matchingSkills.first {
            app.run(skill, extra: skillExtra)
            return
        }
        if URLParser.url(from: trimmed) != nil || app.settings.omniboxDefault == .search {
            app.openOrSearch(trimmed)
            close()
        } else {
            app.ask(trimmed, mode: .auto)
        }
    }

    // MARK: Pieces

    private func section<Content: View>(_ title: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.leading, 8)
            }
            VStack(spacing: 0) {
                content()
            }
            .padding(.vertical, 4)
            .glass(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func row(_ icon: String, _ title: String, _ subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 32, height: 32)
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.primary.opacity(0.12), lineWidth: 1))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.primary).lineLimit(1)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
