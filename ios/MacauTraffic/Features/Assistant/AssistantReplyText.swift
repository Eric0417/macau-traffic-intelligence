import SwiftUI

struct AssistantReplyBlock {
    enum Kind { case heading, bullet, paragraph }
    var kind: Kind
    var text: String
    var marker: String?
    var formatted: AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }
    static func parse(_ source: String) -> [AssistantReplyBlock] {
        source.components(separatedBy: .newlines).flatMap { raw -> [AssistantReplyBlock] in
            var line = raw.trimmingCharacters(in: .whitespaces)
            line = line.replacingOccurrences(of: #"^[✨⭐🌟✦★\uFE0F\s]+"#, with: "", options: .regularExpression)
            guard !line.isEmpty else { return [] }
            if line.hasPrefix("#") {
                return [.init(kind: .heading, text: line.replacingOccurrences(of: #"^#{1,6}\s*"#, with: "", options: .regularExpression))]
            }
            if line.hasPrefix("**"), line.hasSuffix("**"), line.filter({ $0 == "*" }).count == 4 {
                return [.init(kind: .heading, text: line)]
            }
            if let range = line.range(of: #"^\d+(?:[.)]\s+|、\s*)"#, options: .regularExpression) {
                let marker = String(line[range]).filter(\.isNumber)
                return [.init(kind: .bullet, text: String(line[range.upperBound...]), marker: marker)]
            }
            if let range = line.range(of: #"^[-*•]\s+"#, options: .regularExpression) {
                return [.init(kind: .bullet, text: String(line[range.upperBound...]))]
            }
            guard line.count > 180 else { return [.init(kind: .paragraph, text: line)] }
            // Break long prose at sentence boundaries without dropping the original wording.
            let regex = try! NSRegularExpression(pattern: #"[。！？]|[.!?](?=\s|$)"#)
            let ranges = regex.matches(in: line, range: NSRange(line.startIndex..., in: line))
            var start = line.startIndex
            var pieces: [AssistantReplyBlock] = []
            for match in ranges {
                guard let range = Range(match.range, in: line), line.distance(from: start, to: range.upperBound) >= 100 else { continue }
                pieces.append(.init(kind: .paragraph, text: String(line[start..<range.upperBound])))
                start = range.upperBound
            }
            if start < line.endIndex { pieces.append(.init(kind: .paragraph, text: String(line[start...]))) }
            return pieces
        }
    }
}

struct AssistantReplyText: View {
    var text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(Array(AssistantReplyBlock.parse(text).enumerated()), id: \.offset) { index, block in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    if block.kind == .bullet {
                        Text(block.marker.map { $0 + "." } ?? "•").font(.subheadline.monospacedDigit())
                            .foregroundStyle(.secondary).frame(minWidth: 16, alignment: .trailing)
                    }
                    Text(block.formatted)
                        .font(block.kind == .heading ? .system(.headline, design: .rounded, weight: .semibold) : nil)
                        .lineSpacing(5).fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                }.padding(.leading, block.kind == .bullet ? 8 : 0)
                    .padding(.top, block.kind == .heading && index > 0 ? 7 : 0)
                    .accessibilityElement(children: .combine).accessibilityIdentifier("reply-block-\(index)")
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
