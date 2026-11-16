import XCTest
@testable import MacauTraffic

private final class MockTransport: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, data) = try Self.handler!(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@MainActor final class APIClientTests: XCTestCase {
    private func client() -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockTransport.self]
        return APIClient(baseURL: URL(string: "https://native.test/api/v1/")!, session: URLSession(configuration: configuration))
    }
    func testRouteChangeFailureDoesNotExposePreviousDirection() async throws {
        let fixture = try Data(contentsOf: XCTUnwrap(Bundle.main.url(forResource: "bus_routes_00003_eta", withExtension: "json", subdirectory: "Fixtures")))
        MockTransport.handler = { request in (request.url!.query == "direction=1" ? 503 : 200, fixture) }
        let resource = LiveResource<BusETA>(client: client())
        await resource.load("bus/routes/00003/eta?direction=0")
        XCTAssertNotNil(resource.data)
        await resource.load("bus/routes/00003/eta?direction=1")
        XCTAssertNil(resource.data)
        XCTAssertNotNil(resource.error)
        XCTAssertFalse(resource.fresh())
    }
    func testQuestionAndCoordinatesAreEncodedOnlyWhenSupplied() async throws {
        var sent: [String: Any]?
        MockTransport.handler = { request in
            var body = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 1024)
                while stream.hasBytesAvailable {
                    let count = stream.read(&bytes, maxLength: bytes.count)
                    guard count > 0 else { break }
                    body.append(contentsOf: bytes.prefix(count))
                }
            }
            sent = try JSONSerialization.jsonObject(with: body) as? [String: Any]
            XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
            return (200, Data("{}".utf8))
        }
        struct Empty: Decodable {}
        let _: Empty = try await client().post("assistant/journeys", body: AssistantRequest(question: "Find a bus", locale: "en"))
        XCTAssertEqual(sent?["question"] as? String, "Find a bus")
        XCTAssertNil(sent?["origin"])
        XCTAssertNil(sent?["previousTrip"])
        let _: Empty = try await client().post("assistant/journeys", body: AssistantRequest(question: "Find a bus", locale: "en", origin: .init(113.55, 22.19)))
        XCTAssertEqual(sent?["origin"] as? [Double], [113.55, 22.19])
    }
    func testRateLimitIsVisible() async {
        MockTransport.handler = { _ in (429, Data()) }
        do { let _: Health = try await client().get("health"); XCTFail("429 must fail") }
        catch { XCTAssertTrue(error.localizedDescription.contains("wait a minute")) }
    }

    func testRoadPollingCatchesUpAfterStaleCacheResponse() async throws {
        let formatter = ISO8601DateFormatter()
        let now = Date()
        let timestamp = formatter.string(from: now)
        let staleDate = formatter.string(from: now.addingTimeInterval(-125))
        let source = Attribution(id: "roads", name: "Test", url: "", text: "")
        let stale = try JSONEncoder().encode(Envelope(data: "cached", meta: .init(generatedAt: timestamp, updatedAt: staleDate, stale: true, ttlSeconds: 60, source: source)))
        let fresh = try JSONEncoder().encode(Envelope(data: "refreshed", meta: .init(generatedAt: timestamp, updatedAt: timestamp, stale: false, ttlSeconds: 60, source: source)))
        var requests = 0
        MockTransport.handler = { _ in
            requests += 1
            return (200, requests == 1 ? stale : fresh)
        }
        let roads = LiveResource<String>(client: client())
        let polling = Task { await roads.poll("traffic/roads", interval: 60, followSourceTTL: true) }
        defer { polling.cancel() }
        let deadline = ContinuousClock.now + .seconds(6)
        while roads.data != "refreshed" && ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(roads.data, "refreshed")
        XCTAssertTrue(roads.fresh())
    }
}
