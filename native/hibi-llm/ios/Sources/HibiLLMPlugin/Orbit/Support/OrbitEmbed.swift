import Foundation

/// Orbit を単独のアプリとして動かしているか、ほかのアプリ（ひび手帳）の中に入れて動かしているか。
/// 中に入れたときは、設定の保存先を分け（相手のアプリの設定とまざらないように）、
/// 右端からのスワイプを相手のアプリへ戻る動きに使う（AI はカプセルの丸いボタンから）。
enum OrbitEmbed {
    /// ほかのアプリの中で動いている（AppModel を作る前に決める）
    static var embedded = false

    /// 中に入れたときの設定の保存先の名前（ひび手帳のバックアップにも使う）
    static let suiteName = "dev.orbit.embedded"
    private static let suite = UserDefaults(suiteName: suiteName) ?? .standard

    /// 設定の保存先
    static var defaults: UserDefaults { embedded ? suite : .standard }
}
