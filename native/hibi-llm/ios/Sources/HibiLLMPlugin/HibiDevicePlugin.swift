import Foundation
import UIKit
import CoreLocation
import SwiftUI
import Capacitor
import PhotosUI
import AVFoundation
import MediaPlayer
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
        CAPPluginMethod(name: "alarmTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alarmRing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alarmQuiet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widgetSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "siriSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeIntent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tabbarSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "glassSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ctxArm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "orbitArm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "orbitOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "orbitClose", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "jamArm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "jamClose", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gyoukaiArm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gyoukaiClose", returnType: CAPPluginReturnPromise),
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


    // MARK: - Orbit（ブラウザ）を ひび手帳 の上に重ねて開く

    /// { on }：「日記」を見ているあいだだけ、左端からのスワイプで Orbit を開けるようにする。開いた・閉じたは "orbit" {open} で知らせる
    @objc func orbitArm(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else { return call.reject("no view") }
            let web = self.bridge?.webView
            let open: Bool = MainActor.assumeIsolated {
                let o = EdgeApps.orbit
                if o.onChange == nil { o.onChange = { [weak self] open in self?.notifyListeners("orbit", data: ["open": open]) } }
                o.arm(call.getBool("on") ?? false, vc: vc, webView: web)
                return o.isOpen
            }
            call.resolve(["ok": true, "open": open])
        }
    }

    @objc func orbitOpen(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else { return call.reject("no view") }
            MainActor.assumeIsolated {
                let o = EdgeApps.orbit
                if o.onChange == nil { o.onChange = { [weak self] open in self?.notifyListeners("orbit", data: ["open": open]) } }
                o.open(vc: vc)
            }
            call.resolve(["ok": true])
        }
    }

    @objc func orbitClose(_ call: CAPPluginCall) {
        DispatchQueue.main.async { MainActor.assumeIsolated { EdgeApps.orbit.close() }; call.resolve(["ok": true]) }
    }

    /// { on, url }：「ふりかえり」を見ているあいだだけ、左端からのスワイプで Jam（communication）を開けるようにする
    @objc func jamArm(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else { return call.reject("no view") }
            let web = self.bridge?.webView
            let url = call.getString("url").flatMap { URL(string: $0.trimmingCharacters(in: .whitespaces)) }.flatMap { $0.scheme == nil ? nil : $0 }
            let open: Bool = MainActor.assumeIsolated {
                let j = EdgeApps.jam
                if j.onChange == nil { j.onChange = { [weak self] open in self?.notifyListeners("jam", data: ["open": open]) } }
                EdgeWebController.jam.setURL(url)
                j.arm(call.getBool("on") ?? false, vc: vc, webView: web)
                return j.isOpen
            }
            call.resolve(["ok": true, "open": open])
        }
    }

    /// { on }：「日記」を見ているあいだだけ、右端からのスワイプで Gyoukai（業界研究）を開けるようにする
    @objc func gyoukaiArm(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else { return call.reject("no view") }
            let web = self.bridge?.webView
            let open: Bool = MainActor.assumeIsolated {
                let g = EdgeApps.gyoukai
                if g.onChange == nil { g.onChange = { [weak self] open in self?.notifyListeners("gyoukai", data: ["open": open]) } }
                g.arm(call.getBool("on") ?? false, vc: vc, webView: web)
                return g.isOpen
            }
            call.resolve(["ok": true, "open": open])
        }
    }

    @objc func gyoukaiClose(_ call: CAPPluginCall) {
        DispatchQueue.main.async { MainActor.assumeIsolated { EdgeApps.gyoukai.close() }; call.resolve(["ok": true]) }
    }

    @objc func jamClose(_ call: CAPPluginCall) {
        DispatchQueue.main.async { MainActor.assumeIsolated { EdgeApps.jam.close() }; call.resolve(["ok": true]) }
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
            let mw = call.getDouble("barWidth").map { CGFloat($0) }
            if mw != st.maxWidth { st.maxWidth = mw }
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
            if g.onTap == nil {
                g.onTap = { [weak self] id in self?.notifyListeners("glass", data: ["id": id]) }
                g.onMenu = { [weak self] id, pick in self?.notifyListeners("glassMenu", data: ["id": id, "pick": pick]) }
                g.onTime = { [weak self] id, v in self?.notifyListeners("glassTime", data: ["id": id, "value": v]) }
            }
            g.install(on: vc)
            let num: (Any?) -> CGFloat = { v in CGFloat((v as? NSNumber)?.doubleValue ?? 0) }
            let list = (call.getArray("items", JSObject.self) ?? []).map { o in
                HibiGlassItem(id: (o["id"] as? String) ?? "",
                              frame: CGRect(x: num(o["x"]), y: num(o["y"]), width: num(o["w"]), height: num(o["h"])),
                              symbol: (o["symbol"] as? String) ?? "circle",
                              ink: Color.hibi(o["ink"] as? String) ?? .primary,
                              tint: Color.hibi(o["tint"] as? String),
                              kind: (o["kind"] as? String) ?? "btn",
                              value: (o["value"] as? String) ?? "",
                              menu: ((o["menu"] as? [Any]) ?? []).compactMap { $0 as? [String: Any] }.map {
                                  HibiMenuItem(id: ($0["id"] as? String) ?? "", title: ($0["title"] as? String) ?? "", symbol: ($0["symbol"] as? String) ?? "", destructive: ($0["destructive"] as? Bool) ?? false)
                              })
            }
            if list != g.state.items {
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { g.state.items = list }
            }
            g.setScheme(call.getString("scheme") ?? "")
            call.resolve(["ok": true])
        }
    }

    // MARK: - iPhone 本物の部品：確認・選ぶ・共有・写真・長押しメニュー

    /// {title, message, sheet, actions:[{title, style:"default"|"cancel"|"destructive"}]} → {index}
    @objc func alert(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let top = HibiTop.vc(self?.bridge?.viewController) else { return call.reject("no view") }
            let sheet = call.getBool("sheet") ?? false
            let t = call.getString("title"), m = call.getString("message")
            let a = UIAlertController(title: (t?.isEmpty ?? true) ? nil : t, message: (m?.isEmpty ?? true) ? nil : m, preferredStyle: sheet ? .actionSheet : .alert)
            let acts = call.getArray("actions", JSObject.self) ?? []
            for (i, o) in acts.enumerated() {
                let st = (o["style"] as? String) ?? "default"
                a.addAction(UIAlertAction(title: (o["title"] as? String) ?? "", style: st == "cancel" ? .cancel : st == "destructive" ? .destructive : .default) { _ in call.resolve(["index": i]) })
            }
            if acts.isEmpty { a.addAction(UIAlertAction(title: "OK", style: .default) { _ in call.resolve(["index": 0]) }) }
            if let pop = a.popoverPresentationController { pop.sourceView = top.view; pop.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.maxY - 40, width: 1, height: 1) }
            top.present(a, animated: true)
        }
    }

    /// {files:[{name, data(base64), mime}], text} → iPhone の共有シート
    @objc func share(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let top = HibiTop.vc(self?.bridge?.viewController) else { return call.reject("no view") }
            var items: [Any] = []
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("hibi-share", isDirectory: true)
            try? FileManager.default.removeItem(at: dir)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            for o in call.getArray("files", JSObject.self) ?? [] {
                guard let b = o["data"] as? String, let d = Data(base64Encoded: b) else { continue }
                let name = ((o["name"] as? String) ?? "file").replacingOccurrences(of: "/", with: "_")
                let u = dir.appendingPathComponent(name)
                if (try? d.write(to: u)) != nil { items.append(u) }
            }
            if let t = call.getString("text"), !t.isEmpty { items.append(t) }
            guard !items.isEmpty else { return call.reject("nothing") }
            let v = UIActivityViewController(activityItems: items, applicationActivities: nil)
            v.completionWithItemsHandler = { _, ok, _, _ in call.resolve(["completed": ok]) }
            if let pop = v.popoverPresentationController { pop.sourceView = top.view; pop.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.maxY - 40, width: 1, height: 1) }
            top.present(v, animated: true)
        }
    }

    /// iPhone の写真ピッカーで1枚 → {data(base64 JPEG), mime, name} か {cancelled}
    @objc func pickPhoto(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let top = HibiTop.vc(self?.bridge?.viewController) else { return call.reject("no view") }
            var cfg = PHPickerConfiguration()
            cfg.filter = .images
            cfg.selectionLimit = 1
            let p = PHPickerViewController(configuration: cfg)
            let d = HibiPhotoPick { o in call.resolve(o) }
            HibiPhotoPick.live = d
            p.delegate = d
            top.present(p, animated: true)
        }
    }

    /// 長押しメニューの準備：{x, y, w, h, radius, items:[{id, title, symbol, destructive}]}（ページの中の場所）
    @objc func ctxArm(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let web = self.bridge?.webView else { return call.reject("no view") }
            let c = HibiCtx.shared
            if c.onPick == nil { c.onPick = { [weak self] id in self?.notifyListeners("ctx", data: ["id": id]) } }
            c.install(on: web)
            let n: (String) -> CGFloat = { k in CGFloat(call.getDouble(k) ?? 0) }
            let items = (call.getArray("items", JSObject.self) ?? []).map { o -> [String: Any] in
                ["id": (o["id"] as? String) ?? "", "title": (o["title"] as? String) ?? "", "symbol": (o["symbol"] as? String) ?? "", "destructive": (o["destructive"] as? Bool) ?? false]
            }
            c.armed = items.isEmpty ? nil : HibiCtx.Armed(rect: CGRect(x: n("x"), y: n("y"), width: n("w"), height: n("h")), radius: n("radius"), items: items, at: Date())
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
            // what the iPhone itself has waiting (not only what ひび手帳 remembers setting)
            let sys = (try? AlarmManager.shared.alarms) ?? []
            let alerting = sys.filter { if case .alerting = $0.state { return true } else { return false } }.count
            return call.resolve(["state": s, "count": AlarmStore.ids().count, "scheduled": sys.count, "alerting": alerting])
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
                HibiSounds.install()
                // cancel what was set before
                for id in AlarmStore.ids() { try? AlarmManager.shared.cancel(id: id) }
                var done: [UUID] = []
                var failed = 0
                var lastErr = ""
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
                    do {
                        let id = try await HibiAlarms.schedule(title: title, schedule: schedule, sound: (a["sound"] as? String) ?? "", snooze: (a["snooze"] as? Bool) ?? true)
                        done.append(id)
                    } catch { failed += 1; lastErr = String(describing: error) }
                }
                AlarmStore.save(done)
                call.resolve(["count": done.count, "failed": failed, "error": lastErr])
            }
            return
        }
        #endif
        call.reject("アラームは iOS 26 以降で使えます", "UNAVAILABLE")
    }

    /// アプリを開いているあいだ（画面がついているとき）は、iPhone のアラームが鳴らないことがあるので、ひび手帳が自分で鳴らす。
    /// {sound}：消音モードでも鳴るように「再生」として、くり返し鳴らす
    @objc func alarmRing(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            MainActor.assumeIsolated { EdgeApps.orbit.close(); EdgeApps.jam.close(); EdgeApps.gyoukai.close() } // アラームを止める画面が Orbit の下に隠れないように
            HibiRinger.shared.ring(call.getString("sound") ?? "")
            call.resolve(["ok": true])
        }
    }

    /// 鳴っているのを止める（ひび手帳の音も、iPhone のアラームで鳴っているものも）
    @objc func alarmQuiet(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            HibiRinger.shared.stop()
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                for a in (try? AlarmManager.shared.alarms) ?? [] { if case .alerting = a.state { try? AlarmManager.shared.stop(id: a.id) } }
            }
            #endif
            call.resolve(["ok": true])
        }
    }

    /// 鳴らしてみる：{sound, title} を数秒後に1回だけ（ほかのアラームはそのまま）
    @objc func alarmTest(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    if AlarmManager.shared.authorizationState != .authorized {
                        let st = try await AlarmManager.shared.requestAuthorization()
                        if st != .authorized { return call.reject("アラームが許可されていません", "DENIED") }
                    }
                    HibiSounds.install()
                    let at = Date().addingTimeInterval(Double(call.getInt("seconds") ?? 5))
                    _ = try await HibiAlarms.schedule(title: call.getString("title") ?? "ひび手帳のアラーム", schedule: .fixed(at), sound: call.getString("sound") ?? "", snooze: false)
                    call.resolve(["ok": true])
                } catch { call.reject(String(describing: error), "FAILED") }
            }
            return
        }
        #endif
        call.reject("アラームは iOS 26 以降で使えます", "UNAVAILABLE")
    }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
enum HibiAlarms {
    static func schedule(title: String, schedule: Alarm.Schedule, sound: String, snooze: Bool) async throws -> UUID {
        let stop = AlarmButton(text: "止める", textColor: .white, systemImageName: "stop.circle")
        let alert: AlarmPresentation.Alert
        if snooze {
            let sn = AlarmButton(text: "スヌーズ", textColor: .white, systemImageName: "zzz")
            alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title), stopButton: stop, secondaryButton: sn, secondaryButtonBehavior: .countdown)
        } else {
            alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title), stopButton: stop)
        }
        let countdown = AlarmPresentation.Countdown(title: LocalizedStringResource(stringLiteral: "スヌーズ中：" + title))
        let attrs = AlarmAttributes<HibiAlarmData>(presentation: AlarmPresentation(alert: alert, countdown: countdown), metadata: HibiAlarmData(), tintColor: Color(red: 0.88, green: 0.5, blue: 0.47))
        let file = HibiSounds.file(sound)
        let cfg = AlarmManager.AlarmConfiguration<HibiAlarmData>(
            countdownDuration: snooze ? Alarm.CountdownDuration(preAlert: nil, postAlert: 9 * 60) : nil,
            schedule: schedule, attributes: attrs,
            sound: file.map { AlertConfiguration.AlertSound.named($0) } ?? .default)
        let id = UUID()
        _ = try await AlarmManager.shared.schedule(id: id, configuration: cfg)
        return id
    }
}
#endif

final class HibiRinger {
    static let shared = HibiRinger()
    private var player: AVAudioPlayer?
    private var vol: MPVolumeView?
    private var ramp: Timer?
    private var saved: Float?
    private var started = Date()

    /// 鳴らす：iPhone の音量が 0 でも聞こえるよう、iPhone の音量を少しずつ上げて、30秒で最大に。
    /// 音量ボタンで下げられても、すぐ元の大きさへ戻す（止めるのは「止める」だけ）
    func ring(_ name: String) {
        stop()
        let n = HibiSounds.names.contains(name) ? name : "bell" // iPhone の標準の音はアプリからは鳴らせないので、ベルで
        guard let u = Bundle.main.url(forResource: n, withExtension: "wav", subdirectory: "public/sounds") else { return }
        let ses = AVAudioSession.sharedInstance()
        try? ses.setCategory(.playback, mode: .default, options: [])
        try? ses.setActive(true)
        saved = ses.outputVolume
        player = try? AVAudioPlayer(contentsOf: u)
        player?.numberOfLoops = -1
        player?.volume = 1
        player?.play()
        installVolumeView()
        started = Date()
        ramp?.invalidate()
        ramp = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in self?.tick() }
        tick()
    }

    private func tick() {
        let t = Date().timeIntervalSince(started)
        let want = Float(min(1.0, 0.2 + 0.8 * t / 30))
        if abs(AVAudioSession.sharedInstance().outputVolume - want) > 0.02 { setVolume(want) }
    }

    private func installVolumeView() {
        guard vol == nil else { return }
        let w = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first { $0.isKeyWindow }
        let v = MPVolumeView(frame: CGRect(x: -3000, y: -3000, width: 20, height: 20)) // off screen: no volume bubble on screen
        v.alpha = 0.01
        w?.addSubview(v)
        vol = v
    }

    private func setVolume(_ x: Float) {
        guard let s = vol?.subviews.compactMap({ $0 as? UISlider }).first else { return }
        s.setValue(x, animated: false)
        s.sendActions(for: .valueChanged)
    }

    func stop() {
        ramp?.invalidate(); ramp = nil
        let had = player != nil
        player?.stop(); player = nil
        if had, let v = saved { setVolume(v) } // the volume the iPhone had before
        saved = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// ひび手帳のアラーム音（アプリに入っている sounds/*.wav）を、iPhone が鳴らせる場所（Library/Sounds）へ置く
enum HibiSounds {
    static let names = ["bell", "chime", "marimba", "harp", "musicbox", "piano", "kalimba", "sunrise", "birds", "waves", "digital", "clock"]
    static func file(_ name: String) -> String? { names.contains(name) ? "hibi-\(name).wav" : nil }
    static func install() {
        let fm = FileManager.default
        guard let lib = fm.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        let dir = lib.appendingPathComponent("Sounds", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        for n in names {
            let to = dir.appendingPathComponent("hibi-\(n).wav")
            guard let from = Bundle.main.url(forResource: n, withExtension: "wav", subdirectory: "public/sounds") else { continue }
            let a = (try? fm.attributesOfItem(atPath: from.path)[.size] as? Int) ?? -1
            let b = (try? fm.attributesOfItem(atPath: to.path)[.size] as? Int) ?? -2
            if a != b { try? fm.removeItem(at: to); try? fm.copyItem(at: from, to: to) }
        }
    }
}

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
