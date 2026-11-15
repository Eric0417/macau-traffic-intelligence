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
    func send<T: Decodable>(_ path: String, method: String, body: Data?, contentType: String = "application/json") async throws -> T {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--uitesting") {
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
    private(set) var envelope: Envelope<Value>?
    private(set) var error: String?
    private(set) var loading = false
    private var generation = 0
    private var currentPath: String?
    var data: Value? { envelope?.data }
    var meta: SourceMeta? { envelope?.meta }
    func fresh(at now: Date = .now) -> Bool { error == nil && meta.map { !$0.isDelayed(at: now) } == true }

    func load(_ path: String) async {
        if currentPath != path { envelope = nil; error = nil; currentPath = path }
        generation += 1
        let current = generation
        loading = envelope == nil
        do {
            let result: Envelope<Value> = try await APIClient.shared.get(path)
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
        let name = path.components(separatedBy: "?")[0].replacingOccurrences(of: "/", with: "_")
        guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else { throw APIError.http(503) }
        let data = try Data(contentsOf: url)
        var object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        if var meta = object["meta"] as? [String: Any] {
            let now = ISO8601DateFormatter().string(from: .now)
            meta["generatedAt"] = now; meta["updatedAt"] = now; object["meta"] = meta
        }
        return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
    }
}
#endif
