import XCTest
@testable import MacauTraffic

@MainActor final class NativeFeatureTests: XCTestCase {
    func testAllReadOnlyContractsDecodeCapturedEnvelopes() throws {
        func decode<T: Decodable>(_ name: String, _ type: T.Type) throws {
            let url = try XCTUnwrap(Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
            _ = try JSONDecoder().decode(type, from: Data(contentsOf: url))
        }
        try decode("bus_routes", Envelope<[BusRoute]>.self)
        try decode("bus_routes_00056_eta", Envelope<BusETA>.self)
        try decode("parking", Envelope<[Parking]>.self)
        try decode("weather", Envelope<Weather>.self)
        try decode("lrt_network", Envelope<LRTNetwork>.self)
        try decode("lrt_service", Envelope<LRTService>.self)
        try decode("lrt_notices", Envelope<[LRTNotice]>.self)
        try decode("traffic_roads", Envelope<LineCollection<Road>>.self)
        try decode("traffic_bridges", Envelope<[Bridge]>.self)
        try decode("traffic_news", Envelope<News>.self)
        try decode("traffic_notices", Envelope<[Notice]>.self)
        try decode("borders", Envelope<[Border]>.self)
        try decode("cameras", Envelope<[Camera]>.self)
        try decode("health", Health.self)
        for name in ["location", "plans", "trip_details", "itineraries", "trip_choice", "facilities", "traffic"] {
            try decode("assistant_" + name, Envelope<AssistantResult>.self)
        }
    }
    func testArrivalExpiryClockSkewAndSuspension() throws {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let stamp = ISO8601DateFormatter().string(from: now)
        var stop = BusStop(sequence: 1, stationCode: "A", stationName: "A", stopsAway: 0, trafficStatus: "normal", trafficLevel: 1, suspended: false, arrivalEstimate: .init(minutes: 2, generatedAt: stamp, vehicleId: "bus", basis: "reported-speed"))
        XCTAssertNotNil(stop.freshEstimate(at: now.addingTimeInterval(-2)))
        XCTAssertNil(stop.freshEstimate(at: now.addingTimeInterval(-3)))
        XCTAssertNotNil(stop.freshEstimate(at: now.addingTimeInterval(10)))
        XCTAssertNil(stop.freshEstimate(at: now.addingTimeInterval(11)))
        stop.suspended = true
        XCTAssertNil(stop.freshEstimate(at: now))
    }
    func testSavedInboundRepeatedStopSurvivesRelaunch() throws {
        let name = "MacauTrafficTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let settings = AppSettings(defaults: defaults)
        settings.toggle(.init(id: "stop:00003:1:12:A", kind: "stop", title: "Return platform", routeCode: "00003", direction: 1, stationCode: "A", sequence: 12))
        let reloaded = AppSettings(defaults: defaults)
        XCTAssertEqual(reloaded.saved.first?.direction, 1)
        XCTAssertEqual(reloaded.saved.first?.sequence, 12)
    }
    func testWAVHeaderMatchesServerPCMContract() {
        let data = VoiceWAV.encode([Int16.min, 0, Int16.max])
        XCTAssertEqual(data.count, 50)
        XCTAssertEqual(String(data: data[0..<4], encoding: .ascii), "RIFF")
        XCTAssertEqual(String(data: data[8..<16], encoding: .ascii), "WAVEfmt ")
        XCTAssertEqual(String(data: data[36..<40], encoding: .ascii), "data")
        XCTAssertEqual(Array(data[20..<36]), [1, 0, 1, 0, 128, 62, 0, 0, 0, 125, 0, 0, 2, 0, 16, 0])
        XCTAssertEqual(Array(data[44..<50]), [0, 128, 0, 0, 255, 127])
        XCTAssertEqual(VoiceWAV.encode(Array(repeating: 1, count: 400_000)).count, 640_044)
    }
    func testAssistantChoiceRetainsResolvedContext() {
        let state = AssistantState()
        let origin = Place(id: "origin", name: "Start", coordinates: .init(113.54, 22.19))
        let destination = Place(id: "destination", name: "End", coordinates: .init(113.55, 22.20))
        let search = FacilitySearch(category: "hospital", action: "directions")
        state.apply(.choose(.init(field: "origin", choices: [origin], destination: destination, originQuery: "Start", facilitySearch: search)), request: .init(question: "Find hospital", locale: "en"))
        XCTAssertEqual(state.pending?.destinationId, destination.id)
        XCTAssertEqual(state.pending?.originQuery, "Start")
        XCTAssertEqual(state.pending?.facilitySearch?.category, "hospital")
        XCTAssertNil(state.pending?.origin)
    }
    func testItineraryEditingPreservesConstraintsAndVisitDuration() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "assistant_itineraries", withExtension: "json", subdirectory: "Fixtures"))
        let value = try JSONDecoder().decode(Envelope<AssistantResult>.self, from: Data(contentsOf: url))
        guard case .itineraries(let plans) = value.data else { return XCTFail("Wrong fixture") }
        let draft = plans.editable(plans.options[0])
        XCTAssertEqual(draft.date, "2026-11-16")
        XCTAssertEqual(draft.startTime, "09:00")
        XCTAssertEqual(draft.endTime, "18:00")
        XCTAssertEqual(draft.stops.first?.stayMinutes, 45)
        XCTAssertEqual(draft.fixedStops, true)
    }
    func testAllAssistantContinuationKindsDecode() throws {
        let place = "{\"id\":\"x\",\"name\":\"A\",\"coordinates\":[113.55,22.19]}"
        let draft = "{\"mode\":\"ordered\",\"stops\":[{\"query\":\"A\"}]}"
        let values = [
            "{\"kind\":\"emergency\"}", "{\"kind\":\"nearby-location\"}",
            "{\"kind\":\"facility-location\",\"search\":{\"category\":\"clinic\",\"action\":\"nearest\"},\"reason\":\"outside-macau\"}",
            "{\"kind\":\"clarify\",\"message\":\"Unknown\",\"allowOrigin\":false}",
            "{\"kind\":\"choose\",\"field\":\"origin\",\"choices\":[\(place)]}",
            "{\"kind\":\"trip-location\",\"draft\":\(draft)}",
            "{\"kind\":\"trip-choice\",\"draft\":\(draft),\"field\":\"origin\",\"query\":\"A\",\"choices\":[]}",
            "{\"kind\":\"nearby\",\"answer\":{\"answer\":\"A\",\"model\":\"test\",\"locale\":\"en\",\"snapshotAt\":\"now\",\"contextSummary\":[]}}"
        ]
        for json in values { _ = try JSONDecoder().decode(AssistantResult.self, from: Data(json.utf8)) }
        XCTAssertThrowsError(try JSONDecoder().decode(AssistantResult.self, from: Data("{\"kind\":\"invented\"}".utf8)))
    }
    func testRelocatedStopInvalidatesWalkingPathAndRejectsWrongRoute() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "bus_routes_00056_eta", withExtension: "json", subdirectory: "Fixtures"))
        var eta = try JSONDecoder().decode(Envelope<BusETA>.self, from: Data(contentsOf: url)).data
        let stop = try XCTUnwrap(eta.stops.first(where: { $0.coordinates != nil }))
        let old = try XCTUnwrap(stop.coordinates)
        let moved = Coordinate(old.longitude + 0.002, old.latitude)
        let leg = JourneyLeg(routeCode: eta.routeCode, routeName: eta.routeName, direction: eta.direction, terminalName: "B", circular: false, from: .init(stationCode: stop.stationCode, stationName: stop.stationName, coordinates: old), to: .init(stationCode: "B", stationName: "B", coordinates: old), fromSequence: stop.sequence, toSequence: stop.sequence + 1, stopCount: 1)
        eta.stops = [stop]; eta.stops[0].coordinates = moved
        let path = WalkingPath(from: old, to: old, coordinates: [old, old], meters: 10)
        XCTAssertEqual(leg.endpoint(boarding: true, eta: eta), moved)
        XCTAssertFalse(path.matches(from: old, to: leg.endpoint(boarding: true, eta: eta)))
        eta.stops.append(eta.stops[0])
        XCTAssertEqual(leg.endpoint(boarding: true, eta: eta), old)
        eta.stops.removeLast(); eta.direction += 1
        XCTAssertEqual(leg.endpoint(boarding: true, eta: eta), old)
    }
}
