import WidgetKit
import SwiftUI
import UIKit
import ActivityKit
#if canImport(AlarmKit)
import AlarmKit
#endif

// ひび手帳のウィジェット（ホーム画面・ロック画面）と、ライブアクティビティ（ダイナミックアイランド）。
// 中身はひび手帳が App Group の hibi-widget.json に書き、ここは読むだけ。

@main
struct HibiWidgetBundle: WidgetBundle {
    var body: some Widget {
        HibiTodayWidget()
        HibiCalendarWidget()
        HibiNextWidget()
        HibiLiveActivity()
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) { HibiAlarmLive() }
        #endif
    }
}

// MARK: - data

struct HibiItem: Codable, Hashable {
    var title: String
    var time: String      // "15:00" か "終日"
    var startAt: Double?  // ms
    var endAt: Double?    // ms
    var color: String?
    var sym: String?      // SF Symbols（予定のアイコン）
    var allDay: Bool?
}
struct HibiDayGroup: Codable, Hashable {
    var date: String      // "2026-11-12"
    var label: String     // "明日" / "11月14日(土)"
    var items: [HibiItem]
}
struct HibiWidgetData: Codable {
    var date: String      // "11月11日(水)"
    var items: [HibiItem] // 今日のこれからの予定
    var tomorrow: [HibiItem]?
    /// 明日から2週間の、予定のある日（カレンダーのウィジェットの左側）
    var upcoming: [HibiDayGroup]?
    /// 予定のある日・祝日（"2026-11": [3, 4, ...]）
    var evDays: [String: [Int]]?
    var holDays: [String: [Int]]?
    /// 週のはじまり：1 = 月曜、0 = 日曜
    var weekStart: Int?
    var streak: Int?
    var steps: Int?
    var mono: Bool?
    var accent: String?
    var at: Double?
}
func loadData() -> HibiWidgetData? {
    guard let u = HibiGroup.widgetFile, let d = try? Data(contentsOf: u) else { return nil }
    return try? JSONDecoder().decode(HibiWidgetData.self, from: d)
}
extension Color {
    init(hex: String?, fallback: Color) {
        guard let h = hex, h.count == 7, h.hasPrefix("#"), let v = Int(h.dropFirst(), radix: 16) else { self = fallback; return }
        self = Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
    }
}

// MARK: - 今日の予定（ホーム画面・ロック画面）

struct HibiEntry: TimelineEntry {
    let date: Date
    let data: HibiWidgetData?
    static let dayFmt: DateFormatter = { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f }()
    var dayKey: String { HibiEntry.dayFmt.string(from: date) }
    /// "11月11日(水)" for this entry's day (also right after midnight, before ひび手帳 has been opened)
    var dayLabel: String {
        let c = Calendar(identifier: .gregorian).dateComponents([.month, .day, .weekday], from: date)
        let w = ["日", "月", "火", "水", "木", "金", "土"][((c.weekday ?? 1) - 1) % 7]
        return "\(c.month ?? 1)月\(c.day ?? 1)日(\(w))"
    }
    /// the plans not over yet at this entry's time (after midnight, the day that was "明日")
    var items: [HibiItem] {
        let now = date.timeIntervalSince1970 * 1000
        let later = data?.upcoming?.first(where: { $0.date == dayKey })?.items ?? []
        return ((data?.items ?? []) + later).filter { ($0.endAt ?? .infinity) > now }
    }
}

struct HibiProvider: TimelineProvider {
    func placeholder(in context: Context) -> HibiEntry {
        HibiEntry(date: Date(), data: HibiWidgetData(date: "11月11日(水)", items: [HibiItem(title: "ゼミ", time: "10:00", startAt: nil, endAt: nil, color: "#4F8ED6"), HibiItem(title: "バイト", time: "17:00", startAt: nil, endAt: nil, color: "#4E9F72")], tomorrow: nil, streak: 6, steps: 5432, mono: false, accent: "#E07F78", at: nil))
    }
    func getSnapshot(in context: Context, completion: @escaping (HibiEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : HibiEntry(date: Date(), data: loadData()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<HibiEntry>) -> Void) {
        let data = loadData(), now = Date()
        var dates = [now]
        // a new entry when each plan ends, so the widget drops it by itself
        // a new entry when each plan starts and ends (and at midnight), so the widgets move on by themselves
        let cal = Calendar.current, midnight = cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: now) ?? now)
        let all = (data?.items ?? []) + (data?.upcoming?.prefix(2).flatMap { $0.items } ?? [])
        for it in all { for v in [it.startAt, it.endAt] { if let v = v { let d = Date(timeIntervalSince1970: v / 1000); if d > now { dates.append(d) } } } }
        dates.append(midnight)
        let next = cal.date(byAdding: .day, value: 1, to: midnight) ?? midnight
        let entries = Set(dates.filter { $0 <= next }).sorted().prefix(40).map { HibiEntry(date: $0, data: data) }
        completion(Timeline(entries: Array(entries), policy: .after(next)))
    }
}

struct HibiTodayView: View {
    @Environment(\.widgetFamily) var family
    let entry: HibiEntry
    var mono: Bool { entry.data?.mono ?? false }
    var accent: Color { mono ? .primary : Color(hex: entry.data?.accent, fallback: .pink) }
    func dot(_ it: HibiItem) -> Color { mono ? .primary : Color(hex: it.color, fallback: accent) }

    var body: some View {
        switch family {
        case .accessoryInline:
            if let it = entry.items.first { Text("\(it.time) \(it.title)") } else { Text("今日の予定はもうありません") }
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text("\(entry.items.count)").font(.system(size: 22, weight: .semibold, design: .rounded))
                    Text("予定").font(.system(size: 10))
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                if entry.items.isEmpty { Text(entry.data?.date ?? "ひび手帳").font(.headline); Text("今日の予定はもうありません").font(.caption) }
                ForEach(entry.items.prefix(2), id: \.self) { it in
                    HStack(spacing: 4) { Text(it.time).font(.caption.monospacedDigit()).bold(); Text(it.title).font(.caption).lineLimit(1) }
                }
                if entry.items.count > 2 { Text("ほか\(entry.items.count - 2)件").font(.caption2).foregroundStyle(.secondary) }
            }
        default:
            let max = family == .systemSmall ? 3 : (family == .systemMedium ? 4 : 9)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(entry.data?.date ?? "ひび手帳").font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(accent)
                    Spacer()
                    if let s = entry.data?.steps, s > 0, family != .systemSmall { Label("\(s)歩", systemImage: "figure.walk").font(.caption2).foregroundStyle(.secondary) }
                }
                if entry.data == nil {
                    Text("ひび手帳を開くと、ここに今日の予定が出ます").font(.caption).foregroundStyle(.secondary)
                } else if entry.items.isEmpty {
                    Text("今日の予定はもうありません").font(.subheadline).foregroundStyle(.secondary)
                    if let t = entry.data?.tomorrow?.first { Text("明日 \(t.time) \(t.title)").font(.caption).lineLimit(1) }
                } else {
                    ForEach(entry.items.prefix(max), id: \.self) { it in
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2).fill(dot(it)).frame(width: 4, height: 16)
                            Text(it.time).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                            Text(it.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                        }
                    }
                    if entry.items.count > max { Text("ほか\(entry.items.count - max)件").font(.caption2).foregroundStyle(.secondary) }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

struct HibiTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HibiToday", provider: HibiProvider()) { entry in
            HibiTodayView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("今日の予定")
        .description("ひび手帳の、今日これからの予定")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

// MARK: - ライブアクティビティ：集中タイマー・出発まで

struct HibiLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HibiActivityAttributes.self) { context in
            // ロック画面
            HStack(spacing: 12) {
                Image(systemName: context.attributes.symbol).font(.title2).frame(width: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.title).font(.headline).lineLimit(1)
                    if !context.state.sub.isEmpty { Text(context.state.sub).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                    ProgressView(timerInterval: context.state.startAt...context.state.endAt, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                        .tint(.white)
                }
                Text(timerInterval: Date()...context.state.endAt, countsDown: true)
                    .font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
                    .multilineTextAlignment(.trailing).frame(width: 96)
            }
            .padding(16)
            .activityBackgroundTint(Color.black.opacity(0.85))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.kind == "leave" ? "出発" : "集中", systemImage: context.attributes.symbol).font(.caption)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...context.state.endAt, countsDown: true).font(.title3.monospacedDigit()).multilineTextAlignment(.trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.attributes.title).font(.headline).lineLimit(1)
                        if !context.state.sub.isEmpty { Text(context.state.sub).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                        ProgressView(timerInterval: context.state.startAt...context.state.endAt, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                    }
                }
            } compactLeading: {
                Image(systemName: context.attributes.symbol)
            } compactTrailing: {
                Text(timerInterval: Date()...context.state.endAt, countsDown: true).monospacedDigit().frame(maxWidth: 52)
            } minimal: {
                Image(systemName: context.attributes.symbol)
            }
        }
    }
}

// MARK: - カレンダー（左に次の予定、右に月のカレンダー）：シンプルな月カレンダーのウィジェットの並べ方

let jaLocale = Locale(identifier: "ja_JP")

/// 1行ずつ積む：見出し・予定・「今後の予定なし」。入るぶんだけ出す
enum AgendaLine: Hashable {
    case head(String)
    case none(String)
    case item(HibiItem)
}

func agendaLines(_ entry: HibiEntry, budget: Int) -> [AgendaLine] {
    var out: [AgendaLine] = [.head(entry.dayLabel)]
    let today = entry.items
    if today.isEmpty { out.append(.none("今後の予定なし")) }
    for it in today { if out.count >= budget { break }; out.append(.item(it)) }
    for g in (entry.data?.upcoming ?? []) where g.date > entry.dayKey {
        if out.count + 2 > budget { break }   // a day's name needs at least one plan under it
        out.append(.head(g.label))
        for it in g.items { if out.count >= budget { break }; out.append(.item(it)) }
    }
    return out
}

struct HibiAgenda: View {
    let entry: HibiEntry
    let budget: Int
    let line: CGFloat
    var body: some View {
        let mono = entry.data?.mono ?? false
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(agendaLines(entry, budget: budget).enumerated()), id: \.offset) { i, l in
                switch l {
                case .head(let t):
                    Text(t).font(.system(size: 13, weight: .bold)).foregroundStyle(i == 0 ? Color.primary : Color.secondary)
                        .frame(height: line, alignment: .bottom).padding(.top, i == 0 ? 0 : 4)
                case .none(let t):
                    Text(t).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary).frame(height: line)
                case .item(let it):
                    HStack(spacing: 7) {
                        Text(it.time).font(.system(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(.secondary).frame(width: 33, alignment: .leading)
                        RoundedRectangle(cornerRadius: 1.5).fill(mono ? Color.primary : Color(hex: it.color, fallback: .primary)).frame(width: 3.5, height: 15)
                        Text(it.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    }
                    .frame(height: line)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct HibiMonthGrid: View {
    let date: Date
    let data: HibiWidgetData?
    var cell: CGFloat = 17
    var font: CGFloat = 12
    var body: some View {
        let cal = Calendar(identifier: .gregorian)
        let comps = cal.dateComponents([.year, .month, .day], from: date)
        let y = comps.year ?? 2026, m = comps.month ?? 1, today = comps.day ?? 1
        let first = cal.date(from: DateComponents(year: y, month: m, day: 1)) ?? date
        let days = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        let ws = data?.weekStart ?? 1
        let lead = (cal.component(.weekday, from: first) - 1 - ws + 7) % 7
        let key = String(format: "%04d-%02d", y, m)
        let ev = Set(data?.evDays?[key] ?? []), hol = Set(data?.holDays?[key] ?? [])
        let heads = ws == 1 ? ["月", "火", "水", "木", "金", "土", "日"] : ["日", "月", "火", "水", "木", "金", "土"]
        let cells: [Int] = Array(repeating: 0, count: lead) + Array(1...days)
        let rows = (cells.count + 6) / 7
        VStack(alignment: .leading, spacing: 0) {
            Text("\(m)月").font(.system(size: font + 1, weight: .bold)).frame(height: cell, alignment: .bottom).padding(.leading, 4)
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    Text(heads[i]).font(.system(size: font - 2.5, weight: .semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
            }
            .frame(height: cell)
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { c in
                        let i = r * 7 + c
                        let d = i < cells.count ? cells[i] : 0
                        let col = (ws + c) % 7 // 0 = Sunday
                        let dim = col == 0 || col == 6 || hol.contains(d)
                        ZStack {
                            if d == today {
                                RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color.primary.opacity(0.16)).frame(width: font * 2 + 2, height: cell + 1)
                            }
                            if d > 0 {
                                Text("\(d)").font(.system(size: font, weight: d == today ? .bold : .medium).monospacedDigit())
                                    .foregroundStyle(dim && d != today ? Color.secondary : Color.primary)
                                if ev.contains(d) && d != today {
                                    Capsule().fill(dim ? Color.secondary : Color.primary.opacity(0.7)).frame(width: font * 1.15, height: 1.6).offset(y: font * 0.78)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: cell)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct HibiCalendarView: View {
    @Environment(\.widgetFamily) var family
    let entry: HibiEntry
    var body: some View {
        Group {
            if family == .systemLarge {
                VStack(alignment: .leading, spacing: 8) {
                    HibiMonthGrid(date: entry.date, data: entry.data, cell: 24, font: 15).frame(height: 24 * 8)
                    Rectangle().fill(Color.secondary.opacity(0.25)).frame(height: 0.5)
                    HibiAgenda(entry: entry, budget: 7, line: 19)
                }
            } else if family == .systemSmall {
                HibiMonthGrid(date: entry.date, data: entry.data, cell: 16, font: 10.5)
            } else {
                HStack(alignment: .top, spacing: 14) {
                    HibiAgenda(entry: entry, budget: 7, line: 19).frame(maxWidth: .infinity, alignment: .leading)
                    HibiMonthGrid(date: entry.date, data: entry.data, cell: 17, font: 11.5).frame(maxWidth: .infinity)
                }
            }
        }
        .environment(\.locale, jaLocale)
    }
}

struct HibiCalendarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HibiCalendar", provider: HibiProvider()) { entry in
            HibiCalendarView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("カレンダー")
        .description("次の予定と、今月のカレンダー")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - 次の予定：丸いアイコンを1本の線でつなぐ、一日のタイムラインのウィジェット

struct NextItem: Hashable { let it: HibiItem; let tomorrow: Bool }

func nextItems(_ entry: HibiEntry, _ n: Int) -> [NextItem] {
    let today = entry.items.filter { !($0.allDay ?? ($0.time == "終日")) }
    let tg = entry.data?.upcoming?.first(where: { $0.date > entry.dayKey })
    let tom = (tg?.items ?? []).filter { !($0.allDay ?? ($0.time == "終日")) }
    return Array((today.map { NextItem(it: $0, tomorrow: false) } + tom.map { NextItem(it: $0, tomorrow: true) }).prefix(n))
}

let hmFmt: DateFormatter = { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "H:mm"; return f }()
func timeRange(_ x: NextItem) -> String {
    guard let s = x.it.startAt else { return x.it.time }
    let a = hmFmt.string(from: Date(timeIntervalSince1970: s / 1000))
    var t = a
    if let e = x.it.endAt, e > s { t += " – " + hmFmt.string(from: Date(timeIntervalSince1970: e / 1000)) }
    return (x.tomorrow ? "明日 " : "") + t
}

/// 予定の丸いアイコン（不透明な丸に白い絵。後ろの線は透けない）
struct NextBubble: View {
    let x: NextItem
    let size: CGFloat
    let mono: Bool
    let live: Bool
    var body: some View {
        // mono: 落ち着いた灰色の丸に白い絵（白い丸に白い絵で見えなくならないように）
        let c = mono ? Color(white: 0.42) : Color(hex: x.it.color, fallback: Color(white: 0.42))
        ZStack {
            Circle().fill(Color.black)          // fully opaque base, so the line behind never shows through
            Circle().fill(c)
            Image(systemName: x.it.sym ?? "circle.fill").font(.system(size: size * 0.46, weight: .semibold))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.18), radius: 1, y: 0.5)
        }
        .frame(width: size, height: size)
        .overlay(Circle().strokeBorder(Color.white.opacity(live ? 0.9 : 0), lineWidth: 2))
    }
}

struct HibiNextView: View {
    @Environment(\.widgetFamily) var family
    let entry: HibiEntry
    var body: some View {
        Group {
            if family == .systemSmall { small } else { list }
        }
        .environment(\.locale, jaLocale)
    }

    var mono: Bool { entry.data?.mono ?? false }
    var now: Double { entry.date.timeIntervalSince1970 * 1000 }
    func isLive(_ x: NextItem) -> Bool { !x.tomorrow && (x.it.startAt ?? .infinity) <= now }

    @ViewBuilder func remain(_ x: NextItem) -> some View {
        if isLive(x) {
            if let e = x.it.endAt { HStack(spacing: 3) { Text("のこり"); Text(Date(timeIntervalSince1970: e / 1000), style: .relative) } }
        } else if let s = x.it.startAt {
            HStack(spacing: 3) { Text("あと"); Text(Date(timeIntervalSince1970: s / 1000), style: .relative) }
        }
    }

    // 小：いちばん近い予定をひとつ。線の上の大きな丸、右上に「済ませる」丸、下に時刻と名前
    var small: some View {
        let list = nextItems(entry, 1)
        return ZStack(alignment: .topLeading) {
            if let x = list.first {
                Rectangle().fill(Color.secondary.opacity(0.45)).frame(width: 3, height: 30).offset(x: 26.5, y: -30)
                Rectangle().fill(Color.secondary.opacity(0.45)).frame(width: 3, height: 16).offset(x: 26.5, y: 56)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .top) {
                        NextBubble(x: x, size: 56, mono: mono, live: isLive(x))
                        Spacer()
                        Circle().strokeBorder(Color.primary.opacity(0.85), lineWidth: 2.5).frame(width: 30, height: 30).padding(.top, 13)
                    }
                    Spacer(minLength: 4)
                    Text(timeRange(x)).font(.system(size: 14, weight: .medium).monospacedDigit()).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
                    Text(x.it.title).font(.system(size: 19, weight: .bold)).lineLimit(2).minimumScaleFactor(0.85)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: "checkmark.circle").font(.system(size: 34, weight: .semibold)).foregroundStyle(.secondary)
                    Spacer()
                    Text("このあとの予定はありません").font(.system(size: 15, weight: .bold))
                }
            }
        }
    }

    // 中・大：丸いアイコンを1本の線でつないだ一覧
    var list: some View {
        let n = family == .systemMedium ? 3 : 7
        let items = nextItems(entry, n)
        let size: CGFloat = family == .systemMedium ? 34 : 38
        let row: CGFloat = family == .systemMedium ? 44 : 50
        return VStack(alignment: .leading, spacing: 0) {
            if items.isEmpty {
                Spacer()
                HStack { Image(systemName: "checkmark.circle").font(.title2).foregroundStyle(.secondary); Text("このあとの予定はありません").font(.system(size: 15, weight: .bold)) }
                Spacer()
            } else {
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(Color.secondary.opacity(0.3)).frame(width: 2.5, height: max(0, row * CGFloat(items.count - 1)) + 8).offset(x: size / 2 - 1.25, y: size / 2)
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.offset) { i, x in
                            HStack(spacing: 11) {
                                NextBubble(x: x, size: size, mono: mono, live: isLive(x))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(timeRange(x)).font(.system(size: 11.5, weight: .medium).monospacedDigit()).foregroundStyle(.secondary).lineLimit(1)
                                    Text(x.it.title).font(.system(size: 15, weight: .bold)).lineLimit(1)
                                }
                                Spacer(minLength: 4)
                                if i == 0 { remain(x).font(.system(size: 11.5, weight: .semibold).monospacedDigit()).foregroundStyle(.secondary).lineLimit(1) }
                            }
                            .frame(height: row, alignment: .top)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

struct HibiNextWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HibiNext", provider: HibiProvider()) { entry in
            HibiNextView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("次の予定")
        .description("このあとの予定を、丸いアイコンのタイムラインで")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - アラームのスヌーズ中（ロック画面・ダイナミックアイランド）

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct HibiAlarmLive: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<HibiAlarmData>.self) { context in
            HStack(spacing: 12) {
                Image(systemName: "alarm").font(.title2)
                VStack(alignment: .leading) {
                    Text("アラーム").font(.headline)
                    Text("スヌーズ中").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                HibiAlarmCountdown(state: context.state).font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
            }
            .padding(16)
            .activityBackgroundTint(Color.black.opacity(0.85))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Label("スヌーズ中", systemImage: "alarm").font(.caption) }
                DynamicIslandExpandedRegion(.trailing) { HibiAlarmCountdown(state: context.state).font(.title3.monospacedDigit()) }
            } compactLeading: {
                Image(systemName: "alarm")
            } compactTrailing: {
                HibiAlarmCountdown(state: context.state).monospacedDigit().frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "alarm")
            }
        }
    }
}

@available(iOS 26.0, *)
struct HibiAlarmCountdown: View {
    let state: AlarmPresentationState
    var body: some View {
        if case .countdown(let c) = state.mode {
            Text(timerInterval: Date()...max(Date(), c.fireDate), countsDown: true)
        } else {
            Text("")
        }
    }
}
#endif
