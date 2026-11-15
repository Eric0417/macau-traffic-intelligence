import Foundation

struct Place: Codable, Identifiable, Hashable {
    var id: String; var name: String; var coordinates: Coordinate
    var stationCode: String?; var context: String?; var nearbyStop: String?; var distanceMeters: Double?
}
struct JourneyStop: Codable { var stationCode: String; var stationName: String; var coordinates: Coordinate }
struct JourneyLeg: Codable, Identifiable {
    var routeCode: String; var routeName: String; var direction: Int; var terminalName: String; var circular: Bool
    var from: JourneyStop; var to: JourneyStop; var fromSequence: Int; var toSequence: Int; var stopCount: Int
    var serviceWindows: [[Int]]?
    var id: String { "\(routeCode):\(direction):\(fromSequence):\(toSequence)" }
}
struct WalkingPath: Codable { var from: Coordinate; var to: Coordinate; var coordinates: [Coordinate]; var meters: Double }
struct Journey: Codable, Identifiable {
    var id: String; var legs: [JourneyLeg]; var accessMeters: Double; var egressMeters: Double; var transferMeters: Double; var totalStops: Int
    var walking: Walks?
    struct Walks: Codable { var access: WalkingPath?; var egress: WalkingPath?; var direct: WalkingPath? }
}
struct ManualPlan: Codable { var journeys: [Journey]; var networkFetchedAt: String; var walkingMappedAt: String? }
struct JourneySelection: Identifiable {
    var journey: Journey; var origin: Place; var destination: Place; var networkFetchedAt: String; var walkingMappedAt: String?
    var future = false
    var id: String { journey.id + origin.id + destination.id }
}
struct GeometryInput: Encodable {
    var id: String; var legs: [Leg]; var origin: Coordinate; var destination: Coordinate; var destinationName: String; var walking: Journey.Walks?
    struct Leg: Encodable { var leg: JourneyLeg; var eta: BusETA?; var positionsFresh: Bool }
}
struct JourneyGeometry: Decodable {
    var collection: Collection; var missingLegs: [Int]; var uncertainTransfers: [Int]; var bounds: [Coordinate]
    struct Collection: Decodable { var features: [Feature] }
    struct Feature: Decodable {
        var properties: Properties; var geometry: Geometry
        struct Properties: Decodable { var kind: String; var label: String?; var color: String?; var width: Double?; var role: String?; var legIndex: Int? }
        struct Geometry: Decodable {
            var type: String; var line: [Coordinate]?; var point: Coordinate?
            enum CodingKeys: String, CodingKey { case type, coordinates }
            init(from decoder: Decoder) throws {
                let values = try decoder.container(keyedBy: CodingKeys.self)
                type = try values.decode(String.self, forKey: .type)
                if type == "Point" { point = try values.decode(Coordinate.self, forKey: .coordinates) }
                else { line = try values.decode([Coordinate].self, forKey: .coordinates) }
            }
        }
    }
}
