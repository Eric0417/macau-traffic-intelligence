import XCTest
import CoreLocation
import MapKit
import SwiftUI
@testable import MacauTraffic

@MainActor final class InteractionTests: XCTestCase {
    func testCameraTogglePreservesPannedCenterDistanceAndHeading() {
        let map = MKMapView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let viewport = MapViewport(); viewport.map = map
        let target = CLLocationCoordinate2D(latitude: 22.197, longitude: 113.543)
        map.setCamera(MKMapCamera(lookingAtCenter: target, fromDistance: 1800, pitch: 0, heading: 70), animated: false)
        let before = map.camera.copy() as! MKMapCamera
        viewport.togglePerspective(animated: false)
        XCTAssertEqual(map.camera.centerCoordinate.latitude, before.centerCoordinate.latitude, accuracy: 0.00001)
        XCTAssertEqual(map.camera.centerCoordinate.longitude, before.centerCoordinate.longitude, accuracy: 0.00001)
        XCTAssertEqual(map.camera.centerCoordinateDistance, before.centerCoordinateDistance, accuracy: 1)
        XCTAssertEqual(map.camera.heading, before.heading, accuracy: 0.1)
        XCTAssertGreaterThan(map.camera.pitch, 10)
        viewport.togglePerspective(animated: false)
        XCTAssertEqual(map.camera.pitch, 0, accuracy: 0.1)
    }
    func testSameLocationCanBeFocusedAgainAfterPanning() {
        let map = MKMapView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let viewport = MapViewport(); viewport.map = map
        let point = Coordinate(113.548, 22.193)
        viewport.focus(point, animated: false)
        map.setCenter(.init(latitude: 22.13, longitude: 113.58), animated: false)
        viewport.focus(point, animated: false)
        XCTAssertEqual(map.centerCoordinate.latitude, point.location.latitude, accuracy: 0.00001)
        XCTAssertEqual(map.centerCoordinate.longitude, point.location.longitude, accuracy: 0.00001)
    }
    func testRouteFitKeepsBothEndpointsAboveTheHomePanel() {
        let map = MKMapView(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        map.directionalLayoutMargins = .init(top: 140, leading: 16, bottom: 440, trailing: 16)
        let points = [Coordinate(113.539, 22.1935), Coordinate(113.5407, 22.1976)]
        NativeTransitMap.fit(points, on: map, animated: false)
        for point in points {
            let screen = map.convert(point.location, toPointTo: map)
            XCTAssertGreaterThan(screen.y, 140)
            XCTAssertLessThan(screen.y, 434)
            XCTAssertGreaterThan(screen.x, 16)
            XCTAssertLessThan(screen.x, 386)
        }
    }
    func testCompleteTrafficSnapshotBatchesWithoutDroppingSegments() throws {
        let envelope: Envelope<LineCollection<Road>> = try FixtureLoader.response("traffic/roads", body: nil)
        let lines = envelope.data.features.map { MapLine(id: $0.properties.id, coordinates: $0.geometry.coordinates, color: trafficColor($0.properties.status), width: 3) }
        XCTAssertGreaterThan(lines.count, 1_000)
        let batches = MapOverlayBatch.make(lines)
        XCTAssertLessThanOrEqual(batches.count, 4)
        XCTAssertEqual(batches.reduce(0) { $0 + $1.overlay.polylines.count }, lines.count)
        XCTAssertEqual(batches.flatMap { $0.overlay.polylines }.reduce(0) { $0 + $1.pointCount }, lines.reduce(0) { $0 + $1.coordinates.count })
    }
    func testAudioMeterUsesActualDecibelsAndClampsSilence() {
        XCTAssertEqual(VoiceRecorder.normalizedLevel(-160), 0)
        XCTAssertEqual(VoiceRecorder.normalizedLevel(-55), 0)
        XCTAssertEqual(VoiceRecorder.normalizedLevel(0), 1)
        XCTAssertEqual(VoiceRecorder.normalizedLevel(.nan), 0)
        XCTAssertGreaterThan(VoiceRecorder.normalizedLevel(-10), VoiceRecorder.normalizedLevel(-40))
    }
    func testApplyingJourneyResetsHomeNavigationAndRefitsRepeatedSelection() throws {
        let envelope: Envelope<AssistantResult> = try FixtureLoader.response("assistant/journeys", body: JSONEncoder().encode(AssistantRequest(question: "Find a route", locale: "en", originQuery: "Senado Square")))
        guard case .plans(let plans) = envelope.data else { return XCTFail("Missing fixture plans") }
        let selection = JourneySelection(journey: plans.options[0].journey, origin: plans.origin, destination: plans.destination, networkFetchedAt: plans.networkFetchedAt, walkingMappedAt: plans.walkingMappedAt)
        let navigation = AppNavigation()
        navigation.tab = .assistant; navigation.explorePath.append("planner")
        navigation.apply(selection)
        XCTAssertEqual(navigation.tab, .explore)
        XCTAssertTrue(navigation.explorePath.isEmpty)
        XCTAssertEqual(navigation.journey?.id, selection.id)
        let revision = navigation.mapRevision
        let previousLive = navigation.journeyLive
        navigation.apply(selection)
        XCTAssertEqual(navigation.mapRevision, revision + 1)
        XCTAssertFalse(navigation.journeyLive === previousLive)
    }
    func testLocationWaitsThroughTemporaryFailureAndIgnoresStaleFix() async throws {
        let manager = StubLocationManager()
        let service = LocationService(manager: manager)
        let request = Task { try await service.request() }
        await Task.yield()
        service.locationManager(manager, didFailWithError: CLError(.locationUnknown))
        service.locationManager(manager, didUpdateLocations: [CLLocation(coordinate: .init(latitude: 22.19, longitude: 113.55), altitude: 0, horizontalAccuracy: 10, verticalAccuracy: 10, timestamp: Date(timeIntervalSinceNow: -120))])
        XCTAssertTrue(service.locating)
        let location = CLLocation(latitude: 22.193, longitude: 113.548)
        service.locationManager(manager, didUpdateLocations: [location])
        let result = try await request.value
        XCTAssertEqual(result, Coordinate(113.548, 22.193))
        XCTAssertFalse(service.locating)
        XCTAssertGreaterThan(manager.stopCount, 0)
    }
    func testLocationTimeoutAndCancellationReleaseControls() async throws {
        let manager = StubLocationManager()
        let service = LocationService(manager: manager, timeout: .milliseconds(50))
        do { _ = try await service.request(); XCTFail("Expected timeout") } catch {}
        XCTAssertFalse(service.locating)
        let request = Task { try await service.request() }
        await Task.yield(); request.cancel()
        do { _ = try await request.value; XCTFail("Expected cancellation") } catch {}
        XCTAssertFalse(service.locating)
    }
}

final class StubLocationManager: CLLocationManager {
    var stopCount = 0
    override var authorizationStatus: CLAuthorizationStatus { .authorizedWhenInUse }
    override func startUpdatingLocation() {}
    override func stopUpdatingLocation() { stopCount += 1 }
}
