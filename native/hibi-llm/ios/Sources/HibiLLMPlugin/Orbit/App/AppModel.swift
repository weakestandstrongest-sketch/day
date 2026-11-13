import Foundation
import UIKit
import Observation

@MainActor
@Observable
final class AppModel {
    let settings: AppSettings
    let tabs: TabStore
    let skills: SkillStore
    let history: HistoryStore
    let localAI: LocalAI
    let assistant: AssistantEngine

    var showAssistant = false
    var showCommandBar = false
    /// 左端からのスワイプで出るサイドバー
    var showSidebar = false
    /// AI を全画面に広げているか（false ならページと上下に並ぶ）
    var assistantExpanded = false
    var showSettings = false
    var showSkills = false
    var showModels = false
    /// Comet 風の「…」メニュー
    var showPageMenu = false
    /// 画面の下に一瞬出す知らせ
    var toast: String?
    /// 知らせの絵（SF Symbols）。nil なら星（お気に入り）
    var toastIcon: String?

    /// 開いたときのアニメーション（LaunchIntroView）の黒い幕を出している
    var introCover = true
    /// アニメーションを始める（ひび手帳の中では Orbit が出きってから。単独のアプリでは画面が出たらすぐ）
    var introGo = false
    /// 始まりのページのロゴの位置（画面全体の座標）。始まりのページが出ていないときは .zero
    var wordmarkFrame: CGRect = .zero

    /// 下のバー（CommandCapsule）を下にしまっている（ひび手帳の中で、出入りするとき。ひび手帳のバーと入れかわる）
    var barTucked = false
    /// 下のバーのガラスの形の位置（画面全体の座標）と角の丸み。しまうときに、この形だけを写真にして下へ動かす
    var barFrame: CGRect = .zero
    var barCorner: CGFloat = 34

        /// 開いたときのアニメーションを始める（1回だけ。2回目からは何もしない）
    func startIntro() { if introCover { introGo = true } }
    @ObservationIgnored private var toastTask: Task<Void, Never>?

    init() {
        let settings = AppSettings()
        let tabs = TabStore()
        let localAI = LocalAI()
        let history = HistoryStore()
        self.settings = settings
        self.tabs = tabs
        self.localAI = localAI
        self.history = history
        self.skills = SkillStore()
        self.assistant = AssistantEngine(settings: settings, tabs: tabs, localAI: localAI)
        tabs.onPageVisited = { [weak history] url, title in history?.record(url: url, title: title) }
        tabs.restoreSession()
        Task { await tabs.setAdBlock(settings.adBlockLevel) }
        Task { await DangerousSites.load() }
        tabs.onSecurityNotice = { [weak self] text in self?.showToast(text, icon: "exclamationmark.shield.fill", seconds: 4) }
    }

    /// アプリが前面に来たとき：しばらく見ていないタブをしまい、モデルの状態を確かめる。
    func becameActive() {
        tabs.archiveStale(after: settings.autoArchive.interval)
        localAI.refresh()
        Task { await DangerousSites.load() } // 1日に1回、危険なサイトの一覧を新しくする
    }

    // MARK: Omnibox actions

    func openOrSearch(_ input: String) {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        if let url = URLParser.url(from: text) {
            tabs.open(url)
        } else if let url = URLParser.searchURL(for: text, engine: settings.searchEngine) {
            tabs.open(url)
        }
    }

    func search(_ query: String) {
        guard let url = URLParser.searchURL(for: query, engine: settings.searchEngine) else { return }
        tabs.open(url)
    }

    /// Ask the assistant from anywhere (omnibox, start page). Attaches the current page if there is one.
    func ask(_ text: String, mode: SendMode = .auto) {
        let attach = mode == .web ? [] : currentPageAttachment()
        presentAssistant {
            self.assistant.send(text, attaching: attach, mode: mode)
        }
    }

    func run(_ skill: Skill, extra: String = "") {
        let attach: [BrowserTab]
        switch skill.scope {
        case .currentTab: attach = currentPageAttachment()
        case .allTabs: attach = tabs.currentSpaceTabs.filter { !$0.isBlank }
        case .none: attach = []
        }
        let extraTrimmed = extra.trimmingCharacters(in: .whitespacesAndNewlines)
        let prompt = extraTrimmed.isEmpty ? skill.prompt : skill.prompt + "\n\n追加の指示: " + extraTrimmed
        let display = "/" + skill.name + (extraTrimmed.isEmpty ? "" : " " + extraTrimmed)
        presentAssistant {
            self.assistant.send(prompt, attaching: attach, displayText: display, mode: skill.usesAgent ? .agent : .chat)
        }
    }

    func showToast(_ text: String, icon: String? = nil, seconds: Double = 1.8) {
        toast = text
        toastIcon = icon
        toastTask?.cancel()
        toastTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self.toast = nil
        }
    }

    /// 表示中のページをお気に入りに登録する／外す（Safari の「お気に入りに追加」）。
    func toggleFavoriteForCurrentPage() {
        guard let tab = tabs.current, let url = tab.url else { return }
        let added = history.toggleFavorite(title: tab.displayTitle, url: url)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        showToast(added ? "お気に入りに追加しました" : "お気に入りから外しました")
    }

    func currentPageAttachment() -> [BrowserTab] {
        guard let current = tabs.current, !current.isBlank else { return [] }
        return [current]
    }

    private func presentAssistant(then action: @escaping @MainActor () -> Void) {
        let needsDelay = showSkills || showPageMenu
        showPageMenu = false
        showCommandBar = false
        showSidebar = false
        showSkills = false
        Task { @MainActor in
            if needsDelay { try? await Task.sleep(nanoseconds: 450_000_000) }
            self.showAssistant = true
            action()
        }
    }
}
