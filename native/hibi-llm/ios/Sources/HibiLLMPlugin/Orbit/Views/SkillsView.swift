import SwiftUI

struct SkillsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var editing: Skill?
    @State private var isCreating = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(app.skills.skills) { skill in
                        HStack(spacing: 12) {
                            Image(systemName: skill.icon)
                                .frame(width: 28)
                                .foregroundStyle(Theme.accent)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("/" + skill.name).font(.body.weight(.medium))
                                Text(skill.prompt).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Spacer()
                            Button {
                                app.run(skill)
                            } label: {
                                Image(systemName: "play.circle.fill").font(.title2)
                            }
                            .buttonStyle(.borderless)
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { editing = skill }
                    }
                    .onDelete { app.skills.skills.remove(atOffsets: $0) }
                    .onMove { app.skills.skills.move(fromOffsets: $0, toOffset: $1) }
                } footer: {
                    Text("スキルはよく使う指示のショートカットです。AIパネルやアドレスバーで「/名前」と入力しても実行できます。")
                }

                Section {
                    Button("初期スキルに戻す", role: .destructive) { app.skills.resetToDefaults() }
                }
            }
            .navigationTitle("スキル")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { EditButton() }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isCreating = true
                    } label: { Image(systemName: "plus") }
                }
                ToolbarItem(placement: .bottomBar) {
                    Button("完了") { dismiss() }
                }
            }
            .sheet(item: $editing) { skill in
                SkillEditor(skill: skill) { updated in
                    if let index = app.skills.skills.firstIndex(where: { $0.id == updated.id }) {
                        app.skills.skills[index] = updated
                    }
                }
            }
            .sheet(isPresented: $isCreating) {
                SkillEditor(skill: Skill(name: "", icon: "sparkles", prompt: "")) { created in
                    app.skills.skills.append(created)
                }
            }
        }
    }
}

private struct SkillEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var skill: Skill
    let onSave: (Skill) -> Void

    private let columns = Array(repeating: GridItem(.flexible()), count: 8)

    var body: some View {
        NavigationStack {
            Form {
                Section("名前") {
                    TextField("例：要約", text: $skill.name)
                }
                Section("アイコン") {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(SkillStore.icons, id: \.self) { icon in
                            Image(systemName: icon)
                                .frame(width: 32, height: 32)
                                .background(skill.icon == icon ? Theme.accent.opacity(0.2) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                                .foregroundStyle(skill.icon == icon ? Theme.accent : Color.primary)
                                .onTapGesture { skill.icon = icon }
                        }
                    }
                    .padding(.vertical, 4)
                }
                Section("AIへの指示") {
                    TextEditor(text: $skill.prompt)
                        .frame(minHeight: 140)
                }
                Section {
                    Picker("添付するタブ", selection: $skill.scope) {
                        ForEach(Skill.Scope.allCases) { scope in
                            Text(scope.label).tag(scope)
                        }
                    }
                    Toggle("ブラウザ操作を許可する", isOn: $skill.usesAgent)
                }
            }
            .navigationTitle(skill.name.isEmpty ? "新しいスキル" : skill.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        onSave(skill)
                        dismiss()
                    }
                    .disabled(skill.name.trimmingCharacters(in: .whitespaces).isEmpty ||
                              skill.prompt.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
