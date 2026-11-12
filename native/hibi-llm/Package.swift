// swift-tools-version: 5.9
// まいにち の AI を iPhone の中で動かすプラグイン。
// llama.xcframework は GitHub Actions が llama.cpp から作って ios/ に置く（リポジトリには入れない）。
import PackageDescription

let package = Package(
    name: "HibiLlm",
    platforms: [.iOS(.v17)], // Orbit（ブラウザ）が iOS 17 の @Observable を使う
    products: [
        .library(name: "HibiLlm", targets: ["HibiLLMPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .binaryTarget(name: "llama", path: "ios/llama.xcframework"),
        .target(
            name: "HibiLLMPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "llama"
            ],
            path: "ios/Sources/HibiLLMPlugin",
            linkerSettings: [
                // Apple Intelligence and alarms (iOS 26). Weak, so the app still opens on older iOS
                .unsafeFlags(["-Xlinker", "-weak_framework", "-Xlinker", "FoundationModels", "-Xlinker", "-weak_framework", "-Xlinker", "AlarmKit", "-Xlinker", "-weak_framework", "-Xlinker", "ActivityKit"])
            ])
    ]
)
