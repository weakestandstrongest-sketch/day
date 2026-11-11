import Foundation
import UIKit
import CoreLocation
import SwiftUI
import Capacitor
#if canImport(WidgetKit)
import WidgetKit
#endif
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif

/// ひび手帳の iPhone アプリ版で、iPhone の機能を使う（AI のプラグインと同じパッケージ）。
///
/// - 場所：アプリを閉じていても、行った場所（滞在）と大きな移動を記録する（CLVisit・大きな位置の変化）。
///   iPhone の中に貯めておき、ひび手帳を開いたときに「この1週間の動き」へ渡す。どこにも送らない。
/// - アラーム：iOS 26 の AlarmKit で、目覚まし（毎週）と出発時刻のアラームを鳴らす（マナーモード・集中モードでも鳴る）。
@objc(HibiDevicePlugin)
public class HibiDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HibiDevicePlugin"
    public let jsName = "HibiDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "bgLocStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bgLocStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bgLocStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bgLocTake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alarmStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alarmAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alarmSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widgetSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "siriSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeIntent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tabbarSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "glassSet", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        // the app may have been started in the background by a visit: keep recording
        DispatchQueue.main.async { if PlaceRecorder.shared.enabled { PlaceRecorder.shared.start() } }
    }

    // MARK: - places in the background

    @objc func bgLocStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["enabled": PlaceRecorder.shared.enabled, "auth": PlaceRecorder.shared.authName(), "pending": PlaceRecorder.shared.count()])
        }
    }

    /// Asks for 「常に許可」 (iOS first shows 「使用中のみ」, and later asks the person again by itself) and starts.
    @objc func bgLocStart(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            PlaceRecorder.shared.enabled = true
            PlaceRecorder.shared.askAlways { auth in
                PlaceRecorder.shared.start()
                call.resolve(["enabled": true, "auth": auth])
            }
        }
    }

    @objc func bgLocStop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            PlaceRecorder.shared.enabled = false
            PlaceRecorder.shared.stop()
            call.resolve(["enabled": false])
        }
    }

    /// The points recorded since the last time (and forget them here: ひび手帳 keeps them from now on).
    @objc func bgLocTake(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["points": PlaceRecorder.shared.take()]) }
    }


    // MARK: - widgets (the JSON goes to the App Group, then every widget reloads)

    @objc func widgetSet(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let url = HibiGroup.widgetFile else { return call.resolve(["ok": false, "group": HibiGroup.id]) }
        do { try json.data(using: .utf8)?.write(to: url, options: .atomic) } catch { return call.resolve(["ok": false, "group": HibiGroup.id, "error": error.localizedDescription]) }
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        #endif
        call.resolve(["ok": true, "group": HibiGroup.id])
    }

    // MARK: - what Siri / Shortcuts read without opening the app

    @objc func siriSet(_ call: CAPPluginCall) {
        let d = UserDefaults.standard
        d.set(call.getString("today") ?? "", forKey: "hibi.todayText")
        d.set(call.getString("date") ?? "", forKey: "hibi.todayDate")
        d.set(call.getArray("next", JSObject.self)?.map { o -> [String: Any] in ["at": (o["at"] as? Double) ?? Double((o["at"] as? Int) ?? 0), "say": (o["say"] as? String) ?? ""] } ?? [], forKey: "hibi.next")
        call.resolve()
    }

    /// What a shortcut asked for when it opened the app ("newEntry", "newEvent", "timer", "alarms"), once.
    @objc func takeIntent(_ call: CAPPluginCall) {
        let d = UserDefaults.standard, s = d.string(forKey: "hibi.intent") ?? "", at = d.double(forKey: "hibi.intent.at")
        d.removeObject(forKey: "hibi.intent")
        call.resolve(["intent": Date().timeIntervalSince1970 - at < 120 ? s : ""])
    }

    // MARK: - live activities: [{ key, kind: "timer"|"leave", title, symbol, startAt, endAt, sub }] — the ones not in the list end

    @objc func liveSet(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let want = call.getArray("items", JSObject.self) ?? []
            Task {
                guard ActivityAuthorizationInfo().areActivitiesEnabled else { return call.resolve(["enabled": false]) }
                var keep = Set<String>()
                for o in want {
                    let key = (o["key"] as? String) ?? ""
                    let ms = { (k: String) -> Double in (o[k] as? Double) ?? Double((o[k] as? Int) ?? 0) }
                    let end = Date(timeIntervalSince1970: ms("endAt") / 1000), start = Date(timeIntervalSince1970: ms("startAt") / 1000)
                    if end <= Date() { continue }
                    keep.insert(key)
                    let state = HibiActivityAttributes.ContentState(endAt: end, startAt: start, sub: (o["sub"] as? String) ?? "")
                    let content = ActivityContent(state: state, staleDate: end.addingTimeInterval(60))
                    if let a = Activity<HibiActivityAttributes>.activities.first(where: { LiveKeys.key(of: $0.id) == key }) {
                        await a.update(content)
                    } else {
                        let attrs = HibiActivityAttributes(kind: (o["kind"] as? String) ?? "timer", title: (o["title"] as? String) ?? "ひび手帳", symbol: (o["symbol"] as? String) ?? "timer")
                        if let a = try? Activity.request(attributes: attrs, content: content, pushType: nil) { LiveKeys.set(a.id, key) }
                    }
                }
                for a in Activity<HibiActivityAttributes>.activities where !keep.contains(LiveKeys.key(of: a.id) ?? "") {
                    await a.end(nil, dismissalPolicy: .immediate)
                }
                call.resolve(["enabled": true, "count": keep.count])
            }
            return
        }
        #endif
        call.resolve(["enabled": false])
    }


    // MARK: - the iPhone's own bottom bar (Liquid Glass) over ひび手帳's page

    /// { tabs: [{key, title, symbol}], selected, fab, fabLabel, tint, fabInk, scheme, hidden }. Taps come back as "tab" {key} / "fab".
    @objc func tabbarSet(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else { return call.reject("no view") }
            let bar = HibiTabBar.shared
            if bar.onTab == nil {
                bar.onTab = { [weak self] k in self?.notifyListeners("tab", data: ["key": k]) }
                bar.onFab = { [weak self] in self?.notifyListeners("fab", data: [:]) }
            }
            bar.install(on: vc)
            let st = bar.state
            if let tabs = call.getArray("tabs", JSObject.self) {
                let list = tabs.map { HibiTab(id: ($0["key"] as? String) ?? "", title: ($0["title"] as? String) ?? "", symbol: ($0["symbol"] as? String) ?? "circle") }
                if list != st.tabs { st.tabs = list }
            }
            if let v = call.getString("selected"), v != st.selected { st.selected = v }
            if let v = call.getString("fab"), v != st.fab { st.fab = v }
            if let v = call.getString("fabLabel") { st.fabLabel = v }
            if let c = Color.hibi(call.getString("tint")) { st.tint = c }
            if let c = Color.hibi(call.getString("fabInk")) { st.fabInk = c }
            if let v = call.getBool("fabShown"), v != st.fabShown { st.fabShown = v }
            if let v = call.getBool("hidden"), v != st.hidden { bar.setHidden(v) }
            bar.setScheme(call.getString("scheme") ?? "")
            call.resolve(["ok": true])
        }
    }

    /// [{id, x, y, w, h, symbol, ink, tint?}] in the page's points (CSS px); [] removes them all
    @objc func glassSet(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else { return call.reject("no view") }
            let g = HibiGlass.shared
            if g.onTap == nil { g.onTap = { [weak self] id in self?.notifyListeners("glass", data: ["id": id]) } }
            g.install(on: vc)
            let num: (Any?) -> CGFloat = { v in CGFloat((v as? NSNumber)?.doubleValue ?? 0) }
            let list = (call.getArray("items", JSObject.self) ?? []).map { o in
                HibiGlassItem(id: (o["id"] as? String) ?? "",
                              frame: CGRect(x: num(o["x"]), y: num(o["y"]), width: num(o["w"]), height: num(o["h"])),
                              symbol: (o["symbol"] as? String) ?? "circle",
                              ink: Color.hibi(o["ink"] as? String) ?? .primary,
                              tint: Color.hibi(o["tint"] as? String))
            }
            if list != g.state.items {
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { g.state.items = list }
            }
            g.setScheme(call.getString("scheme") ?? "")
            call.resolve(["ok": true])
        }
    }

    // MARK: - alarms (AlarmKit, iOS 26)

    @objc func alarmStatus(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let s: String
            switch AlarmManager.shared.authorizationState {
            case .authorized: s = "authorized"
            case .denied: s = "denied"
            case .notDetermined: s = "notDetermined"
            @unknown default: s = "unknown"
            }
            return call.resolve(["state": s, "count": AlarmStore.ids().count])
        }
        #endif
        call.resolve(["state": "unavailable", "count": 0])
    }

    @objc func alarmAuth(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let st = try await AlarmManager.shared.requestAuthorization()
                    call.resolve(["state": st == .authorized ? "authorized" : st == .denied ? "denied" : "notDetermined"])
                } catch { call.reject("アラームを許可できませんでした（\(error.localizedDescription)）") }
            }
            return
        }
        #endif
        call.resolve(["state": "unavailable"])
    }

    /// Replaces every alarm ひび手帳 has set with this list:
    /// [{ key, title, kind: "fixed", at: ms } | { key, title, kind: "weekly", hour, minute, weekdays: [0-6, 0 = 日] }]
    @objc func alarmSet(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let list = call.getArray("alarms", JSObject.self) ?? []
            Task {
                // cancel what was set before
                for id in AlarmStore.ids() { try? AlarmManager.shared.cancel(id: id) }
                var done: [UUID] = []
                var failed = 0
                for a in list.prefix(40) {
                    let title = (a["title"] as? String) ?? "ひび手帳"
                    let kind = (a["kind"] as? String) ?? "fixed"
                    let schedule: Alarm.Schedule
                    if kind == "weekly" {
                        let h = (a["hour"] as? Int) ?? 7, m = (a["minute"] as? Int) ?? 0
                        let wd = ((a["weekdays"] as? [Any]) ?? []).compactMap { $0 as? Int }.compactMap(AlarmStore.weekday)
                        schedule = .relative(.init(time: .init(hour: h, minute: m), repeats: wd.isEmpty ? .never : .weekly(wd)))
                    } else {
                        guard let ms = a["at"] as? Double ?? (a["at"] as? Int).map(Double.init) else { failed += 1; continue }
                        let date = Date(timeIntervalSince1970: ms / 1000)
                        if date <= Date() { continue }
                        schedule = .fixed(date)
                    }
                    let stop = AlarmButton(text: "止める", textColor: .white, systemImageName: "stop.circle")
                    let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title), stopButton: stop)
                    let attrs = AlarmAttributes<HibiAlarmData>(presentation: AlarmPresentation(alert: alert), metadata: HibiAlarmData(), tintColor: Color(red: 0.88, green: 0.5, blue: 0.47))
                    let id = UUID()
                    do {
                        _ = try await AlarmManager.shared.schedule(id: id, configuration: .init(schedule: schedule, attributes: attrs))
                        done.append(id)
                    } catch { failed += 1 }
                }
                AlarmStore.save(done)
                call.resolve(["count": done.count, "failed": failed])
            }
            return
        }
        #endif
        call.reject("アラームは iOS 26 以降で使えます", "UNAVAILABLE")
    }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct HibiAlarmData: AlarmMetadata {}
#endif

/// Which live activity is which plan (the activity id → ひび手帳's key).
enum LiveKeys {
    private static let k = "hibi.live"
    static func key(of id: String) -> String? { (UserDefaults.standard.dictionary(forKey: k) as? [String: String])?[id] }
    static func set(_ id: String, _ key: String) { var d = (UserDefaults.standard.dictionary(forKey: k) as? [String: String]) ?? [:]; d[id] = key; if d.count > 40 { d = [id: key] }; UserDefaults.standard.set(d, forKey: k) }
}

/// The alarms ひび手帳 has set (so it can take them back before setting the new list).
enum AlarmStore {
    private static let key = "hibi.alarms"
    static func ids() -> [UUID] { (UserDefaults.standard.stringArray(forKey: key) ?? []).compactMap(UUID.init(uuidString:)) }
    static func save(_ ids: [UUID]) { UserDefaults.standard.set(ids.map(\.uuidString), forKey: key) }
    @available(iOS 16.0, *)
    static func weekday(_ n: Int) -> Locale.Weekday? {
        switch n { case 0: return .sunday; case 1: return .monday; case 2: return .tuesday; case 3: return .wednesday
        case 4: return .thursday; case 5: return .friday; case 6: return .saturday; default: return nil }
    }
}

/// Records where the iPhone has been while ひび手帳 is closed. The points stay in a file of this app until ひび手帳 takes them.
final class PlaceRecorder: NSObject, CLLocationManagerDelegate {
    static let shared = PlaceRecorder()
    private let manager = CLLocationManager()
    private var onAuth: ((String) -> Void)?
    private let flagKey = "hibi.bgloc"

    var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: flagKey) }
        set { UserDefaults.standard.set(newValue, forKey: flagKey) }
    }

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.pausesLocationUpdatesAutomatically = true
    }

    func authName() -> String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    func askAlways(_ done: @escaping (String) -> Void) {
        let st = manager.authorizationStatus
        if st == .authorizedAlways || st == .denied || st == .restricted { return done(authName()) }
        onAuth = done
        if st == .notDetermined { manager.requestWhenInUseAuthorization() } else { manager.requestAlwaysAuthorization() }
        // iOS may not answer (already asked before): do not wait for ever
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
            if let f = self?.onAuth { self?.onAuth = nil; f(self?.authName() ?? "unknown") }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let st = manager.authorizationStatus
        if st == .authorizedWhenInUse && onAuth != nil {
            // the first answer is 「使用中のみ」: ask for 「常に」 right after, as iOS wants
            manager.requestAlwaysAuthorization()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                if let f = self?.onAuth { self?.onAuth = nil; f(self?.authName() ?? "unknown") }
            }
            return
        }
        if st != .notDetermined, let f = onAuth { onAuth = nil; f(authName()) }
        if enabled { start() }
    }

    func start() {
        let st = manager.authorizationStatus
        guard enabled, st == .authorizedAlways || st == .authorizedWhenInUse else { return }
        if CLLocationManager.significantLocationChangeMonitoringAvailable() { manager.startMonitoringSignificantLocationChanges() }
        manager.startMonitoringVisits()
    }

    func stop() {
        manager.stopMonitoringSignificantLocationChanges()
        manager.stopMonitoringVisits()
    }

    func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        var p: [String: Any] = ["lat": round5(visit.coordinate.latitude), "lng": round5(visit.coordinate.longitude), "acc": Int(visit.horizontalAccuracy), "src": "visit"]
        let arr = visit.arrivalDate, dep = visit.departureDate
        // a visit can be told twice: on arriving (no departure yet) and on leaving
        p["t"] = Int64((arr == .distantPast ? Date() : arr).timeIntervalSince1970 * 1000)
        if dep != .distantFuture { p["until"] = Int64(dep.timeIntervalSince1970 * 1000) }
        append(p)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for l in locations where l.horizontalAccuracy >= 0 && l.horizontalAccuracy < 1500 {
            append(["t": Int64(l.timestamp.timeIntervalSince1970 * 1000), "lat": round5(l.coordinate.latitude), "lng": round5(l.coordinate.longitude), "acc": Int(l.horizontalAccuracy), "src": "move"])
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    private func round5(_ x: Double) -> Double { (x * 100000).rounded() / 100000 }

    // ---- the file of points not yet given to ひび手帳
    private var fileURL: URL? {
        guard let base = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true) else { return nil }
        return base.appendingPathComponent("hibi-bgloc.json")
    }
    private func read() -> [[String: Any]] {
        guard let u = fileURL, let d = try? Data(contentsOf: u), let a = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]] else { return [] }
        return a
    }
    private func write(_ a: [[String: Any]]) {
        guard let u = fileURL, let d = try? JSONSerialization.data(withJSONObject: a) else { return }
        try? d.write(to: u, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func append(_ p: [String: Any]) {
        var a = read()
        a.append(p)
        if a.count > 3000 { a.removeFirst(a.count - 3000) }
        write(a)
    }
    func count() -> Int { read().count }
    func take() -> [[String: Any]] { let a = read(); write([]); return a }
}
