import Foundation

/// Execution of the browser tools Claude calls in agent mode.
extension AssistantEngine {
    private static let sensitivePattern =
        #"購入|注文|支払|決済|お会計|確定|送信|投稿|削除|予約|申し?込|登録|解約|退会|ログアウト|振込|送金|buy|purchase|order|pay|checkout|submit|send|post|delete|remove|confirm|book|subscribe|sign ?up|transfer|unsubscribe"#
    private static let sensitiveFieldPattern =
        #"password|パスワード|暗証|card|カード|cvv|cvc|security code|セキュリティコード|口座|account number|マイナンバー|ssn"#

    static func matches(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    private func needsApproval(sensitive: Bool) -> Bool {
        switch settings.approvalPolicy {
        case .always: return true
        case .never: return false
        case .sensitive: return sensitive
        }
    }

    private func workingTab() -> BrowserTab? {
        if let agentTab, tabs.tabs.contains(where: { $0 === agentTab }) { return agentTab }
        return tabs.current
    }

    private func pageSummary(_ tab: BrowserTab) -> String {
        "現在のページ: \(tab.displayTitle) <\(tab.url?.absoluteString ?? "about:blank")>"
    }

    private func denied(_ actionText: String, icon: String) -> ToolOutcome {
        let id = addAction(actionText, icon: icon)
        updateAction(id, status: .denied, text: actionText + "（拒否）")
        return ToolOutcome(text: "ユーザーがこの操作を拒否しました。別の方法を検討するか、どうしたいかユーザーに確認してください。", isError: true)
    }

    func executeTool(name: String, input: JSONValue) async -> ToolOutcome {
        guard agentMode else {
            return ToolOutcome(text: "ユーザーがブラウザ操作をオフにしています。ツールを使わずに、手順を説明する形で回答してください。", isError: true)
        }

        if name == "open_new_tab" {
            return await openNewTab(input)
        }
        guard let tab = workingTab() else {
            return ToolOutcome(text: "操作できるタブがありません。open_new_tab を使ってください。", isError: true)
        }

        switch name {
        case "read_page": return await readPage(tab)
        case "click": return await click(tab, input)
        case "type_text": return await typeText(tab, input)
        case "scroll": return await scroll(tab, input)
        case "navigate": return await navigate(tab, input)
        case "go_back": return await goBack(tab)
        default: return ToolOutcome(text: "不明なツールです: \(name)", isError: true)
        }
    }

    // MARK: Tools

    private func readPage(_ tab: BrowserTab) async -> ToolOutcome {
        if tab.isBlank {
            return ToolOutcome(text: "作業中のタブは空白ページです。navigate でページを開いてください。", isError: true)
        }
        let id = addAction("ページを読み取っています…", icon: "doc.text.magnifyingglass")
        do {
            let snapshot = try await PageReader.snapshot(of: tab)
            lastElements = Dictionary(snapshot.elements.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            let title = snapshot.title.isEmpty ? URLParser.displayHost(URL(string: snapshot.url)) : snapshot.title
            updateAction(id, status: .done, text: "ページを読み取りました：\(title)")
            return ToolOutcome(text: snapshot.formatted, isError: false)
        } catch {
            updateAction(id, status: .failed, text: "ページを読み取れませんでした")
            return ToolOutcome(text: "ページの読み取りに失敗しました: \(error.localizedDescription)", isError: true)
        }
    }

    private func click(_ tab: BrowserTab, _ input: JSONValue) async -> ToolOutcome {
        guard let elementID = input["element_id"]?.intValue else {
            return ToolOutcome(text: "element_id（整数）が必要です。", isError: true)
        }
        let label = lastElements[elementID]?.label ?? ""
        let text = label.isEmpty ? "要素 [\(elementID)] をタップ" : "「\(label)」をタップ"
        if needsApproval(sensitive: Self.matches(label, Self.sensitivePattern)) {
            guard await requestApproval(title: text, detail: URLParser.displayHost(tab.url)) else {
                return denied(text, icon: "hand.tap")
            }
        }
        let id = addAction(text, icon: "hand.tap")
        do {
            let result = try await PageReader.perform(PageScripts.click, on: tab, arguments: ["id": elementID])
            guard result.ok else {
                updateAction(id, status: .failed)
                return ToolOutcome(text: result.error ?? "タップに失敗しました。", isError: true)
            }
            await tab.waitForLoad()
            updateAction(id, status: .done)
            return ToolOutcome(text: "タップしました。\(pageSummary(tab))。画面が変化した可能性があるので、続ける前に read_page で確認してください。", isError: false)
        } catch {
            updateAction(id, status: .failed)
            return ToolOutcome(text: "タップに失敗しました: \(error.localizedDescription)", isError: true)
        }
    }

    private func typeText(_ tab: BrowserTab, _ input: JSONValue) async -> ToolOutcome {
        guard let elementID = input["element_id"]?.intValue, let value = input["text"]?.stringValue else {
            return ToolOutcome(text: "element_id（整数）と text（文字列）が必要です。", isError: true)
        }
        let submit = input["submit"]?.boolValue ?? false
        let element = lastElements[elementID]
        let label = element?.label ?? ""
        let isSecret = element?.inputType == "password" || Self.matches(label, Self.sensitiveFieldPattern)
        let shown = isSecret ? "••••" : String(value.prefix(40))
        var text = label.isEmpty ? "[\(elementID)] に「\(shown)」を入力" : "「\(label)」に「\(shown)」を入力"
        if submit { text += "して送信" }

        if needsApproval(sensitive: isSecret || (submit && Self.matches(label, Self.sensitivePattern))) {
            guard await requestApproval(title: text, detail: URLParser.displayHost(tab.url)) else {
                return denied(text, icon: "keyboard")
            }
        }
        let id = addAction(text, icon: "keyboard")
        do {
            let result = try await PageReader.perform(PageScripts.typeText, on: tab,
                                                      arguments: ["id": elementID, "text": value, "submit": submit])
            guard result.ok else {
                updateAction(id, status: .failed)
                return ToolOutcome(text: result.error ?? "入力に失敗しました。", isError: true)
            }
            if submit { await tab.waitForLoad() }
            updateAction(id, status: .done)
            return ToolOutcome(text: "入力しました。\(submit ? "送信後の" : "")\(pageSummary(tab))", isError: false)
        } catch {
            updateAction(id, status: .failed)
            return ToolOutcome(text: "入力に失敗しました: \(error.localizedDescription)", isError: true)
        }
    }

    private func scroll(_ tab: BrowserTab, _ input: JSONValue) async -> ToolOutcome {
        let direction = input["direction"]?.stringValue ?? "down"
        guard ["up", "down", "top", "bottom"].contains(direction) else {
            return ToolOutcome(text: "direction は up / down / top / bottom のいずれかです。", isError: true)
        }
        let labels = ["up": "上へスクロール", "down": "下へスクロール", "top": "ページの先頭へ", "bottom": "ページの末尾へ"]
        let id = addAction(labels[direction] ?? "スクロール", icon: "arrow.up.arrow.down")
        do {
            _ = try await tab.runJS(PageScripts.scroll, arguments: ["direction": direction])
            try? await Task.sleep(nanoseconds: 300_000_000)
            updateAction(id, status: .done)
            return ToolOutcome(text: "スクロールしました。read_page で表示中の要素を確認できます。", isError: false)
        } catch {
            updateAction(id, status: .failed)
            return ToolOutcome(text: "スクロールに失敗しました: \(error.localizedDescription)", isError: true)
        }
    }

    private func navigate(_ tab: BrowserTab, _ input: JSONValue) async -> ToolOutcome {
        guard let raw = input["url"]?.stringValue, let url = URLParser.url(from: raw) else {
            return ToolOutcome(text: "有効なURLを指定してください。", isError: true)
        }
        let text = "\(URLParser.displayHost(url)) を開く"
        if needsApproval(sensitive: false) {
            guard await requestApproval(title: text, detail: url.absoluteString) else {
                return denied(text, icon: "safari")
            }
        }
        let id = addAction(text, icon: "safari")
        tab.load(url)
        await tab.waitForLoad()
        updateAction(id, status: .done)
        return ToolOutcome(text: "開きました。\(pageSummary(tab))", isError: false)
    }

    private func goBack(_ tab: BrowserTab) async -> ToolOutcome {
        guard tab.canGoBack else {
            return ToolOutcome(text: "これ以上戻れません。", isError: true)
        }
        let id = addAction("前のページに戻る", icon: "chevron.backward")
        tab.goBack()
        await tab.waitForLoad()
        updateAction(id, status: .done)
        return ToolOutcome(text: "戻りました。\(pageSummary(tab))", isError: false)
    }

    private func openNewTab(_ input: JSONValue) async -> ToolOutcome {
        guard let raw = input["url"]?.stringValue, let url = URLParser.url(from: raw) else {
            return ToolOutcome(text: "有効なURLを指定してください。", isError: true)
        }
        let text = "新しいタブで \(URLParser.displayHost(url)) を開く"
        if needsApproval(sensitive: false) {
            guard await requestApproval(title: text, detail: url.absoluteString) else {
                return denied(text, icon: "plus.square.on.square")
            }
        }
        let id = addAction(text, icon: "plus.square.on.square")
        let tab = tabs.newTab(url: url)
        agentTab = tab
        lastElements = [:]
        await tab.waitForLoad()
        updateAction(id, status: .done)
        return ToolOutcome(text: "新しいタブで開きました（以降の操作はこのタブが対象）。\(pageSummary(tab))", isError: false)
    }
}
