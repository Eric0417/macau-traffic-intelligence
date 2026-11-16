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
    func testTrafficInteractionPerformance() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["Traffic"].waitForExistence(timeout: 10))
        let options = XCTMeasureOptions()
        options.iterationCount = 3
        measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app)], options: options) {
            app.buttons["Traffic"].tap()
            let map = app.maps.firstMatch
            map.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.5)).press(forDuration: 0.05, thenDragTo: map.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.45)))
            app.buttons["Change map perspective"].tap()
            app.buttons["Change map perspective"].tap()
            app.buttons["Traffic"].tap()
        }
        capture("traffic-interaction", app: app)
    }
    func testAssistantLocationButtonLightAndDark() throws {
        let authorization = XCUIApplication()
        authorization.resetAuthorizationStatus(for: .location)
        defer { authorization.resetAuthorizationStatus(for: .location) }
        for appearance in ["light", "dark"] {
            let app = launch(extra: ["-appearance", appearance])
            tab(app, "Assistant").tap()
            let field = input(app, "assistant-input")
            field.tap(); field.typeText("Take me to Senado Square")
            app.buttons["assistant-send"].tap()
            let location = app.buttons["assistant-origin-location"]
            XCTAssertTrue(location.waitForExistence(timeout: 8))
            XCTAssertEqual(location.label, "Share current location")
            XCTAssertTrue(location.isEnabled)
            capture("assistant-location-" + appearance, app: app)
            location.tap()
            let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
            if permission.waitForExistence(timeout: 1) { permission.buttons["Allow While Using App"].tap() }
            XCTAssertTrue(app.staticTexts["步行前往大三巴"].waitForExistence(timeout: 8))
            app.terminate()
        }
    }
    func testAssistantDeniedLocationKeepsManualOrigin() throws {
        let authorization = XCUIApplication()
        authorization.resetAuthorizationStatus(for: .location)
        defer { authorization.resetAuthorizationStatus(for: .location) }
        let app = launch(extra: ["-appearance", "dark"])
        tab(app, "Assistant").tap()
        let field = input(app, "assistant-input")
        field.tap(); field.typeText("Take me to Senado Square")
        app.buttons["assistant-send"].tap()
        let location = app.buttons["assistant-origin-location"]
        XCTAssertTrue(location.waitForExistence(timeout: 8)); location.tap()
        let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        XCTAssertTrue(permission.waitForExistence(timeout: 5))
        permission.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Don")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Location access is off. You can enter a landmark instead."].waitForExistence(timeout: 5))
        capture("assistant-location-denied", app: app)
        let origin = app.textFields["Or enter an origin landmark"]
        origin.tap(); origin.typeText("Senado Square")
        app.buttons["Use this origin"].tap()
        XCTAssertTrue(app.staticTexts["步行前往大三巴"].waitForExistence(timeout: 8))
    }
    func testAssistantWaitsWithDotAndKeepsKeyboardClosedOnEntry() throws {
        let app = launch("waiting")
        XCTAssertTrue(app.buttons["explore-search"].waitForExistence(timeout: 8))
        app.buttons["explore-search"].tap()
        XCTAssertTrue(input(app, "assistant-input").waitForExistence(timeout: 5))
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        let field = input(app, "assistant-input")
        field.tap(); field.typeText("Take me to Senado Square")
        app.buttons["assistant-send"].tap()
        XCTAssertTrue(input(app, "assistant-waiting-dot").waitForExistence(timeout: 5))
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        XCTAssertEqual(app.buttons["assistant-send"].label, "Stop request")
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "seconds")).firstMatch.exists)
        capture("assistant-waiting-dot", app: app)
        app.buttons["assistant-send"].tap()
        XCTAssertTrue(input(app, "assistant-waiting-dot").waitForNonExistence(timeout: 5))
        tab(app, "Explore").tap(); tab(app, "Assistant").tap()
        XCTAssertFalse(app.keyboards.firstMatch.exists)
    }
    func testBusPositionsAppearInArrivalListAndMap() throws {
        let app = launch("bus")
        tab(app, "Buses").tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("56")
        app.buttons["route-00056"].tap()
        XCTAssertTrue(app.staticTexts["06:00 – 00:00 +1 day"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        let bus = app.buttons["route-bus-test-3"]
        for _ in 0..<7 { if bus.exists && bus.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(bus.isHittable)
        XCTAssertTrue(app.staticTexts["Between stops · official estimate"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "min")).firstMatch.exists)
        capture("bus-arrival-diagram", app: app)
        bus.tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        XCTAssertTrue(input(app, "map-bus-model").waitForExistence(timeout: 8))
        app.buttons["Change map perspective"].tap()
        XCTAssertEqual(app.buttons["Change map perspective"].value as? String, "3D")
        capture("bus-model-on-route", app: app)
        let model = input(app, "map-bus-model")
        let orientation = try XCTUnwrap(model.value as? String)
        app.maps.firstMatch.rotate(.pi / 2, withVelocity: 1)
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", orientation), object: model)], timeout: 5), .completed)
        capture("bus-model-rotated", app: app)
        app.buttons["Done"].tap()
        XCTAssertTrue(app.navigationBars["56"].exists)
        app.buttons["stop-T376/2"].tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        app.swipeUp()
        XCTAssertTrue(app.buttons["route-bus-test-3"].exists)
        capture("bus-stop-arrival-context", app: app)
        app.buttons["Done"].tap()
    }
    func testNearbyRouteStopUsesSimulatorGPS() throws {
        let app = launch("bus")
        tab(app, "Buses").tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("56")
        app.buttons["route-00056"].tap()
        let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        if permission.waitForExistence(timeout: 2) { permission.buttons["Allow While Using App"].tap() }
        let marker = app.images["nearby-stop-0:C690/6"]
        XCTAssertTrue(marker.waitForExistence(timeout: 10))
        XCTAssertEqual(app.images.matching(NSPredicate(format: "identifier BEGINSWITH %@", "nearby-stop-")).count, 1)
        capture("nearby-bus-stop", app: app)
    }
    func testTabsAndSettings() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "-language", "zh-Hant", "-appearance", "light"]
        app.launch()
        XCTAssertTrue(app.buttons["explore-search"].waitForExistence(timeout: 10))
        tab(app, "城市").tap()
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
        app.buttons["Traffic"].tap()
        tab(app, "Assistant").tap()
        capture("assistant", app: app)
        let field = input(app, "assistant-input")
        field.tap(); field.typeText("How do I get to St Pauls?")
        app.buttons["assistant-send"].tap()
        let origin = app.textFields["Or enter an origin landmark"]
        XCTAssertTrue(origin.waitForExistence(timeout: 8)); origin.tap(); origin.typeText("Senado Square")
        app.buttons["Use this origin"].tap()
        let plan = app.staticTexts["步行前往大三巴"]
        XCTAssertTrue(plan.waitForExistence(timeout: 8)); capture("assistant-plan", app: app)
        app.buttons["apply-route-0"].tap()
        XCTAssertTrue(app.buttons["home-route-details"].waitForExistence(timeout: 5))
        XCTAssertTrue(tab(app, "Explore").isSelected)
        let mapValue = app.descendants(matching: .any)["transit-map"].value as? String ?? ""
        let span = mapValue.components(separatedBy: "span=").last.flatMap(Double.init) ?? 1
        XCTAssertLessThan(span, 0.04, "Traffic overlays must not expand the selected journey's bounds: \(mapValue)")
        capture("journey-home", app: app)
        app.buttons["home-route-details"].tap()
        XCTAssertTrue(app.navigationBars["Journey"].waitForExistence(timeout: 5)); capture("journey", app: app)
        app.navigationBars["Journey"].swipeDown()
        XCTAssertTrue(app.buttons["home-route-details"].waitForExistence(timeout: 5))
    }
    func testSendStateAndMapControls() throws {
        let app = launch(extra: ["-appearance", "dark"])
        let perspective = app.buttons["Change map perspective"]
        XCTAssertTrue(perspective.waitForExistence(timeout: 8))
        let map = app.maps.firstMatch
        let cameraState = app.descendants(matching: .any)["transit-map"]
        let initial = try XCTUnwrap(cameraState.value as? String)
        map.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.4)).press(forDuration: 0.05, thenDragTo: map.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.5)))
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", initial), object: cameraState)], timeout: 5), .completed)
        let before = try XCTUnwrap(app.descendants(matching: .any)["transit-map"].value as? String)
        perspective.tap()
        XCTAssertEqual(perspective.value as? String, "3D")
        let after = try XCTUnwrap(app.descendants(matching: .any)["transit-map"].value as? String)
        XCTAssertEqual(before.components(separatedBy: ";").first, after.components(separatedBy: ";").first)
        perspective.tap()
        XCTAssertEqual(perspective.value as? String, "2D")
        app.buttons["explore-search"].tap()
        let field = input(app, "assistant-input")
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        let send = app.buttons["assistant-send"]
        XCTAssertFalse(send.isEnabled)
        field.tap(); field.typeText("Find a bus")
        XCTAssertTrue(send.isEnabled)
        XCTAssertEqual(send.value as? String, "Ready")
        capture("send-ready-dark", app: app)
    }
    func testNativeBackSwipe() throws {
        let app = launch()
        tab(app, "City").tap()
        app.staticTexts["Parking"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Parking"].waitForExistence(timeout: 5))
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.48)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.48)))
        XCTAssertTrue(app.staticTexts["Macau weather"].waitForExistence(timeout: 5))
    }
    func testLocationRecentersAfterPanningTwice() throws {
        let app = launch()
        let locate = app.buttons["Show my location"]
        let map = app.maps.firstMatch
        let camera = app.descendants(matching: .any)["transit-map"]
        for _ in 0..<2 {
            locate.tap()
            let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
            if permission.waitForExistence(timeout: 1) { permission.buttons["Allow While Using App"].tap() }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value BEGINSWITH %@", "22.19300,113.54800"), object: camera)], timeout: 8), .completed)
            let located = try XCTUnwrap(camera.value as? String)
            map.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.4)).press(forDuration: 0.05, thenDragTo: map.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.5)))
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", located), object: camera)], timeout: 5), .completed)
        }
        capture("location-repeat", app: app)
    }
    func testVoiceCancelHitAreaAndLargeCity() throws {
        let app = launch(extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        tab(app, "City").tap(); capture("city-large-text", app: app)
        tab(app, "Buses").tap(); capture("buses-large-text", app: app)
        tab(app, "Assistant").tap()
        app.buttons["DeepSeek voice input"].coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)).tap()
        let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        if permission.waitForExistence(timeout: 2) { permission.buttons["Allow"].tap() }
        let cancel = app.buttons["Cancel recording"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 8))
        cancel.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)).tap()
        XCTAssertTrue(input(app, "assistant-input").waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["assistant-send"].isEnabled)
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
    func testFormattedAssistantAndTrafficLegend() throws {
        let app = launch("traffic")
        app.buttons["Traffic"].tap()
        let source = app.buttons["Traffic sources"]
        XCTAssertTrue(source.waitForExistence(timeout: 5)); source.tap()
        XCTAssertTrue(app.navigationBars["Traffic legend"].waitForExistence(timeout: 5))
        app.swipeUp()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "No confirmed status")).firstMatch.exists)
        capture("traffic-colour-legend", app: app)
        app.buttons["Done"].tap()
        tab(app, "Assistant").tap()
        let field = input(app, "assistant-input")
        field.tap(); field.typeText("How is the traffic?")
        app.buttons["assistant-send"].tap()
        XCTAssertTrue(input(app, "reply-block-0").waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "**")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "唔係即時路況")).firstMatch.exists)
        capture("assistant-formatted-answer", app: app)
    }
    func testDarkExplore() throws {
        let app = launch(extra: ["-appearance", "dark"])
        XCTAssertTrue(app.buttons["explore-search"].waitForExistence(timeout: 8))
        capture("explore-dark", app: app)
        app.buttons["Traffic"].tap()
        let sources = app.buttons["Traffic sources"]
        XCTAssertTrue(sources.waitForExistence(timeout: 5))
        XCTAssertTrue(["Up to date", "Updating", "Data delayed"].contains(sources.value as? String ?? ""))
        capture("explore-traffic-dark", app: app)
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
        XCTAssertTrue(input(app, "voice-waveform").exists)
        capture("voice-waveform", app: app)
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
