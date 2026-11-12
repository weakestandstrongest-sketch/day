import Foundation
import Observation

struct ChatSource: Hashable {
    let title: String
    let url: URL
}

struct ChatItem: Identifiable {
    enum Kind { case user, assistant, action, notice, error }
    enum Status { case running, done, failed, denied }

    let id = UUID()
    var kind: Kind
    var text: String
    var icon: String?
    var attachments: [String] = []
    var sources: [ChatSource] = []
    var status: Status = .done
}

struct ApprovalRequest: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
}

struct ToolOutcome {
    let text: String
    let isError: Bool
}

enum EngineError: Error {
    case refusal
}

/// どう答えるか。auto はメッセージの中身と画面の状態から決める。
enum SendMode {
    case auto, chat, agent, web
}

/// Runs conversations with Claude: chat about tabs (Dia-style) and an agent loop that
/// operates the browser through client-side tools (Comet-style).
@MainActor
@Observable
final class AssistantEngine {
    static let maxSteps = 40

    var items: [ChatItem] = []
    var isRunning = false
    var statusText: String?
    /// When on, the AI may operate the browser.
    var agentMode = true
    /// When on, questions are answered by searching the web and reading several pages (Arc's "Browse for Me").
    var webMode = false
    var pendingApproval: ApprovalRequest?
    /// Bumped on every visible change so the chat view can auto-scroll.
    var revision = 0

    @ObservationIgnored let settings: AppSettings
    @ObservationIgnored let tabs: TabStore
    @ObservationIgnored let localAI: LocalAI
    /// ローカルAIとの会話の履歴（質問と答えの文字だけ。ページの本文は毎回つけ直す）
    @ObservationIgnored var localHistory: [LLMMessage] = []
    @ObservationIgnored weak var agentTab: BrowserTab?
    @ObservationIgnored var lastElements: [Int: PageSnapshot.Element] = [:]
    @ObservationIgnored private var messages: [JSONValue] = []
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored var currentAssistantItemID: UUID?
    @ObservationIgnored private var approvalContinuation: CheckedContinuation<Bool, Never>?

    init(settings: AppSettings, tabs: TabStore, localAI: LocalAI) {
        self.settings = settings
        self.tabs = tabs
        self.localAI = localAI
    }

    var usesCloud: Bool { settings.aiProvider == .cloud }

    var modelLabel: String {
        usesCloud ? settings.modelOption.name : localAI.statusLabel
    }

    var hasConversation: Bool { !items.isEmpty }

    // MARK: Public API

    /// Sends a message. `attachTabs` are read and included as context (Dia's "chat with your tabs").
    func send(_ text: String, attaching attachTabs: [BrowserTab], displayText: String? = nil, mode: SendMode = .auto) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isRunning else { return }
        if usesCloud && !settings.hasAPIKey {
            items.append(ChatItem(kind: .error, text: "クラウドAIを使うには、設定でAnthropic APIキーを入力してください。"))
            revision += 1
            return
        }
        if mode == .agent { agentMode = true }
        isRunning = true
        statusText = "準備しています…"
        agentTab = tabs.current
        lastElements = [:]
        let display = displayText ?? trimmed
        task = Task { [weak self] in
            guard let self else { return }
            if self.usesCloud {
                if mode == .web { self.webMode = true }
                await self.run(text: trimmed, displayText: display, attachTabs: attachTabs)
            } else {
                await self.runLocal(text: trimmed, displayText: display, attachTabs: attachTabs, mode: mode)
            }
            self.finishRun()
        }
    }

    func stop() {
        resolveApproval(false)
        localAI.stop()
        task?.cancel()
    }

    func reset() {
        guard !isRunning else { return }
        messages = []
        localHistory = []
        items = []
        lastElements = [:]
        revision += 1
    }

    func resolveApproval(_ approved: Bool) {
        guard let continuation = approvalContinuation else { return }
        approvalContinuation = nil
        pendingApproval = nil
        continuation.resume(returning: approved)
    }

    func requestApproval(title: String, detail: String) async -> Bool {
        if Task.isCancelled { return false }
        pendingApproval = ApprovalRequest(title: title, detail: detail)
        statusText = "あなたの許可を待っています"
        revision += 1
        return await withCheckedContinuation { continuation in
            approvalContinuation = continuation
        }
    }

    // MARK: Conversation

    private func run(text: String, displayText: String, attachTabs: [BrowserTab]) async {
        let checkpoint = messages
        var blocks: [JSONValue] = []
        var names: [String] = []
        var budget = 120_000

        for (offset, tab) in attachTabs.enumerated() where !tab.isBlank {
            let remaining = max(1, attachTabs.count - offset)
            let perTab = max(4_000, min(40_000, budget / remaining))
            guard let page = try? await PageReader.content(of: tab, maxChars: perTab) else { continue }
            budget -= page.text.count
            names.append(tab.displayTitle)
            let index = names.count
            var block = "<tab index=\"\(index)\" title=\"\(Self.attr(page.title))\" url=\"\(Self.attr(page.url))\">\n"
            if !page.description.isEmpty { block += "<description>\(page.description)</description>\n" }
            block += page.text + "\n</tab>"
            if !page.selection.isEmpty {
                block += "\n<selection tab=\"\(index)\">\(page.selection)</selection>"
            }
            blocks.append(.text(block))
        }
        blocks.append(.text(contextHeader() + "\n\n" + text))

        items.append(ChatItem(kind: .user, text: displayText, attachments: names))
        revision += 1
        appendUserContent(blocks)

        do {
            try await agentLoop()
        } catch EngineError.refusal {
            messages = checkpoint
            items.append(ChatItem(kind: .error, text: "このリクエストには応答できませんでした。表現を変えてもう一度お試しください。"))
        } catch {
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                items.append(ChatItem(kind: .notice, text: "停止しました"))
            } else {
                messages = checkpoint
                items.append(ChatItem(kind: .error, text: error.localizedDescription))
            }
        }
        closeDanglingToolUses()
    }

    private func finishRun() {
        isRunning = false
        statusText = nil
        task = nil
        currentAssistantItemID = nil
        for i in items.indices where items[i].status == .running {
            items[i].status = .failed
        }
        revision += 1
    }

    private func agentLoop() async throws {
        let option = settings.modelOption
        var betas: [String] = []
        if option.supportsFallbacks { betas.append("server-side-fallback-2026-07-01") }
        let client = AnthropicClient(apiKey: settings.apiKey.trimmingCharacters(in: .whitespacesAndNewlines),
                                     baseURL: settings.resolvedBaseURL,
                                     betas: betas)

        for _ in 0..<Self.maxSteps {
            try Task.checkCancellation()
            statusText = "考えています…"
            currentAssistantItemID = nil

            let turn = try await client.streamMessage(body: requestBody(option: option)) { [weak self] event in
                self?.handle(event)
            }

            if turn.stopReason == "refusal" { throw EngineError.refusal }

            let content = Self.sanitizedForEcho(turn.content)
            attachSources(from: content)
            currentAssistantItemID = nil
            guard !content.isEmpty else { return }
            messages.append(["role": "assistant", "content": .array(content)])

            switch turn.stopReason {
            case "tool_use":
                let uses = content.filter { $0["type"]?.stringValue == "tool_use" }
                guard !uses.isEmpty else { return }
                var results: [JSONValue] = []
                for use in uses {
                    let id = use["id"]?.stringValue ?? ""
                    let name = use["name"]?.stringValue ?? ""
                    if Task.isCancelled {
                        results.append(Self.toolResult(id, "ユーザーが中断しました。", isError: true))
                        continue
                    }
                    if turn.invalidToolUseIDs.contains(id) {
                        results.append(Self.toolResult(id, "INVALID_JSON: ツールの入力をJSONとして解析できませんでした。正しい入力でもう一度呼び出してください。", isError: true))
                        continue
                    }
                    let outcome = await executeTool(name: name, input: use["input"] ?? [:])
                    results.append(Self.toolResult(id, outcome.text, isError: outcome.isError))
                }
                messages.append(["role": "user", "content": .array(results)])
                try Task.checkCancellation()

            case "pause_turn":
                // Server tool (web search) paused a long turn; send the conversation back to continue.
                continue

            case "max_tokens":
                items.append(ChatItem(kind: .notice, text: "回答が長くなりすぎたため途中で終了しました。"))
                return

            default:
                return
            }
        }
        items.append(ChatItem(kind: .notice, text: "ステップ数の上限に達したため停止しました。続けるには指示を送ってください。"))
    }

    private func requestBody(option: ClaudeModelOption) -> JSONValue {
        var tools = BrowserTools.all
        if option.supportsWebSearch { tools.append(BrowserTools.webSearch) }

        var body: [String: JSONValue] = [
            "model": .string(option.id),
            "max_tokens": 32000,
            "stream": true,
            "system": .string(Prompts.system(aboutMe: settings.aboutMe)),
            "messages": .array(messages),
            "tools": .array(tools),
            "output_config": ["effort": .string(settings.effort.rawValue)],
            // Automatic prompt caching of the growing conversation prefix.
            "cache_control": ["type": "ephemeral"],
        ]
        if option.supportsFallbacks {
            // If a safety classifier declines, the API retries on a fallback model in the same call.
            body["fallbacks"] = "default"
        }
        return .object(body)
    }

    private func contextHeader() -> String {
        var lines = ["<context>"]
        lines.append("日時: \(Date().formatted(date: .complete, time: .shortened))")
        if let current = tabs.current, !current.isBlank {
            lines.append("表示中のタブ: \(current.displayTitle) <\(current.url?.absoluteString ?? "")>")
        } else {
            lines.append("表示中のタブ: なし（新しいタブ）")
        }
        lines.append("開いているタブ数: \(tabs.tabs.count)")
        lines.append("ブラウザ操作: \(agentMode ? "許可" : "オフ（ツールを使わずに回答する）")")
        let webSearchOn = webMode && settings.modelOption.supportsWebSearch
        lines.append("Web検索: \(webSearchOn ? "利用可" : "オフ")")
        lines.append("</context>")
        return lines.joined(separator: "\n")
    }

    // MARK: Streaming → UI

    private func handle(_ event: StreamEvent) {
        switch event {
        case .blockStarted(let type, let name):
            switch type {
            case "text":
                statusText = nil
                if let index = assistantItemIndex(), !items[index].text.isEmpty, !items[index].text.hasSuffix("\n") {
                    items[index].text += "\n\n"
                }
            case "thinking", "redacted_thinking":
                statusText = "考えています…"
            case "server_tool_use":
                statusText = name == "web_search" ? "Webを検索しています…" : "ツールを実行しています…"
            case "web_search_tool_result":
                statusText = "検索結果を読んでいます…"
            case "tool_use":
                statusText = "操作を準備しています…"
            case "fallback":
                items.append(ChatItem(kind: .notice, text: "別のモデルに切り替えて回答を続けます"))
                currentAssistantItemID = nil
            default:
                break
            }
            revision += 1
        case .textDelta(let text):
            guard !text.isEmpty else { return }
            if assistantItemIndex() == nil {
                let item = ChatItem(kind: .assistant, text: "")
                items.append(item)
                currentAssistantItemID = item.id
            }
            if let index = assistantItemIndex() {
                items[index].text += text
            }
            revision += 1
        }
    }

    func assistantItemIndex() -> Int? {
        guard let id = currentAssistantItemID else { return nil }
        return items.firstIndex { $0.id == id }
    }

    private func attachSources(from content: [JSONValue]) {
        guard let index = assistantItemIndex() else { return }
        var seen = Set<String>()
        var sources: [ChatSource] = []
        for block in content where block["type"]?.stringValue == "text" {
            for citation in block["citations"]?.arrayValue ?? [] {
                guard let raw = citation["url"]?.stringValue, let url = URL(string: raw), !seen.contains(raw) else { continue }
                seen.insert(raw)
                sources.append(ChatSource(title: citation["title"]?.stringValue ?? URLParser.displayHost(url), url: url))
            }
        }
        items[index].sources = sources
    }

    // MARK: Action items (agent steps shown in the chat)

    func addAction(_ text: String, icon: String) -> UUID {
        let item = ChatItem(kind: .action, text: text, icon: icon, status: .running)
        items.append(item)
        statusText = nil
        revision += 1
        return item.id
    }

    func updateAction(_ id: UUID, status: ChatItem.Status, text: String? = nil) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].status = status
        if let text { items[index].text = text }
        revision += 1
    }

    // MARK: Message history helpers

    private func appendUserContent(_ blocks: [JSONValue]) {
        if let last = messages.last, last["role"]?.stringValue == "user", var content = last["content"]?.arrayValue {
            // Merge into a trailing user turn (e.g. tool results from an interrupted run).
            content.append(contentsOf: blocks)
            messages[messages.count - 1] = ["role": "user", "content": .array(content)]
        } else {
            messages.append(["role": "user", "content": .array(blocks)])
        }
    }

    /// Every tool_use must be followed by a tool_result; close any left open by a stop/error.
    private func closeDanglingToolUses() {
        guard let last = messages.last, last["role"]?.stringValue == "assistant",
              let content = last["content"]?.arrayValue else { return }
        let ids = content
            .filter { $0["type"]?.stringValue == "tool_use" }
            .compactMap { $0["id"]?.stringValue }
        guard !ids.isEmpty else { return }
        messages.append(["role": "user", "content": .array(ids.map { Self.toolResult($0, "ユーザーが中断しました。", isError: true) })])
    }

    static func toolResult(_ id: String, _ text: String, isError: Bool) -> JSONValue {
        [
            "type": "tool_result",
            "tool_use_id": .string(id),
            "content": .string(text),
            "is_error": .bool(isError),
        ]
    }

    /// Prepares an assistant turn to be sent back to the API.
    /// - Drops empty text blocks (the API rejects them).
    /// - After a mid-output server-side fallback, keeps only text, paired server-tool blocks and the
    ///   `fallback` marker before the last boundary, as the API requires.
    static func sanitizedForEcho(_ content: [JSONValue]) -> [JSONValue] {
        let nonEmpty = content.filter { block in
            !(block["type"]?.stringValue == "text" && (block["text"]?.stringValue ?? "").isEmpty)
        }
        guard let boundary = nonEmpty.lastIndex(where: { $0["type"]?.stringValue == "fallback" }) else {
            return nonEmpty
        }
        let before = nonEmpty[..<boundary]
        let resultIDs = Set(before.compactMap { block -> String? in
            guard let type = block["type"]?.stringValue, type.hasSuffix("_tool_result") else { return nil }
            return block["tool_use_id"]?.stringValue
        })
        var kept: [JSONValue] = []
        for block in before {
            let type = block["type"]?.stringValue ?? ""
            if type == "text" || type == "fallback" {
                kept.append(block)
            } else if type == "server_tool_use", let id = block["id"]?.stringValue, resultIDs.contains(id) {
                kept.append(block)
            } else if type.hasSuffix("_tool_result") {
                kept.append(block)
            }
        }
        kept.append(contentsOf: nonEmpty[boundary...])
        return kept
    }

    static func attr(_ s: String) -> String {
        s.replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "\n", with: " ")
    }
}
