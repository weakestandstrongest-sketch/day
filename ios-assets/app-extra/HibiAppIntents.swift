import Foundation
import AppIntents
import UIKit
import BackgroundTasks
import WebKit
import Capacitor

// アプリ本体に入る Swift（GitHub Actions がアプリのターゲットに足す）：ショートカット・Siri と、バックグラウンドの更新。

// MARK: - ショートカット・Siri（App Intents）

/// ひび手帳を開いて、決まった画面にする（ひび手帳は開いたときに hibi.intent を読む）
enum HibiIntentBox {
    static func put(_ s: String) { UserDefaults.standard.set(s, forKey: "hibi.intent"); UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "hibi.intent.at") }
}

@available(iOS 16.0, *)
struct HibiWriteDiaryIntent: AppIntent {
    static var title: LocalizedStringResource = "日記を書く"
    static var description = IntentDescription("ひび手帳を開いて、今日の日記を書きはじめます")
    static var openAppWhenRun: Bool = true
    @MainActor func perform() async throws -> some IntentResult { HibiIntentBox.put("newEntry"); return .result() }
}

@available(iOS 16.0, *)
struct HibiAddPlanIntent: AppIntent {
    static var title: LocalizedStringResource = "予定を追加"
    static var description = IntentDescription("ひび手帳を開いて、新しい予定を書きはじめます")
    static var openAppWhenRun: Bool = true
    @MainActor func perform() async throws -> some IntentResult { HibiIntentBox.put("newEvent"); return .result() }
}

@available(iOS 16.0, *)
struct HibiOpenAlarmsIntent: AppIntent {
    static var title: LocalizedStringResource = "アラームを開く"
    static var description = IntentDescription("ひび手帳のアラームを開きます")
    static var openAppWhenRun: Bool = true
    @MainActor func perform() async throws -> some IntentResult { HibiIntentBox.put("alarms"); return .result() }
}

@available(iOS 16.0, *)
struct HibiTimerIntent: AppIntent {
    static var title: LocalizedStringResource = "集中タイマーを始める"
    static var description = IntentDescription("ひび手帳の集中タイマーを開きます")
    static var openAppWhenRun: Bool = true
    @MainActor func perform() async throws -> some IntentResult { HibiIntentBox.put("timer"); return .result() }
}

/// 今日の予定を読み上げる（アプリを開かない）。ひび手帳が最後に書いた「今日」の文を使う
@available(iOS 16.0, *)
struct HibiTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "今日の予定"
    static var description = IntentDescription("ひび手帳の今日のこれからの予定を教えます")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let d = UserDefaults.standard
        let text = d.string(forKey: "hibi.todayText") ?? "ひび手帳を一度開くと、予定を読み上げられるようになります。"
        let day = d.string(forKey: "hibi.todayDate") ?? ""
        let today: String = { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date()) }()
        return .result(dialog: IntentDialog(stringLiteral: day == today ? text : "ひび手帳を開くと、今日の予定を読み上げられます。"))
    }
}

/// 次の予定（アプリを開かない）
@available(iOS 16.0, *)
struct HibiNextIntent: AppIntent {
    static var title: LocalizedStringResource = "次の予定"
    static var description = IntentDescription("ひび手帳の次の予定を教えます")
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let next = (UserDefaults.standard.array(forKey: "hibi.next") as? [[String: Any]]) ?? []
        let now = Date().timeIntervalSince1970 * 1000
        if let n = next.first(where: { (($0["at"] as? Double) ?? 0) > now }), let say = n["say"] as? String { return .result(dialog: IntentDialog(stringLiteral: say)) }
        return .result(dialog: "このあとの予定はありません。")
    }
}

@available(iOS 16.0, *)
struct HibiShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: HibiTodayIntent(), phrases: ["\(.applicationName)で今日の予定", "\(.applicationName)の今日の予定を教えて"], shortTitle: "今日の予定", systemImageName: "calendar")
        AppShortcut(intent: HibiNextIntent(), phrases: ["\(.applicationName)で次の予定", "\(.applicationName)の次の予定は"], shortTitle: "次の予定", systemImageName: "clock")
        AppShortcut(intent: HibiWriteDiaryIntent(), phrases: ["\(.applicationName)で日記を書く", "\(.applicationName)に日記"], shortTitle: "日記を書く", systemImageName: "square.and.pencil")
        AppShortcut(intent: HibiAddPlanIntent(), phrases: ["\(.applicationName)で予定を追加"], shortTitle: "予定を追加", systemImageName: "plus")
        AppShortcut(intent: HibiTimerIntent(), phrases: ["\(.applicationName)で集中タイマー"], shortTitle: "集中タイマー", systemImageName: "timer")
        AppShortcut(intent: HibiOpenAlarmsIntent(), phrases: ["\(.applicationName)のアラーム"], shortTitle: "アラーム", systemImageName: "alarm")
    }
}

// MARK: - バックグラウンドの更新

/// iPhone がときどき（数時間おき、使い方に合わせて）ひび手帳を短く起こす。そのあいだに、ひび手帳の画面の
/// window.hibiBackground()（通知・アラームの予約し直し、歩数、場所、ウィジェット）を動かす。
enum HibiBackground {
    static let id = "jp.weakestandstrongest.hibi.refresh"

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: id, using: nil) { task in
            guard let t = task as? BGAppRefreshTask else { task.setTaskCompleted(success: false); return }
            handle(t)
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in schedule() }
    }

    static func schedule() {
        let r = BGAppRefreshTaskRequest(identifier: id)
        r.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 3600)
        try? BGTaskScheduler.shared.submit(r)
    }

    static func handle(_ task: BGAppRefreshTask) {
        schedule()
        var finished = false
        let finish: (Bool) -> Void = { ok in if !finished { finished = true; task.setTaskCompleted(success: ok) } }
        task.expirationHandler = { finish(false) }
        DispatchQueue.main.async {
            guard let web = findWebView() else { return finish(false) }
            if #available(iOS 14.0, *) {
                web.callAsyncJavaScript("return await (window.hibiBackground ? window.hibiBackground() : 'none')", arguments: [:], in: nil, in: .page) { _ in finish(true) }
            } else { finish(false) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 25) { finish(true) }
        }
    }

    static func findWebView() -> WKWebView? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for s in scenes { for w in s.windows { if let b = w.rootViewController as? CAPBridgeViewController, let v = b.bridge?.webView { return v } } }
        return nil
    }
}
