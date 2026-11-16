import XCTest
import CoreLocation
import simd
@testable import MacauTraffic

@MainActor final class BusDetailTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func stop(_ distance: Double, sequence: Int = 0) -> BusStop {
        .init(sequence: sequence, stationCode: "M\(sequence)", stationName: "Stop \(sequence)", coordinates: Coordinate(0, distance / 110_574), trafficStatus: "unknown", trafficLevel: -1, suspended: false)
    }
    func testNearestStopRequiresItsWholeAccuracyRadiusWithinFiftyMetres() {
        let fix = LocationFix(coordinate: .init(0, 0), accuracy: 5, timestamp: now)
        XCTAssertNotNil(fix.nearbyStop(in: [stop(44)], now: now))
        XCTAssertNil(fix.nearbyStop(in: [stop(46)], now: now))
        XCTAssertNil(fix.nearbyStop(in: [stop(51)], now: now))
        XCTAssertEqual(fix.nearbyStop(in: [stop(40, sequence: 1), stop(10, sequence: 2)], now: now)?.sequence, 2)
    }
    func testMissingSuspendedStaleAndImpreciseStopsAreNotMarked() {
        var fix = LocationFix(coordinate: .init(0, 0), accuracy: 5, timestamp: now)
        var missing = stop(1); missing.coordinates = nil
        var suspended = stop(1); suspended.suspended = true
        XCTAssertNil(fix.nearbyStop(in: [missing, suspended], now: now))
        XCTAssertNil(fix.nearbyStop(in: [stop(1)], now: now.addingTimeInterval(31)))
        XCTAssertNil(fix.nearbyStop(in: [stop(1)], now: now.addingTimeInterval(-1)))
        fix.accuracy = 51
        XCTAssertNil(fix.nearbyStop(in: [stop(1)], now: now))
        fix.accuracy = -1
        XCTAssertNil(fix.nearbyStop(in: [stop(1)], now: now))
    }
    func testRouteOccurrencesKeepTheirOwnIdentity() {
        let fix = LocationFix(coordinate: .init(0, 0), accuracy: 5, timestamp: now)
        var first = stop(10, sequence: 1); first.stationCode = "M1"
        var repeated = first; repeated.sequence = 20
        XCTAssertEqual(fix.nearbyStop(in: [repeated, first], now: now)?.id, first.id)
        XCTAssertNil(fix.nearbyStop(in: [stop(100, sequence: 3)], now: now))
    }
    func testNearbyRequestWaitsForAccurateFix() async throws {
        let manager = StubLocationManager()
        let service = LocationService(manager: manager)
        let task = Task { try await service.request(maxAccuracy: 50) }
        await Task.yield()
        func location(_ accuracy: Double) -> CLLocation {
            .init(coordinate: .init(latitude: 22.19, longitude: 113.55), altitude: 0, horizontalAccuracy: accuracy, verticalAccuracy: 10, timestamp: .now)
        }
        service.locationManager(manager, didUpdateLocations: [location(800)])
        XCTAssertTrue(service.locating)
        service.locationManager(manager, didUpdateLocations: [location(10)])
        _ = try await task.value
        XCTAssertEqual(service.fix?.accuracy, 10)
    }
    func testVehicleLocationNeedsFeedCoordinatesAndMatchingSegment() throws {
        let envelope: Envelope<BusETA> = try FixtureLoader.response("bus/routes/00056/eta_vehicles", body: nil)
        let eta = envelope.data
        var vehicle = try XCTUnwrap(eta.vehicles.last)
        XCTAssertNotNil(vehicle.segmentNames(in: eta))
        vehicle.coordinates = Coordinate(113.6, 22.02)
        XCTAssertNil(vehicle.segmentNames(in: eta))
        vehicle.coordinates = nil
        XCTAssertNil(vehicle.segmentNames(in: eta))
        vehicle.coordinates = eta.stops.first?.coordinates; vehicle.positionSource = "approaching-stop"
        XCTAssertNil(vehicle.segmentNames(in: eta))
        vehicle.positionSource = "feed"; vehicle.segmentIndex = 10000
        XCTAssertNil(vehicle.segmentNames(in: eta))
    }
    func testTimetableKeepsMidnightAndFixedDeparturesDistinct() {
        XCTAssertTrue(BusTimetable.Period(start: "06:00", end: "00:00").crossesMidnight)
        XCTAssertFalse(BusTimetable.Period(start: "00:00", end: "06:00").crossesMidnight)
        XCTAssertFalse(BusTimetable.Period(start: "08:25").crossesMidnight)
    }
    func testSchematicPlacesFeedBusBetweenStopsAndFallbackAtApproachedStop() throws {
        let envelope: Envelope<BusETA> = try FixtureLoader.response("bus/routes/00056/eta_vehicles", body: nil)
        let eta = envelope.data
        let vehicle = try XCTUnwrap(eta.vehicles.last)
        let position = try XCTUnwrap(vehicle.routePosition(in: eta))
        XCTAssertNotNil(position.from)
        XCTAssertEqual(position.to.sequence, position.from!.sequence + 1)
        var fallback = vehicle
        fallback.positionSource = "stop"
        let approach = try XCTUnwrap(fallback.routePosition(in: eta))
        XCTAssertNil(approach.from)
        XCTAssertEqual(approach.to.sequence, vehicle.stationSequence)
        fallback.stationSequence = 999
        XCTAssertNil(fallback.routePosition(in: eta))
    }
    func testSchematicDoesNotGuessAnOccurrenceFromARepeatedCode() throws {
        let envelope: Envelope<BusETA> = try FixtureLoader.response("bus/routes/00056/eta_vehicles", body: nil)
        var eta = envelope.data
        var vehicle = try XCTUnwrap(eta.vehicles.last)
        let original = try XCTUnwrap(vehicle.routePosition(in: eta))
        var repeatedFrom = try XCTUnwrap(original.from)
        var repeatedTo = original.to
        repeatedFrom.sequence += 100; repeatedTo.sequence += 100
        eta.stops += [repeatedFrom, repeatedTo]
        vehicle.stationSequence = repeatedTo.sequence; vehicle.stationCode = repeatedTo.stationCode
        XCTAssertEqual(vehicle.routePosition(in: eta)?.to.id, repeatedTo.id)
        vehicle.stationSequence = 999
        XCTAssertNil(vehicle.routePosition(in: eta))
    }
    func testLoopClosingBusRemainsBetweenLastAndFirstStops() throws {
        let envelope: Envelope<BusETA> = try FixtureLoader.response("bus/routes/00056/eta_vehicles", body: nil)
        var eta = envelope.data
        var vehicle = try XCTUnwrap(eta.vehicles.last)
        let first = try XCTUnwrap(eta.stops.first)
        let index = try XCTUnwrap(eta.routeSegments.firstIndex { $0.fromStationCode == eta.stops.last?.stationCode && $0.toStationCode == first.stationCode })
        let segment = eta.routeSegments[index]
        vehicle.segmentIndex = index
        vehicle.coordinates = segment.coordinates[segment.coordinates.count / 2]
        vehicle.stationCode = first.stationCode; vehicle.stationSequence = first.sequence
        eta.vehicles = [vehicle]
        XCTAssertEqual(vehicle.routePosition(in: eta)?.from?.id, eta.stops.last?.id)
        XCTAssertEqual(vehicle.routePosition(in: eta)?.to.id, first.id)
        XCTAssertEqual(eta.stopContext(through: first, includeVehicles: true).map(\.id), [eta.stops.last!.id, first.id])
        XCTAssertEqual(eta.stopContext(through: first, includeVehicles: false).map(\.id), [first.id])
    }
    func testBusNoseFollowsCompassAndRotatingMap() {
        func nose(_ bearing: Double, _ heading: Double) -> SIMD3<Float> {
            simd_quatf(angle: BusModelPose.yaw(bearing: bearing, heading: heading), axis: [0, 1, 0]).act([1, 0, 0])
        }
        XCTAssertEqual(nose(0, 0).z, -1, accuracy: 0.001)
        XCTAssertEqual(nose(90, 0).x, 1, accuracy: 0.001)
        XCTAssertEqual(nose(180, 0).z, 1, accuracy: 0.001)
        XCTAssertEqual(nose(270, 0).x, -1, accuracy: 0.001)
        XCTAssertEqual(nose(0, 90).x, -1, accuracy: 0.001)
    }
}
