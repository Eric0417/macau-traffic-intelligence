import Foundation
import Observation

struct APIClient {
    static let productionURL = URL(string: "https://macau-traffic-intelligence.onrender.com/api/v1/")!
    static let shared = APIClient()
    var baseURL = productionURL
    var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 90
        return URLSession(configuration: configuration)
    }()

    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await send(path, method: "GET", body: nil)
    }
    func post<Body: Encodable, Result: Decodable>(_ path: String, body: Body) async throws -> Result {
        try await send(path, method: "POST", body: JSONEncoder().encode(body))
    }
    func journey(_ body: AssistantRequest, receive: @escaping @MainActor (AssistantStreamEvent) -> Void) async throws -> Envelope<AssistantResult> {
        #if DEBUG
        if baseURL == Self.productionURL && (ProcessInfo.processInfo.arguments.contains("--uitesting") || ProcessInfo.processInfo.environment["MACAU_FIXTURES"] == "1") {
            return try await post("assistant/journeys", body: body)
        }
        #endif
        var request = URLRequest(url: baseURL.appendingPathComponent("assistant/journeys"), cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = "POST"; request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
        if http.mimeType != "application/x-ndjson" {
            var data = Data()
            for try await byte in bytes { try Task.checkCancellation(); data.append(byte) }
            return try JSONDecoder().decode(Envelope<AssistantResult>.self, from: data)
        }
        for try await line in bytes.lines where !line.isEmpty {
            try Task.checkCancellation()
            let event = try JSONDecoder().decode(AssistantStreamEvent.self, from: Data(line.utf8))
            switch event {
            case .complete(let envelope): return envelope
            case .failure: throw APIError.http(502)
            default: await receive(event)
            }
        }
        throw APIError.invalidResponse
    }
    func send<T: Decodable>(_ path: String, method: String, body: Data?, contentType: String = "application/json") async throws -> T {
        #if DEBUG
        if baseURL == Self.productionURL && (ProcessInfo.processInfo.arguments.contains("--uitesting") || ProcessInfo.processInfo.environment["MACAU_FIXTURES"] == "1") {
            return try FixtureLoader.response(path, body: body)
        }
        #endif
        guard let url = URL(string: path, relativeTo: baseURL), url.host == baseURL.host else { throw APIError.invalidResponse }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method; request.httpBody = body
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else { throw APIError.http(response.statusCode) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum APIError: Error, LocalizedError {
    case invalidResponse, http(Int)
    var errorDescription: String? {
        switch self {
        case .invalidResponse: "Invalid server response."
        case .http(429): "Too many requests. Please wait a minute."
        case .http(let status): "Service unavailable (\(status))."
        }
    }
}

@Observable @MainActor final class LiveResource<Value: Codable> {
    private let client: APIClient
    private(set) var envelope: Envelope<Value>?
    private(set) var error: String?
    private(set) var loading = false
    private var generation = 0
    private var currentPath: String?
    init(client: APIClient = .shared) { self.client = client }
    var data: Value? { envelope?.data }
    var meta: SourceMeta? { envelope?.meta }
    func fresh(at now: Date = .now) -> Bool { error == nil && meta.map { !$0.isDelayed(at: now) } == true }

    func load(_ path: String) async {
        if currentPath != path { envelope = nil; error = nil; currentPath = path }
        generation += 1
        let current = generation
        loading = envelope == nil
        do {
            let result: Envelope<Value> = try await client.get(path)
            guard !Task.isCancelled, generation == current else { return }
            envelope = result; error = nil
        } catch {
            guard !Task.isCancelled, generation == current else { return }
            self.error = error.localizedDescription
        }
        if generation == current { loading = false }
    }
    func poll(_ path: String, interval: Double) async {
        var failures = 0
        while !Task.isCancelled {
            await load(path)
            failures = error == nil ? 0 : min(failures + 1, 5)
            let delay = error == nil ? interval : max(interval, min(60, pow(2, Double(failures))))
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
        }
    }
}

#if DEBUG
enum FixtureLoader {
    static func response<T: Decodable>(_ path: String, body: Data?) throws -> T {
        var name = path.components(separatedBy: "?")[0].replacingOccurrences(of: "/", with: "_")
        if path == "assistant/journeys" {
            let request = body.flatMap { try? JSONDecoder().decode(AssistantRequest.self, from: $0) }
            let scenario = ProcessInfo.processInfo.arguments.first { $0.hasPrefix("--scenario=") }?.components(separatedBy: "=").last ?? "journey"
            switch scenario {
            case "trip": name = request?.trip == nil ? "assistant_trip_details" : "assistant_itineraries"
            case "facilities": name = "assistant_facilities"
            case "choice": name = "assistant_trip_choice"
            case "traffic": name = "assistant_traffic"
            default: name = request?.originQuery == nil && request?.origin == nil ? "assistant_location" : "assistant_plans"
            }
        }
        guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else { throw APIError.http(503) }
        let data = try Data(contentsOf: url)
        guard var object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw APIError.invalidResponse }
        if var meta = object["meta"] as? [String: Any] {
            let now = ISO8601DateFormatter().string(from: .now)
            meta["generatedAt"] = now; meta["updatedAt"] = now; object["meta"] = meta
        }
        return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
    }
}
#endif
