import SwiftUI

struct ChatItemView: View {
    let item: ChatItem

    var body: some View {
        switch item.kind {
        case .user:
            HStack {
                Spacer(minLength: 40)
                VStack(alignment: .trailing, spacing: 6) {
                    ForEach(item.attachments, id: \.self) { title in
                        Label(title, systemImage: "doc.text")
                            .font(.caption2)
                            .lineLimit(1)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.accent.opacity(0.12), in: Capsule())
                            .foregroundStyle(Theme.accent)
                    }
                    Text(item.text)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.primary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .foregroundStyle(Color(.systemBackground))
                        .textSelection(.enabled)
                }
            }

        case .assistant:
            VStack(alignment: .leading, spacing: 10) {
                MarkdownText(text: item.text)
                if !item.sources.isEmpty {
                    SourcesView(sources: item.sources)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

        case .action:
            HStack(spacing: 10) {
                statusIcon
                    .frame(width: 18)
                Image(systemName: item.icon ?? "cursorarrow.click")
                    .foregroundStyle(Theme.accent)
                Text(item.text)
                    .font(.subheadline)
                    .foregroundStyle(item.status == .denied ? Color.secondary : Color.primary)
                    .lineLimit(2)
                Spacer(minLength: 0)
            }
            .padding(10)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))

        case .notice:
            Text(item.text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)

        case .error:
            Label(item.text, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch item.status {
        case .running:
            ProgressView().controlSize(.small)
        case .done:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed:
            Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
        case .denied:
            Image(systemName: "hand.raised.fill").foregroundStyle(.orange)
        }
    }
}

struct SourcesView: View {
    let sources: [ChatSource]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("出典").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(sources.enumerated()), id: \.element) { index, source in
                        Link(destination: source.url) {
                            HStack(spacing: 6) {
                                Text("\(index + 1)")
                                    .font(.caption2.weight(.bold))
                                    .frame(width: 18, height: 18)
                                    .background(Theme.accent.opacity(0.15), in: Circle())
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(source.title).font(.caption).lineLimit(1)
                                    Text(URLParser.displayHost(source.url)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                                }
                                .frame(maxWidth: 160, alignment: .leading)
                            }
                            .padding(8)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

/// Lightweight Markdown renderer: headings, bullets, numbered lists, code blocks, tables and
/// inline styles (bold, italics, code, links) — enough for chat answers.
struct MarkdownText: View {
    let text: String

    private enum Block: Hashable {
        case heading(Int, String)
        case bullet(Int, String)
        case numbered(String, String)
        case paragraph(String)
        case code(String)
        case table([String])
        case quote(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func view(for block: Block) -> some View {
        switch block {
        case .heading(let level, let s):
            inline(s)
                .font(level <= 1 ? Font.title3.weight(.bold) : (level == 2 ? Font.headline : Font.subheadline.weight(.semibold)))
                .padding(.top, 4)
        case .bullet(let indent, let s):
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(indent > 0 ? "◦" : "•").foregroundStyle(Theme.accent)
                inline(s)
            }
            .padding(.leading, CGFloat(indent) * 14)
        case .numbered(let n, let s):
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(n).foregroundStyle(Theme.accent).monospacedDigit()
                inline(s)
            }
        case .paragraph(let s):
            inline(s)
        case .code(let s):
            ScrollView(.horizontal, showsIndicators: false) {
                Text(s)
                    .font(.system(.footnote, design: .monospaced))
                    .padding(10)
            }
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
        case .table(let rows):
            TableBlock(rows: rows)
        case .quote(let s):
            HStack(spacing: 8) {
                Rectangle().fill(Theme.accent.opacity(0.5)).frame(width: 3)
                inline(s).foregroundStyle(.secondary)
            }
        }
    }

    private func inline(_ s: String) -> Text {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        if let attributed = try? AttributedString(markdown: s, options: options) {
            return Text(attributed)
        }
        return Text(s)
    }

    private var blocks: [Block] {
        var result: [Block] = []
        var paragraph: [String] = []
        var code: [String]? = nil
        var table: [String] = []

        func flushParagraph() {
            if !paragraph.isEmpty {
                result.append(.paragraph(paragraph.joined(separator: "\n")))
                paragraph = []
            }
        }
        func flushTable() {
            if !table.isEmpty {
                result.append(.table(table))
                table = []
            }
        }

        for rawLine in text.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)

            if line.hasPrefix("```") {
                if let current = code {
                    result.append(.code(current.joined(separator: "\n")))
                    code = nil
                } else {
                    flushParagraph(); flushTable()
                    code = []
                }
                continue
            }
            if code != nil {
                code?.append(rawLine)
                continue
            }
            if line.hasPrefix("|") {
                flushParagraph()
                table.append(line)
                continue
            }
            flushTable()

            if line.isEmpty {
                flushParagraph()
            } else if let heading = line.range(of: #"^#{1,6}\s+"#, options: .regularExpression) {
                flushParagraph()
                let level = line[heading].filter { $0 == "#" }.count
                result.append(.heading(level, String(line[heading.upperBound...])))
            } else if let bullet = line.range(of: #"^([-*+・])\s+"#, options: .regularExpression) {
                flushParagraph()
                let indent = rawLine.prefix { $0 == " " }.count / 2
                result.append(.bullet(indent, String(line[bullet.upperBound...])))
            } else if let number = line.range(of: #"^\d+[.)]\s+"#, options: .regularExpression) {
                flushParagraph()
                let label = line[number].trimmingCharacters(in: .whitespaces)
                result.append(.numbered(label, String(line[number.upperBound...])))
            } else if line.hasPrefix(">") {
                flushParagraph()
                result.append(.quote(String(line.dropFirst()).trimmingCharacters(in: .whitespaces)))
            } else if line.range(of: #"^(-{3,}|\*{3,})$"#, options: .regularExpression) != nil {
                flushParagraph()
            } else {
                paragraph.append(line)
            }
        }
        if let current = code { result.append(.code(current.joined(separator: "\n"))) }
        flushParagraph()
        flushTable()
        return result
    }
}

private struct TableBlock: View {
    let rows: [String]

    private var cells: [[String]] {
        rows
            .filter { $0.range(of: #"^\|?[\s:\-|]+\|?$"#, options: .regularExpression) == nil }
            .map { row in
                var r = row.trimmingCharacters(in: .whitespaces)
                if r.hasPrefix("|") { r.removeFirst() }
                if r.hasSuffix("|") { r.removeLast() }
                return r.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
            }
    }

    var body: some View {
        let data = cells
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                ForEach(Array(data.enumerated()), id: \.offset) { rowIndex, row in
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                            cellText(cell, header: rowIndex == 0)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .frame(minWidth: 70, maxWidth: 220, alignment: .leading)
                                .background(rowIndex == 0 ? Theme.accent.opacity(0.12) : (rowIndex % 2 == 0 ? Color(.secondarySystemBackground) : Color.clear))
                        }
                    }
                }
            }
            .font(.footnote)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(.separator)))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func cellText(_ s: String, header: Bool) -> Text {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        let text = (try? AttributedString(markdown: s, options: options)).map { Text($0) } ?? Text(s)
        return header ? text.bold() : text
    }
}
