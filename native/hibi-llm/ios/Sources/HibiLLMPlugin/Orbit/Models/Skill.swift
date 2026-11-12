import Foundation
import Observation

/// A reusable prompt shortcut, inspired by Dia's "Skills".
struct Skill: Identifiable, Codable, Hashable {
    enum Scope: String, Codable, CaseIterable, Identifiable {
        case currentTab, allTabs, none
        var id: String { rawValue }
        var label: String {
            switch self {
            case .currentTab: return "現在のタブ"
            case .allTabs: return "すべてのタブ"
            case .none: return "なし"
            }
        }
    }

    var id: UUID = UUID()
    var name: String
    var icon: String
    var prompt: String
    var scope: Scope = .currentTab
    var usesAgent: Bool = false
}

@MainActor
@Observable
final class SkillStore {
    private static let key = "skills.v1"

    var skills: [Skill] { didSet { save() } }

    init() {
        if let data = OrbitEmbed.defaults.data(forKey: Self.key),
           let decoded = try? JSONDecoder().decode([Skill].self, from: data) {
            skills = decoded
        } else {
            skills = Self.defaults
        }
    }

    func skill(named name: String) -> Skill? {
        skills.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    func resetToDefaults() { skills = Self.defaults }

    private func save() {
        if let data = try? JSONEncoder().encode(skills) {
            OrbitEmbed.defaults.set(data, forKey: Self.key)
        }
    }

    static let icons = [
        "text.alignleft", "character.bubble", "lightbulb", "square.split.2x1", "checkmark.seal",
        "arrowshape.turn.up.left", "list.bullet.rectangle", "sparkles", "pencil", "cart",
        "calendar", "airplane", "graduationcap", "chart.bar", "quote.bubble", "magnifyingglass",
    ]

    static let defaults: [Skill] = [
        Skill(name: "要約", icon: "text.alignleft",
              prompt: "このページの内容を、重要なポイント3〜5個の箇条書きで要約してください。最後に一文で結論を書いてください。"),
        Skill(name: "翻訳", icon: "character.bubble",
              prompt: "このページの主要な内容を自然な日本語に翻訳してください。すでに日本語の場合は自然な英語に翻訳してください。"),
        Skill(name: "やさしく解説", icon: "lightbulb",
              prompt: "このページの内容を、専門知識のない人にもわかるように、身近なたとえを使ってやさしく解説してください。"),
        Skill(name: "タブを比較", icon: "square.split.2x1",
              prompt: "添付したタブの内容を比較し、共通点・違い・それぞれの長所短所を表でまとめ、最後におすすめを示してください。",
              scope: .allTabs),
        Skill(name: "ファクトチェック", icon: "checkmark.seal",
              prompt: "このページの主要な主張をWeb検索で検証し、主張ごとに「正しい／不確か／誤り」で判定して、根拠と出典を示してください。"),
        Skill(name: "返信を下書き", icon: "arrowshape.turn.up.left",
              prompt: "このページ（メール・投稿・メッセージなど）に対する、丁寧で簡潔な返信の下書きを作成してください。"),
        Skill(name: "重要情報を抽出", icon: "list.bullet.rectangle",
              prompt: "このページから日付・金額・人名・場所・手順・連絡先などの重要情報を抽出し、見やすく整理してください。"),
    ]
}
