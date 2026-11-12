import SwiftUI

/// スペースの名前・アイコン・色を決める。
struct SpaceEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var space: BrowserSpace
    let canDelete: Bool
    let onSave: (BrowserSpace) -> Void
    let onDelete: () -> Void

    private let columns = Array(repeating: GridItem(.flexible()), count: 8)

    var body: some View {
        NavigationStack {
            Form {
                Section("名前") {
                    TextField("例：旅行", text: $space.name)
                }
                Section("色") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(SpaceTheme.allCases) { theme in
                                Circle()
                                    .fill(theme.gradient)
                                    .frame(width: 36, height: 36)
                                    .overlay(Circle().strokeBorder(Color.primary, lineWidth: space.theme == theme ? 3 : 0))
                                    .onTapGesture { space.theme = theme }
                                    .accessibilityLabel(theme.label)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                Section("アイコン") {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(BrowserSpace.icons, id: \.self) { icon in
                            Image(systemName: icon)
                                .frame(width: 32, height: 32)
                                .background(space.icon == icon ? space.theme.accent.opacity(0.2) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                                .foregroundStyle(space.icon == icon ? space.theme.accent : Color.primary)
                                .onTapGesture { space.icon = icon }
                        }
                    }
                    .padding(.vertical, 4)
                }
                if canDelete {
                    Section {
                        Button("このスペースを削除", role: .destructive) {
                            onDelete()
                            dismiss()
                        }
                    } footer: {
                        Text("タブは最初のスペースに移ります。")
                    }
                }
            }
            .navigationTitle(space.name.isEmpty ? "新しいスペース" : space.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        onSave(space)
                        dismiss()
                    }
                    .disabled(space.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

/// 自動でしまったタブ（Arc のアーカイブ）。
struct ArchiveView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(app.tabs.archived) { item in
                        Button {
                            app.tabs.restore(item)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                SiteIcon(url: URL(string: item.url), size: 32)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title).lineLimit(1).foregroundStyle(.primary)
                                    Text("\(URLParser.displayHost(URL(string: item.url))) ・ \(item.archivedAt.formatted(.relative(presentation: .named)))")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                } footer: {
                    Text("しばらく見ていないタブは自動でここにしまわれます（設定で変更できます）。タップで開き直せます。")
                }
            }
            .navigationTitle("アーカイブ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("すべて削除", role: .destructive) { app.tabs.clearArchive() }
                        .disabled(app.tabs.archived.isEmpty)
                }
                ToolbarItem(placement: .confirmationAction) { Button("完了") { dismiss() } }
            }
        }
    }
}
