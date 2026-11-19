import Foundation
import CoreNFC

/// 交通系 IC カード（Suica・manaca・ICOCA・PASMO など）を iPhone の NFC で読む。
/// 残高と、カードに残っている利用履歴（最大 20 件）を返す。カードに書き込むことはしない（読むだけ）。
/// - 履歴はサービスコード 0x090F（暗号なしで読める）。1 件 16 バイト：
///   0 端末の種類 / 1 処理の種類 / 4-5 日付 / 6-7 入った線区・駅 / 8-9 出た線区・駅 / 10-11 残高（リトルエンディアン）
final class HibiFelica: NSObject, NFCTagReaderSessionDelegate {
    static let shared = HibiFelica()
    private var session: NFCTagReaderSession?
    private var done: ((Result<[String: Any], Error>) -> Void)?
    private var finished = false

    struct Fail: LocalizedError { let msg: String; var errorDescription: String? { msg } }

    static var available: Bool { NFCTagReaderSession.readingAvailable }

    /// アプリを署名したときのプロファイルに、NFC で読む許可（entitlement）が入っているか。
    /// 無料の Apple ID で入れたとき（AltStore など）は、この許可が外されて NFC が使えないことが多い
    static var hasNFCEntitlement: Bool? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url) else { return nil }
        let text = String(decoding: data, as: UTF8.self)
        return text.contains("com.apple.developer.nfc.readersession.formats")
    }

    func read(done: @escaping (Result<[String: Any], Error>) -> Void) {
        guard Self.available else {
            // 許可がないのか、iPhone 自体が NFC を使えないのかを分けて知らせる
            return done(.failure(Fail(msg: Self.hasNFCEntitlement == false ? "noEntitlement" : "unavailable")))
        }
        guard let s = NFCTagReaderSession(pollingOption: [.iso18092], delegate: self, queue: .main) else {
            return done(.failure(Fail(msg: "unavailable")))
        }
        self.done = done; finished = false; session = s
        s.alertMessage = "iPhone の上のほうを、カードにかざしてください"
        s.begin()
    }

    private func finish(_ r: Result<[String: Any], Error>) {
        guard !finished else { return }
        finished = true
        let d = done; done = nil
        d?(r)
    }

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        let code = (error as? NFCReaderError)?.code
        if code == .readerSessionInvalidationErrorUserCanceled || code == .readerSessionInvalidationErrorSessionTimeout {
            finish(.failure(Fail(msg: "cancel")))
        } else if code == .readerErrorSecurityViolation || code == .readerErrorUnsupportedFeature {
            finish(.failure(Fail(msg: "noEntitlement")))
        } else {
            finish(.failure(error))
        }
        self.session = nil
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard let first = tags.first, case .feliCa(let card) = first else {
            session.invalidate(errorMessage: "交通系 IC カードではないようです"); return
        }
        session.connect(to: first) { [weak self] err in
            guard let self else { return }
            if err != nil { session.invalidate(errorMessage: "うまく読めませんでした。もう一度かざしてください"); return }
            let idm = card.currentIDm.map { String(format: "%02X", $0) }.joined()
            self.readHistory(card, index: 0, acc: []) { blocks in
                guard let blocks, !blocks.isEmpty else {
                    session.invalidate(errorMessage: "履歴を読めませんでした。交通系 IC カードか確かめてください"); return
                }
                let hist: [[String: Any]] = blocks.compactMap { b in
                    guard b.count >= 16, b.contains(where: { $0 != 0 }) else { return nil }
                    let date = Int(b[4]) << 8 | Int(b[5])
                    return ["term": Int(b[0]), "proc": Int(b[1]),
                            "y": 2000 + (date >> 9) & 0x7f, "m": (date >> 5) & 0x0f, "d": date & 0x1f,
                            "inL": Int(b[6]), "inS": Int(b[7]), "outL": Int(b[8]), "outS": Int(b[9]),
                            "bal": Int(b[10]) | Int(b[11]) << 8,
                            "raw": b.map { String(format: "%02X", $0) }.joined()]
                }
                guard let top = hist.first else {
                    session.invalidate(errorMessage: "履歴がありませんでした"); return
                }
                session.alertMessage = "読みとりました"
                session.invalidate()
                self.finish(.success(["idm": idm, "balance": top["bal"] ?? 0, "hist": hist]))
            }
        }
    }

    /// 履歴を 1 件ずつ読む（端末によって 1 回に読める件数が違うので、確実なほうで）。読めなくなったところで止める
    private func readHistory(_ card: NFCFeliCaTag, index: Int, acc: [Data], done: @escaping ([Data]?) -> Void) {
        if index >= 20 { return done(acc) }
        card.readWithoutEncryption(serviceCodeList: [Data([0x0F, 0x09])], blockList: [Data([0x80, UInt8(index)])]) { [weak self] s1, _, data, err in
            guard let self else { return done(acc) }
            if err != nil || s1 != 0 || data.isEmpty { return done(index == 0 && err != nil ? nil : acc) }
            self.readHistory(card, index: index + 1, acc: acc + data, done: done)
        }
    }
}
