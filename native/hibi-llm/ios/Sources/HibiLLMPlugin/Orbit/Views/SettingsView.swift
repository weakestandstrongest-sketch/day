import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var showKey = false
    @State private var clearedData = false
    @State private var clearedHistory = false
    @State private var updatingList = false
    @State private var showImport = false

    var body: some View {
        @Bindable var settings = app.settings
        NavigationStack {
            Form {
                Section {
                    Picker("AIを動かす場所", selection: $settings.aiProvider) {
                        ForEach(AIProvider.allCases) { provider in
                            Text(provider.label).tag(provider)
                        }
                    }
                    if settings.aiProvider == .local {
                        NavigationLink {
                            ModelManagerView()
                        } label: {
                            LabeledContent("AIモデル", value: app.localAI.statusLabel)
                        }
                    }
                } header: {
                    Text("AI")
                } footer: {
                    Text(settings.aiProvider == .local
                         ? "ひび手帳の まいにち と同じく、AIはこのiPhoneの中で動きます。ページの内容は外に送られません。"
                         : "Claude（Anthropic）のAPIを使います。ページの内容がAnthropicに送られます。")
                }

                if settings.aiProvider == .cloud {
                    cloudSection(settings)
                }

                Section {
                    Picker("操作の確認", selection: $settings.approvalPolicy) {
                        ForEach(ApprovalPolicy.allCases) { policy in
                            Text(policy.label).tag(policy)
                        }
                    }
                } header: {
                    Text("エージェント（ブラウザ操作）")
                } footer: {
                    Text("「重要な操作のみ」では、購入・送信・削除などに見えるボタンや、パスワード・カード情報の入力の前に確認します。")
                }

                Section {
                    TextEditor(text: $settings.aboutMe)
                        .frame(minHeight: 100)
                } header: {
                    Text("あなたについて（パーソナライズ）")
                } footer: {
                    Text("例：「東京在住のエンジニア。回答は結論から」。毎回AIに伝えます。")
                }

                Section("ブラウザ") {
                    Picker("検索エンジン", selection: $settings.searchEngine) {
                        ForEach(SearchEngine.allCases) { engine in
                            Text(engine.name).tag(engine)
                        }
                    }
                    Picker("アドレスバーでEnter", selection: $settings.omniboxDefault) {
                        ForEach(OmniboxDefault.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    Picker("外観", selection: $settings.appearance) {
                        ForEach(Appearance.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    Picker("見ていないタブを自動でしまう", selection: $settings.autoArchive) {
                        ForEach(AutoArchive.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                }

                Section {
                    Toggle("危険なサイトをブロック", isOn: $settings.blockDangerous)
                    Toggle("いつも暗号化（HTTPS）で開く", isOn: $settings.httpsUpgrade)
                    Toggle("暗号化されていないログインを警告", isOn: $settings.warnInsecureLogin)
                    Toggle("ほかのアプリを開く前に確認", isOn: $settings.confirmAppSwitch)
                    LabeledContent("危険なサイトの一覧", value: DangerousSites.onlineCount > 0 ? "\(DangerousSites.onlineCount) ドメイン＋内蔵" : "内蔵の一覧のみ")
                } header: {
                    Text("セキュリティ")
                } footer: {
                    Text("危険なサイト：ウイルスの配布・フィッシング（偽のログイン画面）・詐欺・勝手に仮想通貨を掘るサイトとして報告されているものを開く前に止めます（一覧は1日1回更新）。HTTPS：http のページも暗号化して開き、対応していないサイトでは開く前に知らせます。ほかに、詐欺サイトの警告（Safari と同じしくみ）、勝手に開く新しい窓、広告が勝手にアプリや App Store へ飛ばすのも止めます。")
                }

                Section {
                    Picker("広告・トラッカーのブロック", selection: $settings.adBlockLevel) {
                        ForEach(AdBlockLevel.allCases) { level in
                            Text(level.label).tag(level)
                        }
                    }
                    .onChange(of: settings.adBlockLevel) {
                        Task { await app.tabs.setAdBlock(settings.adBlockLevel) }
                    }
                    if settings.adBlockLevel == .strong {
                        Button {
                            updatingList = true
                            Task {
                                await app.tabs.setAdBlock(.strong, refreshOnline: true)
                                updatingList = false
                            }
                        } label: {
                            HStack {
                                Label("広告サーバーの一覧を更新", systemImage: "arrow.triangle.2.circlepath")
                                Spacer()
                                if updatingList { ProgressView() }
                            }
                        }
                        .disabled(updatingList)
                        LabeledContent("オンラインの一覧", value: app.tabs.configuration.onlineDomainCount > 0 ? "\(app.tabs.configuration.onlineDomainCount) ドメイン" : "未取得")
                    }
                } header: {
                    Text("広告ブロック")
                } footer: {
                    Text("標準：主な広告・計測のドメインと広告の枠。強力：それに加えて、広告サーバーの一覧（週1回自動更新）、ポップアップ、下に貼りつく広告、通知の許可やアプリへの誘導なども消します。動画の中に流れる広告（YouTube など）は消せません。表示が崩れるサイトでは「標準」にしてください。")
                }

                Section {
                    NavigationLink {
                        FavoritesListView()
                    } label: {
                        LabeledContent("お気に入りを編集", value: "\(app.history.speedDial.count)件")
                    }
                    Button {
                        showImport = true
                    } label: {
                        Label("ブックマークのファイルを読み込む", systemImage: "square.and.arrow.down")
                    }
                } header: {
                    Text("お気に入り")
                } footer: {
                    Text("ページを開いてアドレス欄の ☆ を押すと登録され、新しいタブに並びます。")
                }

                Section("データ") {
                    Button {
                        app.history.clear()
                        clearedHistory = true
                    } label: {
                        Label(clearedHistory ? "消去しました" : "閲覧履歴を消去", systemImage: "clock.arrow.circlepath")
                    }
                    .disabled(clearedHistory)
                    Button {
                        Task {
                            await app.tabs.clearWebsiteData()
                            clearedData = true
                        }
                    } label: {
                        Label(clearedData ? "消去しました" : "Cookieとサイトデータを消去", systemImage: "trash")
                    }
                    .disabled(clearedData)
                }

                Section {
                    LabeledContent("バージョン", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "-")
                }
            }
            .sheet(isPresented: $showImport) { BookmarkImportView().environment(app) }
            .navigationTitle("設定")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完了") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private func cloudSection(_ settings: AppSettings) -> some View {
        @Bindable var settings = settings
        Section {
            HStack {
                Group {
                    if showKey {
                        TextField("sk-ant-...", text: $settings.apiKey)
                    } else {
                        SecureField("sk-ant-...", text: $settings.apiKey)
                    }
                }
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(.body, design: .monospaced))
                Button {
                    showKey.toggle()
                } label: {
                    Image(systemName: showKey ? "eye.slash" : "eye")
                }
                .buttonStyle(.borderless)
            }
            Picker("モデル", selection: $settings.model) {
                ForEach(ClaudeModelOption.all) { option in
                    Text(option.name).tag(option.id)
                }
            }
            Picker("思考の深さ", selection: $settings.effort) {
                ForEach(EffortLevel.allCases) { level in
                    Text(level.label).tag(level)
                }
            }
            TextField("https://api.anthropic.com", text: $settings.baseURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
        } header: {
            Text("クラウドAI（Claude）")
        } footer: {
            Text("APIキーはこの端末のキーチェーンに保存されます。プロキシを使う場合のみ接続先を変更してください。")
        }
    }
}
