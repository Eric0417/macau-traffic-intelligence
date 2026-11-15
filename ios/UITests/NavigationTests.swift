import XCTest

final class NavigationTests: XCTestCase {
    func testTabsAndSettings() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
        XCTAssertTrue(app.buttons["explore-search"].waitForExistence(timeout: 10))
        app.tabBars.buttons["收藏"].tap()
        app.buttons["設定"].tap()
        XCTAssertTrue(app.navigationBars["設定"].waitForExistence(timeout: 5))
    }
}
