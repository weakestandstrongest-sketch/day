import Foundation

/// 端末の中で動かすモデル（ひび手帳の まいにち と同じ顔ぶれ）。
struct LocalModel: Identifiable, Hashable {
    enum Kind: Hashable { case gguf, apple }
    enum Output: Hashable {
        /// <think>…</think> が出ることがある
        case think
        /// チャンネル形式（LLM-jp-4.1）。final だけが答え
        case harmony
    }

    let id: String
    let name: String
    let provider: String
    let summary: String
    let kind: Kind
    var file: String = ""
    var url: String = ""
    var bytes: Int64 = 0
    var template: ChatTemplate.Kind = .qwen35
    var output: Output = .think
    /// エージェント（JSON での操作）に向いているか
    var goodForAgent = false
    var recommended = false

    var sizeLabel: String {
        kind == .apple ? "ダウンロードなし" : ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }

    static let catalog: [LocalModel] = [
        LocalModel(id: "apple-intelligence", name: "Apple Intelligence", provider: "Apple",
                   summary: "iPhone に入っている Apple のモデル（約3B）。iOS 26・Apple Intelligence 対応の iPhone で使える。",
                   kind: .apple, goodForAgent: true),
        LocalModel(id: "qwen3.5-4B", name: "Qwen3.5 4B", provider: "Qwen",
                   summary: "考える力が強く、ページ操作（エージェント）にも向く。おすすめ。",
                   kind: .gguf, file: "Qwen3.5-4B-Q4_K_M.gguf",
                   url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
                   bytes: 2_740_000_000, template: .qwen35, output: .think, goodForAgent: true, recommended: true),
        LocalModel(id: "gemma-4-E4B", name: "Gemma 4 E4B", provider: "Google",
                   summary: "Google のスマホ向けモデル。日本語も自然。",
                   kind: .gguf, file: "gemma-4-E4B-it-Q4_K_M.gguf",
                   url: "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf",
                   bytes: 4_980_000_000, template: .gemma4, output: .think, goodForAgent: true),
        LocalModel(id: "lfm3-vl-2B", name: "LFM3 VL 2B", provider: "Liquid AI",
                   summary: "小さくて速い。メモリの少ない iPhone 向け。",
                   kind: .gguf, file: "LFM3-VL-2B-Q4_K_M.gguf",
                   url: "https://huggingface.co/LiquidAI/LFM3-VL-2B-GGUF/resolve/main/LFM3-VL-2B-Q4_K_M.gguf",
                   bytes: 1_100_000_000, template: .lfm3, output: .think),
        LocalModel(id: "ternary-bonsai-2-9B", name: "Ternary Bonsai 2 9B", provider: "PrismML",
                   summary: "9B を約2.5GBまで小さくしたモデル（Qwen3.5 9B がもと）。",
                   kind: .gguf, file: "Ternary-Bonsai-2-9B-Q2_0.gguf",
                   url: "https://huggingface.co/prism-ml/Ternary-Bonsai-2-9B-gguf/resolve/main/Ternary-Bonsai-2-9B-Q2_0.gguf",
                   bytes: 2_560_000_000, template: .qwen35, output: .think, goodForAgent: true),
        LocalModel(id: "llm-jp-4.1-8B", name: "LLM-jp-4.1 8B", provider: "LLM-jp",
                   summary: "日本語を最優先に作られたモデル。重い（メモリ 8GB 以上の iPhone 向け）。",
                   kind: .gguf, file: "llm-jp-4.1-8b-thinking-Q4_K_M.gguf",
                   url: "https://huggingface.co/llm-jp/llm-jp-4.1-8b-thinking-gguf/resolve/main/llm-jp-4.1-8b-thinking-Q4_K_M.gguf",
                   bytes: 5_500_000_000, template: .llmjp41, output: .harmony),
    ]

    static func find(_ id: String) -> LocalModel? { catalog.first { $0.id == id } }
}
