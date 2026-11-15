import XCTest
@testable import MacauTraffic

private final class StreamTransport: URLProtocol {
    struct Reply {
        var contentType = "application/x-ndjson"
        var chunks: [Data]
        var delay: Duration = .milliseconds(100)
    }
    static var reply: ((URLRequest) throws -> Reply)!
    private var responseTask: Task<Void, Never>?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        responseTask = Task {
            do {
                let response = try Self.reply(request)
                client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": response.contentType])!, cacheStoragePolicy: .notAllowed)
                for (index, chunk) in response.chunks.enumerated() {
                    if index > 0 { try await Task.sleep(for: response.delay) }
                    try Task.checkCancellation()
                    client?.urlProtocol(self, didLoad: chunk)
                }
                client?.urlProtocolDidFinishLoading(self)
            } catch { if !Task.isCancelled { client?.urlProtocol(self, didFailWithError: error) } }
        }
    }
    override func stopLoading() { responseTask?.cancel() }
}

@MainActor final class AssistantStreamTests: XCTestCase {
    private let request = AssistantRequest(question: "Find a route", locale: "en")
    private func client() -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StreamTransport.self]
        return APIClient(baseURL: URL(string: "https://native.test/api/v1/")!, session: URLSession(configuration: configuration))
    }
    private func fixture() throws -> Data {
        try Data(contentsOf: XCTUnwrap(Bundle.main.url(forResource: "assistant_plans", withExtension: "json", subdirectory: "Fixtures")))
    }
    private func events() throws -> (Data, Data) {
        let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture()) as? [String: Any])
        let candidates = try JSONSerialization.data(withJSONObject: ["type": "candidates", "data": envelope["data"]!]) + Data("\n".utf8)
        let complete = try JSONSerialization.data(withJSONObject: ["type": "complete", "envelope": envelope]) + Data("\n".utf8)
        return (candidates, complete)
    }
    private func waitUntil(_ predicate: () -> Bool) async throws {
        let deadline = ContinuousClock.now + .seconds(3)
        while !predicate(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(predicate())
    }
    func testCandidatesArriveBeforeFinalAcrossArbitraryNetworkChunks() async throws {
        let (candidates, complete) = try events()
        StreamTransport.reply = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/x-ndjson")
            XCTAssertEqual(request.url?.path, "/api/v1/assistant/journeys")
            let first = Data("{\"type\":\"phase\",\"phase\":\"searching\"}\n".utf8) + candidates
            return .init(chunks: [Data(first.prefix(23)), Data(first.dropFirst(23)), complete])
        }
        var phases: [String] = []; var receivedCandidates = false; var returnedFinal = false
        let final = try await client().journey(request) { event in
            switch event {
            case .phase(let phase): phases.append(phase)
            case .candidates(let plans):
                XCTAssertFalse(returnedFinal)
                XCTAssertFalse(plans.options.isEmpty)
                receivedCandidates = true
            default: XCTFail("Final response must return through the result")
            }
        }
        returnedFinal = true
        XCTAssertEqual(phases, ["searching"])
        XCTAssertTrue(receivedCandidates)
        guard case .plans = final.data else { return XCTFail("Missing final plans") }
    }
    func testOlderJSONServerRemainsCompatible() async throws {
        let data = try fixture()
        StreamTransport.reply = { _ in .init(contentType: "application/json", chunks: [data]) }
        let final = try await client().journey(request) { _ in XCTFail("Old JSON server has no progress events") }
        guard case .plans = final.data else { return XCTFail("Missing JSON plans") }
    }
    func testInterruptedAndMalformedStreamsFailExplicitly() async throws {
        let (candidates, _) = try events()
        for body in [candidates, Data("{\"type\":\"error\",\"error\":\"assistant_unavailable\"}\n".utf8), Data("invalid\n".utf8)] {
            StreamTransport.reply = { _ in .init(chunks: [body]) }
            do { _ = try await client().journey(request) { _ in }; XCTFail("Incomplete stream must fail") }
            catch { XCTAssertFalse(error is CancellationError) }
        }
    }
    func testFailedComparisonRetainsExplicitlyUnrankedCandidates() async throws {
        let (candidates, _) = try events()
        StreamTransport.reply = { _ in .init(chunks: [candidates, Data("{\"type\":\"error\"}\n".utf8)]) }
        let state = AssistantState(client: client()); state.start(request)
        try await waitUntil { !state.busy }
        XCTAssertTrue(state.preview)
        XCTAssertNotNil(state.result)
        XCTAssertNotNil(state.error)
    }
    func testCancellationRetainsCandidatesAndIgnoresLateCompletion() async throws {
        let (candidates, complete) = try events()
        StreamTransport.reply = { _ in .init(chunks: [candidates, complete], delay: .milliseconds(300)) }
        let state = AssistantState(client: client())
        state.activeTrip = TripDraft(mode: "day")
        state.start(request)
        try await waitUntil { state.preview }
        XCTAssertNil(state.activeTrip, "An unrelated route must not keep the previous day trip")
        state.cancel()
        XCTAssertFalse(state.busy)
        XCTAssertEqual(state.draft, request.question)
        try await Task.sleep(for: .milliseconds(400))
        XCTAssertTrue(state.preview)
        XCTAssertTrue(state.cancelled)
        XCTAssertNil(state.meta)
        XCTAssertNil(state.error)
    }
}
