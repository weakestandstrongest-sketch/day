import SwiftUI

/// 左端からスワイプで出るサイドバー（Arc / Dia / Comet）。
/// スペース、ピン留め、縦に並ぶタブ、ブラウザの操作がここにまとまる。
struct SidebarView: View {
    @Environment(AppModel.self) private var app
    @State private var editingSpace: BrowserSpace?
    @State private var creatingSpace = false
    @State private var showArchive = false
    @State private var deletingSpace: BrowserSpace?

    private let pinColumns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 4)

    var body: some View {
        let space = app.tabs.currentSpace
        let all = app.tabs.currentSpaceTabs
        let pinned = all.filter(\.isPinned)
        let others = all.filter { !$0.isPinned }

        VStack(alignment: .leading, spacing: 14) {
            header(space, count: all.count)
            controls

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    if !pinned.isEmpty {
                        LazyVGrid(columns: pinColumns, spacing: 10) {
                            ForEach(pinned) { tab in
                                Button {
                                    select(tab)
                                } label: {
                                    SiteIcon(url: tab.url, size: 34)
                                        .frame(maxWidth: .infinity)
                                        .frame(height: 54)
                                        .glass(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                        .overlay {
                                            if tab.id == app.tabs.current?.id {
                                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                                    .strokeBorder(space.theme.gradient, lineWidth: 2)
                                            }
                                        }
                                }
                                .buttonStyle(.plain)
                                .contextMenu { tabMenu(tab) }
                                .accessibilityLabel(tab.displayTitle)
                            }
                        }
                        .padding(.bottom, 8)
                    }

                    Button {
                        app.tabs.newTab()
                        app.showSidebar = false
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "plus")
                                .font(.subheadline.weight(.semibold))
                                .frame(width: 26, height: 26)
                            Text("新しいタブ").font(.subheadline)
                            Spacer()
                        }
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .frame(height: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)

                    ForEach(others) { tab in
                        tabRow(tab, selected: tab.id == app.tabs.current?.id, space: space)
                    }

                    if !space.isPrivate && !app.tabs.archived.isEmpty {
                        Button {
                            showArchive = true
                        } label: {
                            Label("アーカイブ（\(app.tabs.archived.count)）", systemImage: "archivebox")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 10)
                                .padding(.top, 10)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)

            dock
        }
        .padding(.leading, 14)
        .padding(.trailing, 8)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .sheet(item: $editingSpace) { space in
            SpaceEditor(space: space, canDelete: app.tabs.spaces.count > 1) { updated in
                app.tabs.updateSpace(updated)
            } onDelete: {
                app.tabs.deleteSpace(space)
            }
        }
        .sheet(isPresented: $creatingSpace) {
            SpaceEditor(space: BrowserSpace(name: "", icon: "star", theme: .mint), canDelete: false) { created in
                let space = app.tabs.addSpace(name: created.name, icon: created.icon, theme: created.theme)
                app.tabs.switchSpace(to: space.id)
            } onDelete: {}
        }
        .sheet(isPresented: $showArchive) {
            ArchiveView().environment(app)
        }
        .confirmationDialog("スペース「\(deletingSpace?.name ?? "")」を削除しますか？",
                            isPresented: Binding(get: { deletingSpace != nil }, set: { if !$0 { deletingSpace = nil } }),
                            titleVisibility: .visible) {
            Button("スペースとその中のタブを削除", role: .destructive) {
                if let space = deletingSpace { app.tabs.deleteSpace(space, keepTabs: false) }
                deletingSpace = nil
            }
            Button("スペースだけ削除（タブは残す）") {
                if let space = deletingSpace { app.tabs.deleteSpace(space, keepTabs: true) }
                deletingSpace = nil
            }
        } message: {
            Text("ピン留めも含めて、このスペースがなくなります。")
        }
    }

    private func select(_ tab: BrowserTab) {
        app.tabs.select(tab)
        app.showSidebar = false
    }

    // MARK: Pieces

    private func header(_ space: BrowserSpace, count: Int) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Circle().fill(space.theme.gradient).frame(width: 8, height: 8)
                    Image(systemName: space.icon).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                }
                // iPhone の「メモ」「写真」などと同じ、大きなタイトルの書体（SF Pro の太字）
                Text(space.name)
                    .font(.largeTitle.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(space.isPrivate ? "履歴を残しません" : "\(count)個のタブ")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Menu {
                Button {
                    app.run(Skill(name: "タブを整理", icon: "square.grid.2x2",
                                  prompt: "開いているタブをテーマごとにグループ分けし、それぞれの要点を一行でまとめてください。不要そうなタブがあれば指摘してください。",
                                  scope: .allTabs))
                } label: { Label("AIでタブを整理", systemImage: "sparkles") }
                if !space.isPrivate {
                    Button {
                        editingSpace = space
                    } label: { Label("このスペースを編集", systemImage: "pencil") }
                }
                Button(role: .destructive) {
                    app.tabs.closeAll(in: space.id)
                } label: { Label("ピン留め以外のタブを閉じる", systemImage: "xmark.square") }
                if !space.isPrivate && app.tabs.spaces.count > 1 {
                    Button(role: .destructive) {
                        deletingSpace = space
                    } label: { Label("このスペースを削除", systemImage: "trash") }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 36, height: 36)
                    .glass(Circle())
            }
        }
    }

    /// 戻る・進む・再読み込み・共有
    private var controls: some View {
        let tab = app.tabs.current
        return HStack(spacing: 8) {
            control("chevron.backward", enabled: tab?.canGoBack ?? false) { tab?.goBack() }
            control("chevron.forward", enabled: tab?.canGoForward ?? false) { tab?.goForward() }
            control("arrow.clockwise", enabled: !(tab?.isBlank ?? true)) { tab?.reload() }
            if let url = tab?.url {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .glass(RoundedRectangle(cornerRadius: 13, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func control(_ symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .glass(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }

    private func tabRow(_ tab: BrowserTab, selected: Bool, space: BrowserSpace) -> some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        return HStack(spacing: 10) {
            if tab.isBlank {
                Image(systemName: "sparkles")
                    .font(.footnote)
                    .foregroundStyle(space.theme.accent)
                    .frame(width: 26, height: 26)
            } else {
                SiteIcon(url: tab.url, size: 26)
            }
            Text(tab.displayTitle)
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .lineLimit(1)
            Spacer(minLength: 0)
            if tab.isLoading {
                ProgressView().controlSize(.mini)
            }
            Button {
                withAnimation { app.tabs.close(tab) }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("タブを閉じる")
        }
        .padding(.leading, 10)
        .padding(.trailing, 4)
        .frame(height: 46)
        .background {
            if selected {
                shape.fill(Color(.secondarySystemGroupedBackground))
                shape.strokeBorder(Color.primary.opacity(0.1), lineWidth: 1)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { select(tab) }
        .contextMenu { tabMenu(tab) }
    }

    /// 下のドック：スペースの切り替えと、スキル・設定
    private var dock: some View {
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(app.tabs.spaces + [BrowserSpace.privateSpace]) { space in
                        let selected = space.id == app.tabs.currentSpaceID
                        Button {
                            withAnimation(.snappy) { app.tabs.switchSpace(to: space.id) }
                        } label: {
                            Image(systemName: space.icon)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(selected ? Color(.systemBackground) : Color.primary)
                                .frame(width: 38, height: 38)
                                .background {
                                    if selected {
                                        Circle().fill(Color.primary)
                                    } else {
                                        Circle().strokeBorder(Color.primary.opacity(0.12), lineWidth: 1)
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            if !space.isPrivate {
                                Button {
                                    editingSpace = space
                                } label: { Label("編集", systemImage: "pencil") }
                                if app.tabs.spaces.count > 1 {
                                    Button(role: .destructive) {
                                        deletingSpace = space
                                    } label: { Label("スペースを削除", systemImage: "trash") }
                                }
                            }
                        }
                        .accessibilityLabel(space.name)
                    }
                    Button {
                        creatingSpace = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(width: 38, height: 38)
                            .overlay(Circle().strokeBorder(Color.secondary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [3])))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("スペースを追加")
                }
            }
            Button {
                app.showSkills = true
            } label: {
                Image(systemName: "wand.and.stars").frame(width: 38, height: 38).glass(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("スキル")
            Button {
                app.showSettings = true
            } label: {
                Image(systemName: "gearshape").frame(width: 38, height: 38).glass(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("設定")
        }
        .font(.footnote.weight(.semibold))
    }

    @ViewBuilder
    private func tabMenu(_ tab: BrowserTab) -> some View {
        if !tab.isPrivate {
            Button {
                app.tabs.togglePin(tab)
            } label: { Label(tab.isPinned ? "ピン留めを外す" : "ピン留め", systemImage: tab.isPinned ? "pin.slash" : "pin") }
            Menu {
                ForEach(app.tabs.spaces.filter { $0.id != tab.spaceID }) { space in
                    Button {
                        app.tabs.move(tab, to: space.id)
                    } label: { Label(space.name, systemImage: space.icon) }
                }
            } label: { Label("別のスペースへ移動", systemImage: "arrow.right.square") }
            if let url = tab.url {
                Button {
                    app.history.addToSpeedDial(title: tab.displayTitle, url: url)
                } label: { Label("お気に入りに追加", systemImage: "star") }
            }
        }
        Button(role: .destructive) {
            app.tabs.close(tab)
        } label: { Label("閉じる", systemImage: "xmark") }
    }
}
