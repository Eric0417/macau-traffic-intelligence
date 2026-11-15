import XCTest
@testable import MacauTraffic

final class PlannerTests: XCTestCase {
    func testSharedPlannerRunsInJavaScriptCore() async throws {
        let engine = PlannerEngine()
        let busURL = try XCTUnwrap(Bundle.main.url(forResource: "bus_network", withExtension: "json", subdirectory: "Fixtures"))
        let walkURL = try XCTUnwrap(Bundle.main.url(forResource: "journeys_walking-network", withExtension: "json", subdirectory: "Fixtures"))
        try await engine.configure(bus: Data(contentsOf: busURL), walking: Data(contentsOf: walkURL))
        let origins: [Place] = try await engine.call("search", input: "議事亭前地")
        let destinations: [Place] = try await engine.call("search", input: "大三巴")
        XCTAssertEqual(origins.first?.id, "test:senado")
        XCTAssertEqual(destinations.first?.id, "test:stpauls")
        let input = """
        {"origin":{"id":"test:senado","name":"A","coordinates":[113.539,22.1935]},"destination":{"id":"test:stpauls","name":"B","coordinates":[113.5407,22.1976]},"nearby":false,"departureMinute":600}
        """
        let result: ManualPlan = try await engine.call("plan", input: input)
        XCTAssertTrue(result.journeys.contains { $0.id == "walk" && ($0.walking?.direct?.meters ?? 0) > 400 })
        let geometry: JourneyGeometry = try await engine.call("geometry", input: "{\"id\":\"walk\",\"legs\":[],\"origin\":[113.539,22.1935],\"destination\":[113.5407,22.1976],\"destinationName\":\"B\",\"locale\":\"en\"}")
        XCTAssertTrue(geometry.collection.features.contains { $0.properties.label == "Start" })
    }
    func testMissingWalkingNetworkKeepsStopSearchAndRejectsPlaceRouting() async throws {
        let engine = PlannerEngine()
        let url = try XCTUnwrap(Bundle.main.url(forResource: "bus_network", withExtension: "json", subdirectory: "Fixtures"))
        try await engine.configure(bus: Data(contentsOf: url), walking: nil)
        let stops: [Place] = try await engine.call("search", input: "M")
        XCTAssertFalse(stops.isEmpty)
        do {
            let _: ManualPlan = try await engine.call("plan", input: "{\"origin\":{\"id\":\"A\",\"coordinates\":[113.55,22.19]},\"destination\":{\"id\":\"B\",\"coordinates\":[113.56,22.20]},\"nearby\":false,\"departureMinute\":600}")
            XCTFail("Unmapped place route must fail")
        } catch { XCTAssertTrue(error.localizedDescription.contains("Walking network unavailable")) }
    }
    func testUnverifiedBusGeometryIsOmitted() async throws {
        let json = """
        {"id":"test","locale":"en","origin":[113.55,22.19],"destination":[113.56,22.20],"legs":[{"leg":{"routeCode":"1","routeName":"1","direction":0,"terminalName":"B","circular":false,"from":{"stationCode":"A","stationName":"A","coordinates":[113.55,22.19]},"to":{"stationCode":"B","stationName":"B","coordinates":[113.56,22.20]},"fromSequence":0,"toSequence":1,"stopCount":1},"eta":null,"positionsFresh":false}]}
        """
        let geometry: JourneyGeometry = try await PlannerEngine().call("geometry", input: json)
        XCTAssertEqual(geometry.missingLegs, [0])
        XCTAssertFalse(geometry.collection.features.contains { $0.properties.kind == "bus" })
    }
    func testCorrectedNetworkWithSameDateReplacesPreviousPlaces() async throws {
        let engine = PlannerEngine()
        let bus = try Data(contentsOf: XCTUnwrap(Bundle.main.url(forResource: "bus_network", withExtension: "json", subdirectory: "Fixtures")))
        let walk = try Data(contentsOf: XCTUnwrap(Bundle.main.url(forResource: "journeys_walking-network", withExtension: "json", subdirectory: "Fixtures")))
        try await engine.configure(bus: bus, walking: walk)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: walk) as? [String: Any])
        var data = try XCTUnwrap(object["data"] as? [String: Any])
        data["places"] = []
        object["data"] = data
        try await engine.configure(bus: bus, walking: JSONSerialization.data(withJSONObject: object))
        let places: [Place] = try await engine.call("search", input: "議事亭前地")
        XCTAssertFalse(places.contains { $0.id == "test:senado" })
    }
}
