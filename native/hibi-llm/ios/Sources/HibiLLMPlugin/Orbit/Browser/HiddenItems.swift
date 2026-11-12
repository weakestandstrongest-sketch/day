import Foundation
import Observation

/// Safari の「気を逸らす項目を非表示」と同じ：ページでタップした項目を、そのサイトでずっと隠す。
@MainActor
@Observable
final class HiddenItemsStore {
    private static let key = "hiddenItems.v1"
    /// サイト（ホスト）ごとの、隠す CSS セレクタ
    private(set) var items: [String: [String]] = [:]

    init() {
        if let data = OrbitEmbed.defaults.data(forKey: Self.key),
           let saved = try? JSONDecoder().decode([String: [String]].self, from: data) {
            items = saved
        }
    }

    func selectors(for host: String) -> [String] { items[host] ?? [] }

    func add(_ selector: String, host: String) {
        guard !host.isEmpty, !(items[host] ?? []).contains(selector) else { return }
        items[host, default: []].append(selector)
        save()
    }

    @discardableResult
    func removeLast(host: String) -> Bool {
        guard var list = items[host], !list.isEmpty else { return false }
        list.removeLast()
        items[host] = list.isEmpty ? nil : list
        save()
        return true
    }

    func reset(host: String) {
        items[host] = nil
        save()
    }

    func css(for host: String) -> String {
        selectors(for: host).map { "\($0){display:none!important}" }.joined(separator: "\n")
    }

    private func save() {
        if let data = try? JSONEncoder().encode(items) {
            OrbitEmbed.defaults.set(data, forKey: Self.key)
        }
    }
}
