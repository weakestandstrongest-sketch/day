import SwiftUI

/// AI パネル。ページのカードの下に並び（Comet のサイドカーを縦にした形）、タブと会話し（Dia）、ページを操作する。
struct AssistantPanel: View {
    @Environment(AppModel.self) private var app
    @State private var input = ""
    @State private var includeCurrent = true
    @State private var extraTabIDs: Set<UUID> = []
    @FocusState private var inputFocused: Bool

    private var engine: AssistantEngine { app.assistant }
    private var currentTab: BrowserTab? { app.tabs.current }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if engine.items.isEmpty {
                            emptyState
                        }
                        ForEach(engine.items) { item in
                            ChatItemView(item: item)
                                .id(item.id)
                        }
                        if let approval = engine.pendingApproval {
                            ApprovalCard(request: approval) { engine.resolveApproval($0) }
                        }
                        if engine.isRunning, let status = engine.statusText {
                            HStack(spacing: 8) {
                                ProgressView()
                                Text(status)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: engine.revision) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            composer
        }
        .background(Color(.secondarySystemGroupedBackground).opacity(0.94), in: shape)
        .overlay(shape.strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
        .overlay {
            if engine.isRunning {
                GlowBorder(shape: shape, lineWidth: 2)
            }
        }
        .environment(\.openURL, OpenURLAction { url in
            app.tabs.newTab(url: url)
            app.assistantExpanded = false
            return .handled
        })
    }

    /// つまみを上に引くと全画面、下に引くと閉じる。
    private var header: some View {
        VStack(spacing: 4) {
            Capsule()
                .fill(Color.secondary.opacity(0.35))
                .frame(width: 36, height: 4)
                .padding(.top, 8)
            HStack(spacing: 4) {
                Button {
                    engine.reset()
                } label: {
                    Image(systemName: "square.and.pencil").frame(width: 36, height: 36)
                }
                .disabled(engine.isRunning || engine.items.isEmpty)
                .accessibilityLabel("新しいチャット")
                Spacer(minLength: 0)
                VStack(spacing: 0) {
                    Text("Orbit").font(Theme.display(16))
                    Text(engine.usesCloud ? "\(engine.modelLabel)（クラウド）" : "\(engine.modelLabel) ・ この iPhone の中")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Button {
                    app.assistantExpanded.toggle()
                } label: {
                    Image(systemName: app.assistantExpanded ? "rectangle.split.1x2" : "arrow.up.left.and.arrow.down.right")
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel(app.assistantExpanded ? "ページと並べる" : "全画面")
                Button {
                    inputFocused = false
                    app.showAssistant = false
                } label: {
                    Image(systemName: "xmark").frame(width: 36, height: 36)
                }
                .accessibilityLabel("閉じる")
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 8)
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 12)
                .onEnded { value in
                    if value.translation.height < -40 {
                        app.assistantExpanded = true
                    } else if value.translation.height > 40 {
                        if app.assistantExpanded {
                            app.assistantExpanded = false
                        } else {
                            inputFocused = false
                            app.showAssistant = false
                        }
                    }
                }
        )
    }

    // MARK: Empty state

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                OrbView(size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text("何をお手伝いしましょう？").font(.headline)
                    Text(currentTab?.isBlank == false
                         ? "表示中のページについて質問したり、操作を任せたりできます。"
                         : "質問するか、やりたいことを伝えてください。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            if engine.usesCloud && !app.settings.hasAPIKey {
                Button {
                    app.showSettings = true
                } label: {
                    Label("クラウドAIを使うには、設定でAPIキーを入力してください", systemImage: "key.fill")
                        .font(.footnote.weight(.semibold))
                }
            } else if !engine.usesCloud && !app.localAI.isReady {
                VStack(alignment: .leading, spacing: 8) {
                    Text("AIはこのiPhoneの中で動きます（ページの内容は外に送られません）。はじめにモデルを用意してください。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button {
                            app.showModels = true
                    } label: {
                        Label("AIモデルを選ぶ・ダウンロード", systemImage: "arrow.down.circle.fill")
                            .font(.footnote.weight(.semibold))
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("例").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                exampleButton("このページの要点は？")
                exampleButton("このページで一番安いプランを探して")
                exampleButton("このサイトで「お問い合わせ」ページを開いて")
            }
        }
        .padding(.top, 8)
    }

    private func exampleButton(_ text: String) -> some View {
        Button {
            input = text
            inputFocused = true
        } label: {
            Text(text)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.secondarySystemBackground), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: Composer

    private var attachedTabs: [BrowserTab] {
        var result: [BrowserTab] = []
        if includeCurrent, let currentTab, !currentTab.isBlank { result.append(currentTab) }
        result += app.tabs.tabs.filter { extraTabIDs.contains($0.id) && $0.id != currentTab?.id && !$0.isBlank }
        return result
    }

    private var visibleSkills: [Skill] {
        let text = input.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("/") {
            let query = String(text.dropFirst()).components(separatedBy: " ").first ?? ""
            return app.skills.skills.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
        }
        return text.isEmpty ? app.skills.skills : []
    }

    private var composer: some View {
        VStack(spacing: 8) {
            if !visibleSkills.isEmpty && !engine.isRunning {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(visibleSkills) { skill in
                            Button {
                                runSkill(skill)
                            } label: {
                                Label(skill.name, systemImage: skill.icon)
                                    .font(.footnote.weight(.medium))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .overlay(Capsule().strokeBorder(Color.primary.opacity(0.14), lineWidth: 1))
                                    .foregroundStyle(.primary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if let currentTab, !currentTab.isBlank {
                        ContextChip(title: currentTab.displayTitle, icon: "doc.text", isOn: includeCurrent) {
                            includeCurrent.toggle()
                        }
                    }
                    ForEach(app.tabs.tabs.filter { extraTabIDs.contains($0.id) && $0.id != currentTab?.id }) { tab in
                        ContextChip(title: tab.displayTitle, icon: "square.on.square", isOn: true) {
                            extraTabIDs.remove(tab.id)
                        }
                    }
                    let others = app.tabs.tabs.filter { !$0.isBlank && $0.id != currentTab?.id && !extraTabIDs.contains($0.id) }
                    if !others.isEmpty {
                        Menu {
                            ForEach(others) { tab in
                                Button(tab.displayTitle) { extraTabIDs.insert(tab.id) }
                            }
                        } label: {
                            Label("タブを追加", systemImage: "plus")
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color(.tertiarySystemFill), in: Capsule())
                        }
                    }
                }
                .padding(.horizontal)
            }

            HStack(alignment: .bottom, spacing: 8) {
                Button {
                    engine.agentMode.toggle()
                } label: {
                    Image(systemName: "wand.and.stars")
                        .font(.body.weight(.semibold))
                        .frame(width: 36, height: 36)
                        .background(engine.agentMode ? Theme.accent.opacity(0.18) : Color(.tertiarySystemFill), in: Circle())
                        .foregroundStyle(engine.agentMode ? Theme.accent : Color.secondary)
                }
                .accessibilityLabel(engine.agentMode ? "ブラウザ操作: オン" : "ブラウザ操作: オフ")

                Button {
                    engine.webMode.toggle()
                } label: {
                    Image(systemName: "globe")
                        .font(.body.weight(.semibold))
                        .frame(width: 36, height: 36)
                        .background(engine.webMode ? Theme.accent.opacity(0.18) : Color(.tertiarySystemFill), in: Circle())
                        .foregroundStyle(engine.webMode ? Theme.accent : Color.secondary)
                }
                .disabled(engine.usesCloud && !app.settings.modelOption.supportsWebSearch)
                .accessibilityLabel(engine.webMode ? "Webで調べる: オン" : "Webで調べる: オフ")

                TextField(engine.webMode ? "Webで調べたいこと…" : (engine.agentMode ? "質問、または「〜して」と指示…" : "このページについて質問…"), text: $input, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($inputFocused)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                    .submitLabel(.send)
                    .onSubmit(send)

                if engine.isRunning {
                    Button {
                        engine.stop()
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.system(size: 34))
                            .foregroundStyle(.red)
                    }
                    .accessibilityLabel("停止")
                } else {
                    Button(action: send) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 34))
                            .foregroundStyle(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.secondary.opacity(0.5) : Color.primary)
                    }
                    .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityLabel("送信")
                }
            }
            .padding(.horizontal)
        }
        .padding(.vertical, 8)
    }

    private func send() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !engine.isRunning else { return }
        if text.hasPrefix("/") {
            let body = String(text.dropFirst())
            let name = body.components(separatedBy: " ").first ?? ""
            if let skill = app.skills.skill(named: name) {
                input = ""
                runSkill(skill, extra: String(body.dropFirst(name.count)))
                return
            }
        }
        input = ""
        engine.send(text, attaching: attachedTabs)
    }

    private func runSkill(_ skill: Skill, extra: String = "") {
        let extraTrimmed = extra.trimmingCharacters(in: .whitespacesAndNewlines)
        let prompt = extraTrimmed.isEmpty ? skill.prompt : skill.prompt + "\n\n追加の指示: " + extraTrimmed
        let tabs: [BrowserTab]
        switch skill.scope {
        case .currentTab: tabs = attachedTabs
        case .allTabs: tabs = app.tabs.currentSpaceTabs.filter { !$0.isBlank }
        case .none: tabs = []
        }
        input = ""
        engine.send(prompt, attaching: tabs, displayText: "/" + skill.name + (extraTrimmed.isEmpty ? "" : " " + extraTrimmed),
                    mode: skill.usesAgent ? .agent : .chat)
    }
}

private struct ContextChip: View {
    let title: String
    let icon: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                Text(title).lineLimit(1).frame(maxWidth: 160, alignment: .leading)
                Image(systemName: isOn ? "checkmark" : "plus")
                    .font(.caption2.weight(.bold))
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(isOn ? Theme.accent.opacity(0.15) : Color(.tertiarySystemFill), in: Capsule())
            .foregroundStyle(isOn ? Theme.accent : Color.secondary)
        }
        .buttonStyle(.plain)
    }
}

private struct ApprovalCard: View {
    let request: ApprovalRequest
    let onDecide: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("操作の許可が必要です", systemImage: "hand.raised.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.orange)
            Text(request.title).font(.subheadline.weight(.semibold))
            if !request.detail.isEmpty {
                Text(request.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            HStack {
                Button("拒否") { onDecide(false) }
                    .buttonStyle(.bordered)
                Button("許可") { onDecide(true) }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.orange.opacity(0.4)))
    }
}
