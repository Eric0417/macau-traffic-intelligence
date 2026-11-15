import Foundation

// Deliberate production check. This executable is separate from fixture-only tests.
@main struct NativeLiveCheck {
    static func main() async throws {
        let client = APIClient()
        let routes: Envelope<[BusRoute]> = try await client.get("bus/routes")
        let parking: Envelope<[Parking]> = try await client.get("parking")
        let rail: Envelope<LRTNetwork> = try await client.get("lrt/network")
        let bus: Envelope<BusETA> = try await client.get("bus/routes/00056/eta?direction=0")
        var request = AssistantRequest(question: "由關閘去大三巴點搭巴士？", locale: "zh-Hant", originQuery: "關閘")
        var response: Envelope<AssistantResult> = try await client.post("assistant/journeys", body: request)
        var choices: [String] = []
        for _ in 0..<4 {
            guard case .choose(let value) = response.data, let place = value.choices.first(where: { $0.name == "大三巴牌坊" }) ?? value.choices.first else { break }
            choices.append(place.name)
            if value.field == "origin" { request.originId = place.id; request.originQuery = nil }
            else { request.destinationId = place.id }
            response = try await client.post("assistant/journeys", body: request)
        }
        var kind = ""
        var options = 0
        switch response.data {
        case .plans(let plans): kind = "plans"; options = plans.options.count
        case .choose(let value): kind = "choose-" + value.field; options = value.choices.count
        case .location: kind = "location"
        case .clarify: kind = "clarify"
        default: throw APIError.invalidResponse
        }
        let report: [String: Any] = [
            "checkedAt": ISO8601DateFormatter().string(from: .now),
            "transport": "Native URLSession and production Codable models",
            "routes": routes.data.count, "parking": parking.data.count,
            "lrtDecoded": !rail.data.stations.isEmpty,
            "route56Stops": bus.data.stops.count, "assistantKind": kind, "assistantOptions": options,
            "selectedPublicPlaces": choices,
            "personalLocationUsed": false
        ]
        print(String(data: try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
    }
}
