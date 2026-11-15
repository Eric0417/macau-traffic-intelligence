import XCTest

final class NavigationTests: XCTestCase {
    private func launch(_ scenario: String = "journey", extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--scenario=\(scenario)", "-language", "en", "-appearance", "light"] + extra
        app.launch()
        return app
    }
    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways
        add(attachment)
    }
    private func tab(_ app: XCUIApplication, _ title: String) -> XCUIElement {
        if app.tabBars.buttons[title].exists { return app.tabBars.buttons[title] }
        return app.buttons.matching(identifier: title).firstMatch
    }
    private func input(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }
    func testTabsAndSettings() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "-language", "zh-Hant", "-appearance", "light"]
        app.launch()
        XCTAssertTrue(app.buttons["explore-search"].waitForExistence(timeout: 10))
        tab(app, "收藏").tap()
        app.buttons["設定"].tap()
        XCTAssertTrue(app.navigationBars["設定"].waitForExistence(timeout: 5))
        capture("settings-zh", app: app)
    }
    func testBusSearchStopAndSave() throws {
        let app = launch()
        tab(app, "Buses").tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("56")
        let route = app.buttons["route-00056"]
        XCTAssertTrue(route.waitForExistence(timeout: 5)); capture("buses", app: app); route.tap()
        let stop = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "stop-")).firstMatch
        XCTAssertTrue(stop.waitForExistence(timeout: 8)); capture("bus-detail", app: app); stop.tap()
        let save = app.buttons.matching(identifier: "Save").allElementsBoundByIndex.first { $0.isHittable }
        XCTAssertNotNil(save); save?.tap(); capture("stop-sheet", app: app)
    }
    func testCityParkingAndRail() throws {
        let app = launch()
        tab(app, "City").tap()
        XCTAssertTrue(app.staticTexts["Macau weather"].waitForExistence(timeout: 5)); capture("city", app: app)
        app.staticTexts["Parking"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Parking"].waitForExistence(timeout: 5)); capture("parking", app: app)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.staticTexts["Light rail"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Stations"].waitForExistence(timeout: 8)); capture("lrt", app: app)
    }
    func testAssistantManualOriginAndJourney() throws {
        let app = launch()
        tab(app, "Assistant").tap()
        capture("assistant", app: app)
        let field = input(app, "assistant-input")
        field.tap(); field.typeText("How do I get to St Pauls?")
        app.buttons["assistant-send"].tap()
        let origin = app.textFields["Or enter an origin landmark"]
        XCTAssertTrue(origin.waitForExistence(timeout: 8)); origin.tap(); origin.typeText("Senado Square")
        app.buttons["Use this origin"].tap()
        let plan = app.staticTexts["步行前往大三巴"]
        XCTAssertTrue(plan.waitForExistence(timeout: 8)); capture("assistant-plan", app: app); plan.tap()
        XCTAssertTrue(app.navigationBars["Journey"].waitForExistence(timeout: 5)); capture("journey", app: app)
    }
    func testUnknownTripPlaceHasCorrection() throws {
        let app = launch("choice")
        tab(app, "Assistant").tap()
        let field = input(app, "assistant-input")
        field.tap(); field.typeText("Visit an unknown place")
        app.buttons["assistant-send"].tap()
        XCTAssertTrue(app.buttons["Search this name"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.textFields["Enter another place name"].exists)
        capture("trip-choice-recovery", app: app)
    }
    func testTripEditorPreservesEnglishSpaces() throws {
        let app = launch("trip")
        tab(app, "Assistant").tap()
        app.buttons["Assistant options"].tap()
        app.buttons["Plan a day trip"].tap()
        let origin = input(app, "trip-origin")
        XCTAssertTrue(origin.waitForExistence(timeout: 5)); origin.tap(); origin.typeText("Senado Square")
        XCTAssertEqual(origin.value as? String, "Senado Square")
        let destination = input(app, "trip-end")
        destination.tap(); destination.typeText("Barra Station")
        XCTAssertEqual(destination.value as? String, "Barra Station")
        capture("trip-editor", app: app)
    }
    func testDarkExplore() throws {
        let app = launch(extra: ["-appearance", "dark"])
        XCTAssertTrue(app.buttons["explore-search"].waitForExistence(timeout: 8))
        capture("explore-dark", app: app)
        tab(app, "Assistant").tap(); capture("assistant-dark", app: app)
    }
    func testLargeTextAssistantAndKeyboardRecovery() throws {
        let app = launch(extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        tab(app, "Assistant").tap()
        capture("assistant-large-text", app: app)
        let field = input(app, "assistant-input")
        field.tap(); field.typeText("Find a route")
        app.buttons["assistant-send"].tap()
        let origin = app.textFields["Or enter an origin landmark"]
        XCTAssertTrue(origin.waitForExistence(timeout: 8))
        origin.tap(); origin.typeText("Senado Square\n")
        XCTAssertTrue(app.staticTexts["步行前往大三巴"].waitForExistence(timeout: 8))
        capture("assistant-large-result", app: app)
    }
    func testVoiceRecordingReturnsEditableDraft() throws {
        let app = launch()
        tab(app, "Assistant").tap()
        app.buttons["DeepSeek voice input"].tap()
        let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        if permission.waitForExistence(timeout: 3) { permission.buttons["Allow"].tap() }
        let stop = app.buttons["Stop and transcribe"]
        XCTAssertTrue(stop.waitForExistence(timeout: 8))
        stop.tap()
        let field = input(app, "assistant-input")
        XCTAssertTrue(NSPredicate(format: "value == %@", "去大三巴點搭巴士？").evaluate(with: field) || XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "去大三巴點搭巴士？"), object: field)], timeout: 8) == .completed)
        XCTAssertTrue(app.buttons["assistant-send"].isEnabled)
        capture("voice-editable-draft", app: app)
    }
    func testCompactChineseScreens() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "-language", "zh-Hant", "-appearance", "light"]
        app.launch()
        XCTAssertTrue(app.buttons["explore-search"].waitForExistence(timeout: 8))
        capture("explore-zh", app: app)
        tab(app, "助手").tap()
        XCTAssertTrue(app.staticTexts["想去邊？"].waitForExistence(timeout: 5))
        capture("assistant-zh", app: app)
        tab(app, "城市").tap()
        capture("city-zh", app: app)
    }
}
