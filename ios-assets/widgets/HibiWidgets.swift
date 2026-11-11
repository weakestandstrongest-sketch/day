import WidgetKit
import SwiftUI
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

// MARK: - カレンダー（左に次の予定、右に月のカレンダー）

struct HibiMonthGrid: View {
    let date: Date
    let data: HibiWidgetData?
    var compact = false
    var body: some View {
        let cal = Calendar(identifier: .gregorian)
        let comps = cal.dateComponents([.year, .month, .day], from: date)
        let y = comps.year ?? 2026, m = comps.month ?? 1, today = comps.day ?? 1
        let first = cal.date(from: DateComponents(year: y, month: m, day: 1)) ?? date
        let days = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        let ws = data?.weekStart ?? 1
        let lead = (cal.component(.weekday, from: first) - 1 - ws + 7) % 7 // 0 = Sunday in weekday-1
        let key = String(format: "%04d-%02d", y, m)
        let ev = Set(data?.evDays?[key] ?? []), hol = Set(data?.holDays?[key] ?? [])
        let heads = ws == 1 ? ["月", "火", "水", "木", "金", "土", "日"] : ["日", "月", "火", "水", "木", "金", "土"]
        let cells: [Int] = Array(repeating: 0, count: lead) + Array(1...days)
        let rows = (cells.count + 6) / 7
        let fs: CGFloat = compact ? 10 : 12
        VStack(alignment: .leading, spacing: compact ? 1 : 3) {
            Text("\(m)月").font(.system(size: fs + 1, weight: .bold))
            Grid(horizontalSpacing: 0, verticalSpacing: compact ? 0 : 2) {
                GridRow {
                    ForEach(0..<7, id: \.self) { i in
                        Text(heads[i]).font(.system(size: fs - 2, weight: .semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                    }
                }
                ForEach(0..<rows, id: \.self) { r in
                    GridRow {
                        ForEach(0..<7, id: \.self) { c in
                            let i = r * 7 + c
                            let d = i < cells.count ? cells[i] : 0
                            let col = (ws + c) % 7 // 0 = Sunday
                            let dim = col == 0 || col == 6 || hol.contains(d)
                            ZStack {
                                if d == today { RoundedRectangle(cornerRadius: 5).fill(Color.primary.opacity(0.14)) }
                                if d > 0 {
                                    VStack(spacing: 1) {
                                        Text("\(d)").font(.system(size: fs, weight: d == today ? .bold : .medium).monospacedDigit())
                                            .foregroundStyle(dim ? Color.secondary : Color.primary)
                                        Capsule().fill(ev.contains(d) ? Color.secondary : Color.clear).frame(width: fs, height: 1.5)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: compact ? 15 : 19)
                        }
                    }
                }
            }
        }
    }
}

struct HibiAgendaList: View {
    let entry: HibiEntry
    let maxLines: Int
    var body: some View {
        let today = entry.items
        let groups = (entry.data?.upcoming ?? []).filter { $0.date > entry.dayKey } // after midnight "明日" has become today
        VStack(alignment: .leading, spacing: 3) {
            Text(entry.dayLabel).font(.system(size: 13, weight: .bold))
            if today.isEmpty { Text("今後の予定なし").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary) }
            ForEach(today.prefix(maxLines), id: \.self) { it in row(it) }
            let left = max(0, maxLines - today.count)
            if left > 1 {
                ForEach(groups.prefix(3), id: \.self) { g in
                    Text(g.label).font(.system(size: 12, weight: .bold)).foregroundStyle(.secondary).padding(.top, 3)
                    ForEach(g.items.prefix(2), id: \.self) { it in row(it) }
                }
            }
            Spacer(minLength: 0)
        }
    }
    func row(_ it: HibiItem) -> some View {
        HStack(spacing: 6) {
            Text(it.time).font(.system(size: 10.5, weight: .medium).monospacedDigit()).foregroundStyle(.secondary).frame(width: 32, alignment: .leading)
            RoundedRectangle(cornerRadius: 1.5).fill(Color(hex: it.color, fallback: .primary)).frame(width: 3, height: 13)
            Text(it.title).font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
        }
    }
}

struct HibiCalendarView: View {
    @Environment(\.widgetFamily) var family
    let entry: HibiEntry
    var body: some View {
        if family == .systemLarge {
            VStack(alignment: .leading, spacing: 10) {
                HibiMonthGrid(date: entry.date, data: entry.data)
                Divider()
                HibiAgendaList(entry: entry, maxLines: 6)
            }
        } else if family == .systemSmall {
            HibiMonthGrid(date: entry.date, data: entry.data, compact: true)
        } else {
            HStack(alignment: .top, spacing: 12) {
                HibiAgendaList(entry: entry, maxLines: 4).frame(maxWidth: .infinity, alignment: .leading)
                HibiMonthGrid(date: entry.date, data: entry.data, compact: true).frame(maxWidth: .infinity)
            }
        }
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

// MARK: - 次の予定（タイムラインのように）

struct HibiNextView: View {
    @Environment(\.widgetFamily) var family
    let entry: HibiEntry
    var body: some View {
        let now = entry.date.timeIntervalSince1970 * 1000
        let todayItems = entry.items.filter { $0.time != "終日" }
        let tg = entry.data?.upcoming?.first(where: { $0.date > entry.dayKey })
        let tom = (tg?.items ?? []).filter { $0.time != "終日" }
        let tl = tg?.label ?? "明日"
        let n = family == .systemSmall ? 2 : family == .systemMedium ? 3 : 7
        let list: [(HibiItem, Bool)] = (todayItems.map { ($0, false) } + tom.map { ($0, true) }).prefix(n).map { $0 }
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("次の予定").font(.system(size: 12, weight: .bold)).foregroundStyle(.secondary)
                Spacer()
                if let f = list.first, !f.1, let s = f.0.startAt {
                    if s > now { Text(Date(timeIntervalSince1970: s / 1000), style: .relative).font(.system(size: 11, weight: .semibold).monospacedDigit()).foregroundStyle(Color(hex: f.0.color, fallback: .primary)).lineLimit(1) }
                    else { Text("進行中").font(.system(size: 11, weight: .bold)).foregroundStyle(Color(hex: f.0.color, fallback: .primary)) }
                }
            }
            .padding(.bottom, 6)
            if list.isEmpty {
                Spacer()
                Text("このあとの予定はありません").font(.subheadline).foregroundStyle(.secondary)
                Spacer()
            }
            ForEach(Array(list.enumerated()), id: \.offset) { i, x in
                let it = x.0, c = Color(hex: it.color, fallback: .accentColor)
                let live = !x.1 && (it.startAt ?? .infinity) <= now
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(x.1 && (i == 0 || !list[i - 1].1) ? tl : "").lineLimit(1).minimumScaleFactor(0.6).font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
                        Text(it.time).font(.system(size: 12, weight: .semibold).monospacedDigit())
                    }
                    .frame(width: 36, alignment: .trailing)
                    VStack(spacing: 0) {
                        Circle().fill(live ? c : Color.clear).overlay(Circle().stroke(c, lineWidth: 2)).frame(width: 9, height: 9).padding(.top, x.1 && (i == 0 || !list[i - 1].1) ? 14 : 4)
                        if i < list.count - 1 { Rectangle().fill(Color.secondary.opacity(0.35)).frame(width: 1.5).frame(maxHeight: .infinity) }
                    }
                    .frame(width: 10)
                    VStack(alignment: .leading, spacing: 1) {
                        if x.1 && (i == 0 || !list[i - 1].1) { Text(" ").font(.system(size: 9)) }
                        HStack(spacing: 0) {
                            RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 3)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(it.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                                if family != .systemSmall, let e = it.endAt, let s = it.startAt {
                                    Text("\(Int((e - s) / 60000))分").font(.system(size: 10)).foregroundStyle(.secondary)
                                }
                            }
                            .padding(.leading, 6).padding(.vertical, 3)
                            Spacer(minLength: 0)
                        }
                        .background(c.opacity(0.14), in: RoundedRectangle(cornerRadius: 6))
                    }
                }
                .frame(maxHeight: family == .systemLarge ? 46 : .infinity, alignment: .top)
            }
            Spacer(minLength: 0)
        }
    }
}

struct HibiNextWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HibiNext", provider: HibiProvider()) { entry in
            HibiNextView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("次の予定")
        .description("このあとの予定を、タイムラインのように")
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
