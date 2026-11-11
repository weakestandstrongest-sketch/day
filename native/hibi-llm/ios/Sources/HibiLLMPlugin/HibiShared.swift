import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(AlarmKit)
import AlarmKit
#endif

// このファイルは、アプリ本体（プラグイン）とウィジェットの拡張機能の両方に入る（GitHub Actions が拡張機能にもコピーする）。

/// ライブアクティビティ（ダイナミックアイランド・ロック画面）：集中タイマーの残り時間と、出発までの時間。
#if canImport(ActivityKit)
@available(iOS 16.1, *)
public struct HibiActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// 終わる時刻（集中タイマーの終わり／家を出る時刻）
        public var endAt: Date
        /// 始めた時刻（進み具合のバー）
        public var startAt: Date
        /// 小さな字で出す一行（「名鉄岐阜 8:12発」など）
        public var sub: String
        public init(endAt: Date, startAt: Date, sub: String) { self.endAt = endAt; self.startAt = startAt; self.sub = sub }
    }
    /// "timer"（集中タイマー）か "leave"（出発）
    public var kind: String
    public var title: String
    /// アイコン（SF Symbols の名前）
    public var symbol: String
    public init(kind: String, title: String, symbol: String) { self.kind = kind; self.title = title; self.symbol = symbol }
}
#endif

/// アプリとウィジェットで分け合う場所（App Group）。名前は AltStore が付け直すことがあるので、
/// 決め打ちにせず、アプリに入っているプロビジョニングプロファイルから読む。
public enum HibiGroup {
    public static let fallback = "group.jp.weakestandstrongest.hibi"
    public static let id: String = {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let text = String(data: data, encoding: .isoLatin1),
              let a = text.range(of: "<?xml"), let b = text.range(of: "</plist>") else { return fallback }
        let xml = String(text[a.lowerBound..<b.upperBound])
        guard let d = xml.data(using: .isoLatin1),
              let plist = try? PropertyListSerialization.propertyList(from: d, format: nil) as? [String: Any],
              let ent = plist["Entitlements"] as? [String: Any],
              let groups = ent["com.apple.security.application-groups"] as? [String], let g = groups.first else { return fallback }
        return g
    }()
    public static var folder: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) }
    /// ウィジェットに出す中身（ひび手帳が書き、ウィジェットが読む）
    public static var widgetFile: URL? { folder?.appendingPathComponent("hibi-widget.json") }
}

/// アラーム（AlarmKit）につける、ひび手帳の印。アプリとウィジェット（スヌーズ中の表示）の両方で使う。
#if canImport(AlarmKit)
@available(iOS 26.0, *)
public struct HibiAlarmData: AlarmMetadata {
    public init() {}
}
#endif
