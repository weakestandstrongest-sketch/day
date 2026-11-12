import SwiftUI

/// Arc の「スペース」：タブを用途ごとに分け、それぞれに色を持たせる。
enum SpaceTheme: String, Codable, CaseIterable, Identifiable {
    case violet, ocean, mint, sunset, rose, graphite

    var id: String { rawValue }

    var label: String {
        switch self {
        case .violet: return "バイオレット"
        case .ocean: return "オーシャン"
        case .mint: return "ミント"
        case .sunset: return "サンセット"
        case .rose: return "ローズ"
        case .graphite: return "グラファイト"
        }
    }

    var colors: [Color] {
        switch self {
        case .violet: return [Color(red: 0.40, green: 0.43, blue: 0.92), Color(red: 0.66, green: 0.55, blue: 0.98)]
        case .ocean: return [Color(red: 0.07, green: 0.58, blue: 0.66), Color(red: 0.39, green: 0.82, blue: 0.78)]
        case .mint: return [Color(red: 0.24, green: 0.60, blue: 0.42), Color(red: 0.62, green: 0.80, blue: 0.52)]
        case .sunset: return [Color(red: 0.93, green: 0.52, blue: 0.28), Color(red: 0.91, green: 0.37, blue: 0.46)]
        case .rose: return [Color(red: 0.86, green: 0.38, blue: 0.56), Color(red: 0.72, green: 0.48, blue: 0.90)]
        case .graphite: return [Color(red: 0.30, green: 0.32, blue: 0.35), Color(red: 0.50, green: 0.52, blue: 0.55)]
        }
    }

    var accent: Color { colors[0] }
    var gradient: LinearGradient { LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing) }
}

struct BrowserSpace: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var icon: String
    var theme: SpaceTheme

    /// プライベート（記録を残さない）タブの置き場所。保存しない。
    static let privateID = UUID(uuidString: "00000000-0000-0000-0000-0000000000AF")!
    static let privateSpace = BrowserSpace(id: privateID, name: "プライベート", icon: "eyeglasses", theme: .graphite)

    var isPrivate: Bool { id == Self.privateID }

    static let defaults: [BrowserSpace] = [
        BrowserSpace(name: "パーソナル", icon: "house", theme: .ocean),
        BrowserSpace(name: "仕事", icon: "briefcase", theme: .violet),
    ]

    static let icons = ["house", "briefcase", "book", "graduationcap", "cart", "airplane", "gamecontroller",
                        "music.note", "film", "heart", "star", "leaf", "flame", "paintbrush", "chevron.left.forwardslash.chevron.right", "sparkles"]
}

/// Arc のように、しばらく見ていないタブを自動でしまう。
enum AutoArchive: String, CaseIterable, Identifiable, Codable {
    case never, hours12, day, week

    var id: String { rawValue }

    var label: String {
        switch self {
        case .never: return "しない"
        case .hours12: return "12時間後"
        case .day: return "1日後"
        case .week: return "1週間後"
        }
    }

    var interval: TimeInterval? {
        switch self {
        case .never: return nil
        case .hours12: return 12 * 3600
        case .day: return 24 * 3600
        case .week: return 7 * 24 * 3600
        }
    }
}

struct ArchivedTab: Identifiable, Codable, Hashable {
    var id = UUID()
    var title: String
    var url: String
    var spaceID: UUID
    var archivedAt: Date
}
