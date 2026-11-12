import SwiftUI

/// 端末の中で動かすモデルを選び、ダウンロードする（ひび手帳の まいにち と同じモデル）。
struct ModelManagerView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let ai = app.localAI
        List {
            Section {
                LabeledContent("iPhoneのメモリ", value: ByteCountFormatter.string(fromByteCount: ai.physicalMemory, countStyle: .memory))
                LabeledContent("空き容量", value: ai.freeBytes > 0 ? ByteCountFormatter.string(fromByteCount: ai.freeBytes, countStyle: .file) : "-")
            } footer: {
                Text("AIはこのiPhoneの中（llama.cpp / Apple Intelligence）で動き、ページの内容や質問は外に送られません。通信するのはモデルのダウンロードだけです。")
            }

            Section("モデル") {
                ForEach(LocalModel.catalog) { model in
                    ModelRow(model: model)
                }
            }

            Section {
                Picker("コンテキスト長", selection: Binding(get: { ai.contextSetting }, set: { ai.contextSetting = $0 })) {
                    Text("自動（いまは \(ai.physicalMemory >= 7_500_000_000 ? 8192 : 4096)）").tag(0)
                    Text("4096（軽い）").tag(4096)
                    Text("8192（長いページ向け）").tag(8192)
                    Text("16384（メモリが多い iPhone 向け）").tag(16384)
                }
            } footer: {
                Text("一度に読めるページの長さです。長くするとメモリを多く使います。うまく動かないときは短くしてください。")
            }
        }
        .navigationTitle("AIモデル")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { ai.refresh() }
    }
}

private struct ModelRow: View {
    @Environment(AppModel.self) private var app
    let model: LocalModel
    @State private var confirmDelete = false

    var body: some View {
        let ai = app.localAI
        let selected = ai.selectedModelID == model.id
        let downloaded = model.kind == .apple ? ai.appleState == "available" : ai.downloaded.contains(model.id)
        let progress = ai.downloads[model.id]
        let tooBig = model.kind == .gguf && Double(model.bytes) > Double(ai.physicalMemory) * 0.6

        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Theme.accent : Color.secondary)
                    .font(.title3)
                    .onTapGesture { if downloaded { ai.selectedModelID = model.id } }
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(model.name).font(.body.weight(.semibold))
                        if model.recommended {
                            Text("おすすめ").font(.caption2.weight(.bold))
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Theme.accent.opacity(0.15), in: Capsule())
                                .foregroundStyle(Theme.accent)
                        }
                    }
                    Text("\(model.provider) ・ \(model.sizeLabel)\(model.goodForAgent ? " ・ ページ操作向き" : "")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(model.summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if model.kind == .apple && ai.appleState != "available" {
                        Text(AppleLLM.explain(ai.appleState)).font(.caption).foregroundStyle(.orange)
                    }
                    if tooBig {
                        Text("このiPhoneのメモリでは動かないかもしれません。").font(.caption).foregroundStyle(.orange)
                    }
                    if let error = ai.downloadErrors[model.id] {
                        Text(error).font(.caption).foregroundStyle(.red)
                    }
                }
                Spacer(minLength: 0)
            }

            if let progress {
                HStack {
                    ProgressView(value: progress.fraction)
                    Text("\(Int(progress.fraction * 100))%").font(.caption.monospacedDigit())
                    Button("やめる") { ai.cancelDownload(model) }
                        .font(.caption)
                        .buttonStyle(.bordered)
                }
            } else if model.kind == .gguf {
                HStack {
                    if downloaded {
                        if !selected {
                            Button("使う") { ai.selectedModelID = model.id }
                                .buttonStyle(.borderedProminent)
                        }
                        Button("削除", role: .destructive) { confirmDelete = true }
                            .buttonStyle(.bordered)
                    } else {
                        Button {
                            ai.download(model)
                        } label: {
                            Label("ダウンロード（\(model.sizeLabel)）", systemImage: "arrow.down.circle")
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .font(.footnote)
            } else if downloaded && !selected {
                Button("使う") { ai.selectedModelID = model.id }
                    .buttonStyle(.borderedProminent)
                    .font(.footnote)
            }
        }
        .padding(.vertical, 4)
        .confirmationDialog("\(model.name) を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("削除（\(model.sizeLabel)）", role: .destructive) {
                Task { await ai.delete(model) }
            }
        }
    }
}
