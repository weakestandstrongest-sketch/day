import Foundation
import SwiftUI
import Observation

struct HistoryEntry: Codable, Hashable, Identifiable {
    var url: String
    var title: String
    var visits: Int
    var lastVisit: Date
    var id: String { url }
    var host: String { URLParser.displayHost(URL(string: url)) }
}

struct SpeedDialItem: Codable, Hashable, Identifiable {
    var id = UUID()
    var title: String
    var url: String
}

/// 閲覧履歴（アドレスバーの候補と、スタートページの「よく見るサイト」用）と、Opera 風のスピードダイヤル。
@MainActor
@Observable
final class HistoryStore {
    var entries: [HistoryEntry] = []
    var speedDial: [SpeedDialItem] { didSet { saveSpeedDial() } }

    @ObservationIgnored private var saveTask: Task<Void, Never>?

    init() {
        if let data = OrbitEmbed.defaults.data(forKey: "speedDial.v1"),
           let items = try? JSONDecoder().decode([SpeedDialItem].self, from: data) {
            speedDial = items
        } else {
            speedDial = []
        }
        if let data = try? Data(contentsOf: Self.fileURL),
           let list = try? JSONDecoder().decode([HistoryEntry].self, from: data) {
            entries = list
        }
    }

    private static var fileURL: URL {
        let base = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("history.json")
    }

    func record(url: URL, title: String) {
        guard let scheme = url.scheme, scheme.hasPrefix("http") else { return }
        let key = url.absoluteString
        if let index = entries.firstIndex(where: { $0.url == key }) {
            var entry = entries.remove(at: index)
            entry.visits += 1
            entry.lastVisit = Date()
            if !title.isEmpty { entry.title = title }
            entries.insert(entry, at: 0)
        } else {
            entries.insert(HistoryEntry(url: key, title: title, visits: 1, lastVisit: Date()), at: 0)
        }
        if entries.count > 2000 { entries.removeLast(entries.count - 2000) }
        scheduleSave()
    }

    /// サイト（ホスト）ごとにまとめた、よく見るサイト
    func topSites(_ limit: Int = 8) -> [HistoryEntry] {
        var byHost: [String: HistoryEntry] = [:]
        for entry in entries {
            let host = entry.host
            guard !host.isEmpty else { continue }
            if var existing = byHost[host] {
                existing.visits += entry.visits
                byHost[host] = existing
            } else if let url = URL(string: entry.url), let scheme = url.scheme, let host = url.host {
                byHost[URLParser.displayHost(url)] = HistoryEntry(url: "\(scheme)://\(host)/", title: entry.title, visits: entry.visits, lastVisit: entry.lastVisit)
            }
        }
        let dialHosts = Set(speedDial.map { URLParser.displayHost(URL(string: $0.url)) })
        return byHost.values
            .filter { !dialHosts.contains($0.host) }
            .sorted { $0.visits == $1.visits ? $0.lastVisit > $1.lastVisit : $0.visits > $1.visits }
            .prefix(limit)
            .map { $0 }
    }

    func search(_ query: String, limit: Int = 6) -> [HistoryEntry] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return [] }
        return entries
            .filter { $0.url.localizedCaseInsensitiveContains(q) || $0.title.localizedCaseInsensitiveContains(q) }
            .sorted { $0.visits > $1.visits }
            .prefix(limit)
            .map { $0 }
    }

    func clear() {
        entries = []
        scheduleSave()
    }

    func isFavorite(_ url: URL?) -> Bool {
        guard let url else { return false }
        return speedDial.contains { $0.url == url.absoluteString }
    }

    /// お気に入りに入っていれば外し、なければ足す。足したら true。
    @discardableResult
    func toggleFavorite(title: String, url: URL) -> Bool {
        if isFavorite(url) {
            speedDial.removeAll { $0.url == url.absoluteString }
            return false
        }
        addToSpeedDial(title: title, url: url)
        return true
    }

    func moveFavorites(from source: IndexSet, to destination: Int) {
        speedDial.move(fromOffsets: source, toOffset: destination)
    }

    func addToSpeedDial(title: String, url: URL) {
        guard !speedDial.contains(where: { $0.url == url.absoluteString }) else { return }
        speedDial.append(SpeedDialItem(title: title, url: url.absoluteString))
    }

    func removeFromSpeedDial(_ item: SpeedDialItem) {
        speedDial.removeAll { $0.id == item.id }
    }

    func renameSpeedDial(_ item: SpeedDialItem, to title: String) {
        guard let i = speedDial.firstIndex(where: { $0.id == item.id }) else { return }
        speedDial[i].title = title
    }

    /// 読み込んだブックマークをお気に入りに足す（同じ URL は足さない）。足した数を返す。
    @discardableResult
    func importFavorites(_ items: [SpeedDialItem]) -> Int {
        var known = Set(speedDial.map(\.url))
        var added: [SpeedDialItem] = []
        for item in items where !known.contains(item.url) {
            known.insert(item.url)
            added.append(SpeedDialItem(title: item.title, url: item.url))
        }
        speedDial.append(contentsOf: added)
        return added.count
    }

    private func saveSpeedDial() {
        if let data = try? JSONEncoder().encode(speedDial) {
            OrbitEmbed.defaults.set(data, forKey: "speedDial.v1")
        }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        let snapshot = entries
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            if let data = try? JSONEncoder().encode(snapshot) {
                try? data.write(to: Self.fileURL, options: .atomic)
            }
        }
    }
}
