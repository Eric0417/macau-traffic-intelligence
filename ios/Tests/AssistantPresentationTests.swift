import XCTest
@testable import MacauTraffic

final class AssistantPresentationTests: XCTestCase {
    func testMarkdownBecomesHierarchyWithoutLiteralStars() {
        let blocks = AssistantReplyBlock.parse("✨ **建議路線**\n\n- 搭 **56** 號到碼頭。\n- 步行 5 分鐘。\n\n## 注意\n資料已延遲，請確認班次。")
        XCTAssertEqual(blocks.map(\.kind), [.heading, .bullet, .bullet, .heading, .paragraph])
        XCTAssertEqual(String(blocks[0].formatted.characters), "建議路線")
        XCTAssertEqual(String(blocks[1].formatted.characters), "搭 56 號到碼頭。")
        XCTAssertEqual(String(blocks.last!.formatted.characters), "資料已延遲，請確認班次。")
    }
    func testLongParagraphIsSplitWithoutDroppingCautionsOrNumbers() {
        let sentences = (1...10).map { "第\($0)段路線需要轉乘巴士，實際到站時間仍未核實。" }
        let source = sentences.joined()
        let blocks = AssistantReplyBlock.parse(source)
        XCTAssertGreaterThan(blocks.count, 1)
        XCTAssertEqual(blocks.map(\.text).joined(), source)
    }
    func testNumberedInstructionsKeepTheirOrderAndInlineMarkdown() {
        let blocks = AssistantReplyBlock.parse("1. Go to **Stop A**.\n2. Board route 56.\n\nDo not board at the suspended stop.")
        XCTAssertEqual(blocks.map(\.marker), ["1", "2", nil])
        XCTAssertEqual(String(blocks[0].formatted.characters), "Go to Stop A.")
        XCTAssertEqual(blocks.last?.kind, .paragraph)
    }
    func testDecimalDistancesRemainProse() {
        for line in ["3.5 km to the destination.", "0.8 公里後轉乘。", "2026.11.16 的安排仍未核實。"] {
            let blocks = AssistantReplyBlock.parse(line)
            XCTAssertEqual(blocks.count, 1)
            XCTAssertEqual(blocks[0].kind, .paragraph)
            XCTAssertEqual(blocks[0].text, line)
        }
    }

}
