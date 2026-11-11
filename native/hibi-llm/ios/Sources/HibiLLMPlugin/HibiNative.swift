import UIKit
import PhotosUI
import UniformTypeIdentifiers

// iPhone 本物の部品：確認（アラート）・選ぶ（アクションシート）・長押しメニュー・共有シート・写真ピッカー。
// ひび手帳の画面（Web）から頼まれて出し、選ばれたものを返す。

enum HibiTop {
    /// the view controller on top (a sheet or alert may already be shown)
    static func vc(_ base: UIViewController?) -> UIViewController? {
        var v = base
        while let p = v?.presentedViewController, !p.isBeingDismissed { v = p }
        return v
    }
}

// MARK: - 長押しメニュー（UIContextMenuInteraction）
// ひび手帳は、指が予定や日記にふれた瞬間に、その場所とメニューの中身を知らせておく（arm）。
// iPhone が長押しを見つけたら、その場所なら本物のメニューを出す。少し浮き上がる絵は、その部分の画面の写し。
final class HibiCtx: NSObject, UIContextMenuInteractionDelegate {
    static let shared = HibiCtx()
    struct Armed { let rect: CGRect; let radius: CGFloat; let items: [[String: Any]]; let at: Date }
    var armed: Armed?
    var onPick: ((String) -> Void)?
    private weak var host: UIView?
    private var snap: UIView?
    private var interaction: UIContextMenuInteraction?

    func install(on v: UIView) {
        guard interaction == nil else { return }
        let i = UIContextMenuInteraction(delegate: self)
        v.addInteraction(i)
        interaction = i; host = v
    }

    private func current(_ p: CGPoint) -> Armed? {
        guard let a = armed, Date().timeIntervalSince(a.at) < 3, a.rect.insetBy(dx: -10, dy: -10).contains(p) else { return nil }
        return a
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        guard let a = current(location) else { return nil }
        let items = a.items
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
            UIMenu(children: items.map { o in
                let sym = (o["symbol"] as? String) ?? ""
                return UIAction(title: (o["title"] as? String) ?? "", image: sym.isEmpty ? nil : UIImage(systemName: sym),
                                attributes: ((o["destructive"] as? Bool) ?? false) ? .destructive : []) { _ in
                    self?.onPick?((o["id"] as? String) ?? "")
                }
            })
        }
    }

    private func preview() -> UITargetedPreview? {
        guard let a = armed, let v = host else { return nil }
        if snap == nil, let s = v.resizableSnapshotView(from: a.rect, afterScreenUpdates: false, withCapInsets: .zero) {
            s.frame = a.rect; v.addSubview(s); snap = s
        }
        guard let s = snap else { return nil }
        let p = UIPreviewParameters()
        p.visiblePath = UIBezierPath(roundedRect: s.bounds, cornerRadius: a.radius)
        return UITargetedPreview(view: s, parameters: p)
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? { preview() }
    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? { preview() }
    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
        let done = { [weak self] in self?.snap?.removeFromSuperview(); self?.snap = nil; self?.armed = nil }
        if let an = animator { an.addCompletion(done) } else { done() }
    }
}

// MARK: - 写真ピッカー（PHPicker：写真へのアクセスを許可しなくても選べる）
final class HibiPhotoPick: NSObject, PHPickerViewControllerDelegate {
    static var live: HibiPhotoPick?
    let done: ([String: Any]) -> Void
    init(done: @escaping ([String: Any]) -> Void) { self.done = done }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let r = results.first else { finish(["cancelled": true]); return }
        let pr = r.itemProvider
        pr.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] data, _ in
            // HEIC and others become JPEG (ひび手帳 makes it smaller itself)
            guard let d = data, let img = UIImage(data: d), let jpg = img.jpegData(compressionQuality: 0.9) else { self?.finish(["cancelled": true, "error": "read"]); return }
            self?.finish(["data": jpg.base64EncodedString(), "mime": "image/jpeg", "name": (pr.suggestedName ?? "photo") + ".jpg"])
        }
    }
    private func finish(_ o: [String: Any]) { DispatchQueue.main.async { self.done(o); HibiPhotoPick.live = nil } }
}
