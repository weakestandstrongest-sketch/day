import SwiftUI
import WebKit

/// Hosts an existing WKWebView (owned by a BrowserTab) inside SwiftUI.
struct WebViewContainer: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = .systemBackground
        attach(to: container)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        if webView.superview !== uiView {
            uiView.subviews.forEach { $0.removeFromSuperview() }
            attach(to: uiView)
        }
    }

    private func attach(to container: UIView) {
        webView.frame = container.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(webView)
    }
}
