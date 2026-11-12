import Foundation
import Observation

struct ClaudeModelOption: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    /// Server-side refusal fallbacks (`fallbacks: "default"`).
    let supportsFallbacks: Bool
    /// Dynamic-filtering web search (`web_search_20260209`).
    let supportsWebSearch: Bool

    static let all: [ClaudeModelOption] = [
        .init(id: "claude-opus-5-5", name: "Claude Opus 5.5", detail: "最も賢い・既定", supportsFallbacks: true, supportsWebSearch: true),
        .init(id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", detail: "速さと賢さのバランス", supportsFallbacks: true, supportsWebSearch: true),
        .init(id: "claude-haiku-5-5", name: "Claude Haiku 5.5", detail: "高速・低コスト", supportsFallbacks: false, supportsWebSearch: false),
    ]

    static func find(_ id: String) -> ClaudeModelOption {
        all.first { $0.id == id } ?? all[0]
    }
}

enum EffortLevel: String, CaseIterable, Identifiable {
    case low, medium, high
    var id: String { rawValue }
    var label: String {
        switch self {
        case .low: return "低（速い）"
        case .medium: return "中（標準）"
        case .high: return "高（じっくり）"
        }
    }
}

enum ApprovalPolicy: String, CaseIterable, Identifiable {
    case always, sensitive, never
    var id: String { rawValue }
    var label: String {
        switch self {
        case .always: return "すべての操作を確認"
        case .sensitive: return "重要な操作のみ確認"
        case .never: return "確認しない"
        }
    }
}

enum AIProvider: String, CaseIterable, Identifiable {
    case local, cloud
    var id: String { rawValue }
    var label: String {
        switch self {
        case .local: return "このiPhoneの中（ローカル）"
        case .cloud: return "クラウド（Claude）"
        }
    }
}

enum Appearance: String, CaseIterable, Identifiable {
    case dark, light, system
    var id: String { rawValue }
    var label: String {
        switch self {
        case .dark: return "ダーク"
        case .light: return "ライト"
        case .system: return "iPhoneの設定に合わせる"
        }
    }
}

enum OmniboxDefault: String, CaseIterable, Identifiable {
    case search, ai
    var id: String { rawValue }
    var label: String {
        switch self {
        case .search: return "Web検索"
        case .ai: return "AIに質問"
        }
    }
}

@MainActor
@Observable
final class AppSettings {
    private let defaults = OrbitEmbed.defaults

    var apiKey: String {
        didSet { Keychain.set(apiKey.trimmingCharacters(in: .whitespacesAndNewlines), for: "anthropic-api-key") }
    }
    var model: String { didSet { defaults.set(model, forKey: "model") } }
    var effort: EffortLevel { didSet { defaults.set(effort.rawValue, forKey: "effort") } }
    var approvalPolicy: ApprovalPolicy { didSet { defaults.set(approvalPolicy.rawValue, forKey: "approvalPolicy") } }
    var searchEngine: SearchEngine { didSet { defaults.set(searchEngine.rawValue, forKey: "searchEngine") } }
    var omniboxDefault: OmniboxDefault { didSet { defaults.set(omniboxDefault.rawValue, forKey: "omniboxDefault") } }
    /// 既定は端末の中の AI（まいにち と同じ）。クラウドは任意。
    var aiProvider: AIProvider { didSet { defaults.set(aiProvider.rawValue, forKey: "aiProvider") } }
    var autoArchive: AutoArchive { didSet { defaults.set(autoArchive.rawValue, forKey: "autoArchive") } }
    var adBlockLevel: AdBlockLevel { didSet { defaults.set(adBlockLevel.rawValue, forKey: "adBlockLevel") } }
    /// セキュリティ（WebView からは SecurityPrefs で読む）
    var httpsUpgrade: Bool { didSet { defaults.set(httpsUpgrade, forKey: SecurityPrefs.httpsKey) } }
    var blockDangerous: Bool { didSet { defaults.set(blockDangerous, forKey: SecurityPrefs.dangerousKey) } }
    var warnInsecureLogin: Bool { didSet { defaults.set(warnInsecureLogin, forKey: SecurityPrefs.loginKey) } }
    var confirmAppSwitch: Bool { didSet { defaults.set(confirmAppSwitch, forKey: SecurityPrefs.appSwitchKey) } }
    var appearance: Appearance { didSet { defaults.set(appearance.rawValue, forKey: "appearance") } }
    /// Free-form "about me" memory that is added to the system prompt (Dia-style personalization).
    var aboutMe: String { didSet { defaults.set(aboutMe, forKey: "aboutMe") } }
    /// Optional proxy / gateway base URL. Empty = https://api.anthropic.com
    var baseURL: String { didSet { defaults.set(baseURL, forKey: "baseURL") } }

    init() {
        let defaults = OrbitEmbed.defaults
        apiKey = Keychain.get("anthropic-api-key") ?? ""
        model = defaults.string(forKey: "model") ?? ClaudeModelOption.all[0].id
        effort = EffortLevel(rawValue: defaults.string(forKey: "effort") ?? "") ?? .medium
        approvalPolicy = ApprovalPolicy(rawValue: defaults.string(forKey: "approvalPolicy") ?? "") ?? .sensitive
        searchEngine = SearchEngine(rawValue: defaults.string(forKey: "searchEngine") ?? "") ?? .google
        omniboxDefault = OmniboxDefault(rawValue: defaults.string(forKey: "omniboxDefault") ?? "") ?? .search
        aiProvider = AIProvider(rawValue: defaults.string(forKey: "aiProvider") ?? "") ?? .local
        autoArchive = AutoArchive(rawValue: defaults.string(forKey: "autoArchive") ?? "") ?? .day
        adBlockLevel = AdBlockLevel(rawValue: defaults.string(forKey: "adBlockLevel") ?? "") ?? .strong
        httpsUpgrade = SecurityPrefs.httpsUpgrade
        blockDangerous = SecurityPrefs.blockDangerous
        warnInsecureLogin = SecurityPrefs.warnInsecureLogin
        confirmAppSwitch = SecurityPrefs.confirmAppSwitch
        appearance = Appearance(rawValue: defaults.string(forKey: "appearance") ?? "") ?? .dark
        aboutMe = defaults.string(forKey: "aboutMe") ?? ""
        baseURL = defaults.string(forKey: "baseURL") ?? ""
    }

    var modelOption: ClaudeModelOption { ClaudeModelOption.find(model) }

    var resolvedBaseURL: URL {
        let trimmed = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty, let url = URL(string: trimmed), url.scheme != nil { return url }
        return URL(string: "https://api.anthropic.com")!
    }

    var hasAPIKey: Bool { !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}
