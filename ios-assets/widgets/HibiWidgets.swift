import WidgetKit
import SwiftUI
import ActivityKit

// ひび手帳のウィジェット（ホーム画面・ロック画面）と、ライブアクティビティ（ダイナミックアイランド）。
// 中身はひび手帳が App Group の hibi-widget.json に書き、ここは読むだけ。

@main
struct HibiWidgetBundle: WidgetBundle {
    var body: some Widget {
        HibiTodayWidget()
        HibiLiveActivity()
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
struct HibiWidgetData: Codable {
    var date: String      // "11月11日(水)"
    var items: [HibiItem] // 今日のこれからの予定
    var tomorrow: [HibiItem]?
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
    /// the plans not over yet at this entry's time
    var items: [HibiItem] {
        let now = date.timeIntervalSince1970 * 1000
        return (data?.items ?? []).filter { ($0.endAt ?? .infinity) > now }
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
        for it in data?.items ?? [] { if let e = it.endAt { let d = Date(timeIntervalSince1970: e / 1000); if d > now { dates.append(d) } } }
        let entries = dates.sorted().prefix(20).map { HibiEntry(date: $0, data: data) }
        // after midnight the day changes: ask again (ひび手帳 also refreshes it whenever it saves)
        let cal = Calendar.current, midnight = cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: now) ?? now)
        completion(Timeline(entries: Array(entries), policy: .after(midnight)))
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
