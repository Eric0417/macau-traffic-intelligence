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
}
