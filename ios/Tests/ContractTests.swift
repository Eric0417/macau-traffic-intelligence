import XCTest
@testable import MacauTraffic

final class ContractTests: XCTestCase {
    func testCoordinatePreservesLongitudeLatitudeOrder() throws {
        let coordinate = try JSONDecoder().decode(Coordinate.self, from: Data("[113.55,22.17]".utf8))
        XCTAssertEqual(coordinate.latitude, 22.17)
        XCTAssertEqual(coordinate.longitude, 113.55)
        XCTAssertThrowsError(try JSONDecoder().decode(Coordinate.self, from: Data("[113.55,122.17]".utf8)))
    }
    func testFreshnessAgesWithoutAnotherResponse() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let stamp = ISO8601DateFormatter().string(from: start)
        let meta = SourceMeta(generatedAt: stamp, updatedAt: stamp, stale: true, ttlSeconds: 2, source: .init(id: "bus", name: "DSAT", url: "https://example.com", text: ""))
        XCTAssertFalse(meta.isDelayed(at: start.addingTimeInterval(10)))
        XCTAssertTrue(meta.isDelayed(at: start.addingTimeInterval(11)))
    }
    func testParkingZeroAndUnknownStayDistinct() throws {
        let json = """
        {"id":"1","name":"Test","updatedAt":null,"areaStatus":"unknown","coordinates":null,"availability":{"lightVehicle":0,"motorcycle":null}}
        """
        let parking = try JSONDecoder().decode(Parking.self, from: Data(json.utf8))
        XCTAssertEqual(parking.spaces("lightVehicle"), 0)
        XCTAssertNil(parking.spaces("motorcycle"))
        XCTAssertNil(parking.spaces("accessible"))
    }
}
