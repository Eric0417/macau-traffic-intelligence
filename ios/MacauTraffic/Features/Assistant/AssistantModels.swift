import Foundation

struct FacilitySearch: Codable {
    var category: String; var action: String; var distance: String?; var verify: String?
}
struct TripStop: Codable, Identifiable {
    var query: String; var placeId: String?; var stayMinutes: Int?
    var id: String { placeId ?? query }
}
struct TripDraft: Codable {
    var mode: String
    var fixedStops: Bool?; var theme: String?; var originQuery: String?; var originId: String?
    var endQuery: String?; var endId: String?
    var stops: [TripStop] = []
    var date: String?; var startTime: String?; var endTime: String?; var preferences: String?
}
struct AssistantRequest: Codable {
    var question: String; var locale: String
    var destinationId: String?; var origin: Coordinate?; var originQuery: String?; var originId: String?
    var trip: TripDraft?; var previousTrip: TripDraft?; var facilitySearch: FacilitySearch?
    var history: [AssistantTurn]?
}
struct AssistantTurn: Codable {
    var question: String
    var reply: String
}
struct TrafficQuestion: Encodable { var question: String; var locale: String }
struct TrafficAnswer: Codable {
    var answer: String; var model: String; var locale: String; var snapshotAt: String; var contextSummary: [String]
    var action: Action?
    struct Action: Codable { var kind: String; var routeCode: String?; var direction: Int?; var lineRef: String? }
}
struct AssistantPlans: Decodable {
    var origin: Place; var destination: Place; var generatedAt: String; var networkFetchedAt: String; var walkingMappedAt: String
    var model: String; var summary: String; var warnings: [String]; var taxiAlternative: String?; var options: [Option]
    struct Option: Decodable { var title: String; var reason: String; var journey: Journey }
}
struct FacilityResults: Decodable {
    var origin: Place; var search: FacilitySearch; var matches: [Place]; var mappedAt: String; var routeNote: String?
}
struct PlaceChoices: Decodable {
    var field: String; var choices: [Place]; var destination: Place?; var originQuery: String?; var facilitySearch: FacilitySearch?
}
struct FacilityLocation: Decodable { var search: FacilitySearch; var reason: String? }
struct Clarification: Decodable { var message: String; var allowOrigin: Bool? }
struct TripDetails: Decodable { var draft: TripDraft; var missing: [String]; var message: String? }
struct TripChoice: Decodable {
    var draft: TripDraft; var field: Field; var query: String; var choices: [Place]
    enum Field: Decodable {
        case name(String), index(Int)
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let number = try? container.decode(Int.self) { self = .index(number) }
            else { self = .name(try container.decode(String.self)) }
        }
    }
}
struct ItineraryStop: Decodable, Identifiable {
    var id: String; var name: String; var coordinates: Coordinate; var stayMinutes: Int
    var visit: Bool?; var targetTime: String?; var sourceUrl: String?; var checkedAt: String?; var hours: String?
    var place: Place { .init(id: id, name: name, coordinates: coordinates) }
}
struct ItinerarySection: Decodable {
    var from: Place; var to: Place; var journeys: [Journey]; var warnings: [String]; var taxiAlternative: String?
}
struct ItineraryOption: Decodable, Identifiable {
    var id: String; var title: String; var reason: String; var stops: [ItineraryStop]; var sections: [ItinerarySection]
}
struct ItineraryPlans: Decodable {
    var draft: TripDraft; var generatedAt: String; var networkFetchedAt: String; var walkingMappedAt: String
    var options: [ItineraryOption]; var warnings: [String]
    func editable(_ option: ItineraryOption) -> TripDraft {
        var value = draft
        let day = value.mode == "day"
        value.fixedStops = day ? true : nil
        if let origin = option.stops.first, origin.id != "current" { value.originQuery = origin.name; value.originId = origin.id }
        else { value.originQuery = nil; value.originId = nil }
        value.stops = (day ? option.stops.filter { $0.visit == true } : Array(option.stops.dropFirst())).map { .init(query: $0.name, placeId: $0.id, stayMinutes: $0.stayMinutes) }
        return value
    }
}

enum AssistantResult: Decodable {
    case traffic, emergency, nearbyLocation
    case answer(TrafficAnswer)
    case location(Place), facilityLocation(FacilityLocation), facilities(FacilityResults), nearby(TrafficAnswer)
    case clarify(Clarification), choose(PlaceChoices), plans(AssistantPlans)
    case tripDetails(TripDetails), tripChoice(TripChoice), tripLocation(TripDraft), itineraries(ItineraryPlans)
    enum Keys: String, CodingKey { case kind, destination, answer, draft }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: Keys.self)
        switch try values.decode(String.self, forKey: .kind) {
        case "traffic": self = .traffic
        case "answer": self = .answer(try values.decode(TrafficAnswer.self, forKey: .answer))
        case "emergency": self = .emergency
        case "nearby-location": self = .nearbyLocation
        case "location": self = .location(try values.decode(Place.self, forKey: .destination))
        case "facility-location": self = .facilityLocation(try FacilityLocation(from: decoder))
        case "facilities": self = .facilities(try FacilityResults(from: decoder))
        case "nearby": self = .nearby(try values.decode(TrafficAnswer.self, forKey: .answer))
        case "clarify": self = .clarify(try Clarification(from: decoder))
        case "choose": self = .choose(try PlaceChoices(from: decoder))
        case "plans": self = .plans(try AssistantPlans(from: decoder))
        case "trip-details": self = .tripDetails(try TripDetails(from: decoder))
        case "trip-choice": self = .tripChoice(try TripChoice(from: decoder))
        case "trip-location": self = .tripLocation(try values.decode(TripDraft.self, forKey: .draft))
        case "itineraries": self = .itineraries(try ItineraryPlans(from: decoder))
        default: throw DecodingError.dataCorruptedError(forKey: .kind, in: values, debugDescription: "Unsupported assistant response")
        }
    }
}

enum AssistantStreamEvent: Decodable {
    case phase(String), text(String), candidates(AssistantPlans), complete(Envelope<AssistantResult>), failure
    enum Keys: String, CodingKey { case type, phase, data, envelope, delta }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: Keys.self)
        switch try values.decode(String.self, forKey: .type) {
        case "phase": self = .phase(try values.decode(String.self, forKey: .phase))
        case "text": self = .text(try values.decode(String.self, forKey: .delta))
        case "candidates": self = .candidates(try values.decode(AssistantPlans.self, forKey: .data))
        case "complete": self = .complete(try values.decode(Envelope<AssistantResult>.self, forKey: .envelope))
        case "error": self = .failure
        default: throw DecodingError.dataCorruptedError(forKey: .type, in: values, debugDescription: "Unknown journey event")
        }
    }
}
