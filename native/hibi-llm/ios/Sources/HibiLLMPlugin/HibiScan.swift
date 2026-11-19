import UIKit
import VisionKit
import Vision

/// iPhone 本物のスキャナー2つ。
/// - 書類：VisionKit の書類スキャナー（四すみを自動で見つけ、まっすぐにして、何枚でも続けて撮れる。vFlat のように）
/// - バーコード：VisionKit のライブ読み取り（ポイントカードの JAN・Code128・NW-7・QR など。財布に入れるため）
@MainActor
final class HibiScan: NSObject, VNDocumentCameraViewControllerDelegate, DataScannerViewControllerDelegate {
    static let shared = HibiScan()
    private var docDone: (([String]?) -> Void)?
    private var codeDone: (((String, String)?) -> Void)?

    // MARK: 書類

    static var docSupported: Bool { VNDocumentCameraViewController.isSupported }

    func scanDocument(from vc: UIViewController, done: @escaping ([String]?) -> Void) {
        guard Self.docSupported else { return done(nil) }
        docDone = done
        let scanner = VNDocumentCameraViewController()
        scanner.delegate = self
        scanner.modalPresentationStyle = .fullScreen
        vc.present(scanner, animated: true)
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        // 長い辺 2400px の JPEG にして渡す（大きすぎるとページに渡すのが重い）
        var pages: [String] = []
        for i in 0..<scan.pageCount {
            let img = scan.imageOfPage(at: i)
            let k = min(1, 2400 / max(img.size.width, img.size.height))
            let size = CGSize(width: (img.size.width * k).rounded(), height: (img.size.height * k).rounded())
            let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 1
            let out = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
            if let d = out.jpegData(compressionQuality: 0.88) { pages.append(d.base64EncodedString()) }
        }
        controller.dismiss(animated: true)
        docDone?(pages); docDone = nil
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true); docDone?([]); docDone = nil
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true); docDone?(nil); docDone = nil
    }

    // MARK: 写真・スクショからバーコードを読む（Vision）

    /// 画像の中のバーコード・QR を見つけて {値, 種類} を返す（なければ nil）。重いので裏で
    nonisolated static func readCode(in data: Data, done: @escaping @Sendable ((String, String)?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard let img = UIImage(data: data), let cg = img.cgImage else { return done(nil) }
            let req = VNDetectBarcodesRequest()
            let handler = VNImageRequestHandler(cgImage: cg, orientation: Self.orientation(img.imageOrientation), options: [:])
            try? handler.perform([req])
            // いちばん大きく写っているものを選ぶ
            let found = (req.results ?? []).filter { ($0.payloadStringValue ?? "").isEmpty == false }
                .max { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }
            if let f = found, let v = f.payloadStringValue { done((v, Self.format(f.symbology))) } else { done(nil) }
        }
    }

    nonisolated private static func orientation(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch o {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }

    // MARK: バーコード

    static var codeSupported: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    func scanCode(from vc: UIViewController, done: @escaping ((String, String)?) -> Void) {
        guard Self.codeSupported else { return done(nil) }
        codeDone = done
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode()], qualityLevel: .accurate,
                                                recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false,
                                                isHighlightingEnabled: true)
        scanner.delegate = self
        let nav = UINavigationController(rootViewController: scanner)
        scanner.navigationItem.title = "バーコードを読む"
        scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel, primaryAction: UIAction { [weak self, weak nav] _ in
            nav?.dismiss(animated: true); self?.codeDone?(nil); self?.codeDone = nil
        })
        nav.modalPresentationStyle = .fullScreen
        vc.present(nav, animated: true) { try? scanner.startScanning() }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            guard case .barcode(let b) = item, let value = b.payloadStringValue, !value.isEmpty else { continue }
            dataScanner.stopScanning()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            dataScanner.navigationController?.dismiss(animated: true)
            codeDone?((value, Self.format(b.observation.symbology))); codeDone = nil
            return
        }
    }

    /// ページのバーコードの種類の名前へ
    nonisolated static func format(_ s: VNBarcodeSymbology) -> String {
        switch s {
        case .qr, .microQR: return "qr"
        case .ean13: return "ean13"
        case .ean8: return "ean8"
        case .upce: return "upce"
        case .code128: return "code128"
        case .code39, .code39Checksum, .code39FullASCII, .code39FullASCIIChecksum: return "code39"
        case .codabar: return "codabar"
        case .itf14, .i2of5, .i2of5Checksum: return "itf"
        case .pdf417, .microPDF417: return "pdf417"
        case .aztec: return "aztec"
        case .dataMatrix: return "datamatrix"
        default: return "code128"
        }
    }
}
