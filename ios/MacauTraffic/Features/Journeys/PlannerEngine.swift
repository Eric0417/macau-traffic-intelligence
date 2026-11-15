import Foundation
import JavaScriptCore

final class PlannerEngine: @unchecked Sendable {
    static let shared = PlannerEngine()
    private let queue = DispatchQueue(label: "com.eric.macautraffic.planner", qos: .userInitiated)
    private var context: JSContext?

    func configure(bus: Data, walking: Data?) async throws {
        try await perform { context in
            guard let busObject = try JSONSerialization.jsonObject(with: bus) as? [String: Any] else { throw APIError.invalidResponse }
            let walkObject = try walking.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            guard let busData = busObject["data"] as? [String: Any] else { throw APIError.invalidResponse }
            let walkData = walkObject?["data"] as? [String: Any]
            let busString = String(data: try JSONSerialization.data(withJSONObject: busData), encoding: .utf8)!
            let walkString = try walkData.map { String(data: try JSONSerialization.data(withJSONObject: $0), encoding: .utf8)! }
            context.objectForKeyedSubscript("NativePlanner")?.invokeMethod("configure", withArguments: [busString, walkString as Any? ?? NSNull()])
            if let exception = context.exception { throw EngineError(message: exception.toString()) }
        }
    }
    func call<T: Decodable>(_ method: String, input: String) async throws -> T {
        try await perform { context in
            let value = context.objectForKeyedSubscript("NativePlanner")?.invokeMethod(method, withArguments: [input])
            guard context.exception == nil, let string = value?.toString(), let data = string.data(using: .utf8) else {
                throw EngineError(message: context.exception?.toString() ?? "Planner returned no result")
            }
            return try JSONDecoder().decode(T.self, from: data)
        }
    }
    private func perform<T>(_ block: @escaping (JSContext) throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do {
                    if self.context == nil {
                        guard let context = JSContext(), let url = Bundle.main.url(forResource: "planner", withExtension: "js") else { throw EngineError(message: "Planner bundle missing") }
                        context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
                        if let exception = context.exception { throw EngineError(message: exception.toString()) }
                        self.context = context
                    }
                    self.context!.exception = nil
                    continuation.resume(returning: try block(self.context!))
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
    struct EngineError: LocalizedError { var message: String; var errorDescription: String? { message } }
}

struct RawJSON: Codable {
    var data: Data
    init(from decoder: Decoder) throws {
        let object = try JSONValue(from: decoder)
        data = try JSONEncoder().encode(object)
    }
    func encode(to encoder: Encoder) throws { try JSONDecoder().decode(JSONValue.self, from: data).encode(to: encoder) }
}
private enum JSONValue: Codable {
    case string(String), number(Double), bool(Bool), null, array([JSONValue]), object([String: JSONValue])
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else { self = .array(try container.decode([JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}
