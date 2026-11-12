import SwiftUI
import UniformTypeIdentifiers

/// ブックマークの HTML を読み込み、どのフォルダをお気に入りにするか選ぶ。
struct BookmarkImportView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var picking = false
    @State private var folders: [BookmarkImport.Folder] = []
    @State private var message: String?

    var body: some View {
        NavigationStack {
            List {
                if folders.isEmpty {
                    Section {
                        Button {
                            picking = true
                        } label: {
                            Label("ブックマークのファイルを選ぶ", systemImage: "doc.badge.plus")
                        }
                        if let message {
                            Text(message).font(.footnote).foregroundStyle(.secondary)
                        }
                    } footer: {
                        Text("""
                        iPhone では、ほかのアプリから Safari のお気に入りを直接読むことはできません。書き出したファイル（.html）を読み込んでください。

                        ・Mac の Safari：メニューの「ファイル」→「書き出す」→「ブックマーク…」
                        ・Windows：iCloud for Windows で Safari のブックマークを Chrome / Edge に同期し、そのブラウザの「ブックマークのエクスポート」
                        ・Chrome：ブックマーク マネージャ →「︙」→「ブックマークをエクスポート」

                        できたファイルを iCloud Drive などに置けば、ここから選べます。
                        """)
                    }
                } else {
                    Section {
                        ForEach(folders) { folder in
                            Button {
                                let n = app.history.importFavorites(folder.items)
                                message = "「\(folder.name)」から \(n) 件をお気に入りに追加しました。"
                                folders = []
                            } label: {
                                HStack {
                                    Image(systemName: BookmarkImport.isFavorites(folder.name) ? "star.fill" : "folder")
                                        .foregroundStyle(Theme.accent)
                                        .frame(width: 26)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(folder.name).foregroundStyle(.primary)
                                        Text(folder.items.prefix(3).map(\.title).joined(separator: "、"))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                    Text("\(folder.items.count)件").font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                    } header: {
                        Text("お気に入りにするフォルダを選ぶ")
                    } footer: {
                        Text("Safari の「お気に入り」は ★ のフォルダです。")
                    }
                }
            }
            .navigationTitle("ブックマークを読み込む")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("完了") { dismiss() } }
            }
            .fileImporter(isPresented: $picking, allowedContentTypes: [.html, .plainText]) { result in
                switch result {
                case .success(let url):
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    guard let data = try? Data(contentsOf: url) else {
                        message = "ファイルを開けませんでした。"
                        return
                    }
                    let html = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
                    let found = BookmarkImport.parse(html)
                    if found.isEmpty {
                        message = "ブックマークが見つかりませんでした。ブラウザから書き出した .html ファイルを選んでください。"
                    } else {
                        folders = found
                        message = nil
                    }
                case .failure:
                    message = "ファイルを開けませんでした。"
                }
            }
        }
    }
}

/// お気に入りを1件追加・名前を変える。
struct FavoriteEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    var editing: SpeedDialItem?
    @State private var title = ""
    @State private var url = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("名前", text: $title)
                TextField("URL", text: $url)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .disabled(editing != nil)
            }
            .navigationTitle(editing == nil ? "お気に入りを追加" : "名前を変更")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        if let editing {
                            app.history.renameSpeedDial(editing, to: title)
                        } else if let parsed = URLParser.url(from: url) {
                            app.history.addToSpeedDial(title: title.isEmpty ? URLParser.displayHost(parsed) : title, url: parsed)
                        }
                        dismiss()
                    }
                    .disabled(editing == nil ? URLParser.url(from: url) == nil : title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                if let editing {
                    title = editing.title
                    url = editing.url
                } else if let current = app.tabs.current, let u = current.url {
                    title = current.displayTitle
                    url = u.absoluteString
                }
            }
        }
        .presentationDetents([.medium])
    }
}


/// お気に入りの並べ替えと削除（Safari のお気に入りの編集と同じ）。
struct FavoritesListView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var adding = false
    @State private var importing = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(app.history.speedDial) { item in
                        HStack(spacing: 12) {
                            SiteIcon(url: URL(string: item.url), size: 30)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(item.title).lineLimit(1)
                                Text(URLParser.displayHost(URL(string: item.url))).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { offsets in
                        for i in offsets { app.history.removeFromSpeedDial(app.history.speedDial[i]) }
                    }
                    .onMove { app.history.moveFavorites(from: $0, to: $1) }
                } footer: {
                    Text("上から順に、新しいタブに並びます。")
                }
                Section {
                    Button { adding = true } label: { Label("URLを入力して追加", systemImage: "plus") }
                    Button { importing = true } label: { Label("ブックマークのファイルを読み込む", systemImage: "square.and.arrow.down") }
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("お気に入り")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("完了") { dismiss() } }
            }
            .sheet(isPresented: $adding) { FavoriteEditor().environment(app) }
            .sheet(isPresented: $importing) { BookmarkImportView().environment(app) }
        }
    }
}
