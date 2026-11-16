import Foundation
import CoreLocation

struct Envelope<Value: Decodable>: Decodable {
    var data: Value
    var meta: SourceMeta
}
extension Envelope: Encodable where Value: Encodable {}

struct SourceMeta: Codable {
    var generatedAt: String
    var updatedAt: String
    var stale: Bool
    var ttlSeconds: Double
    var source: Attribution

    func isDelayed(at now: Date = .now) -> Bool {
        guard let generated = Timestamp.date(generatedAt), let updated = Timestamp.date(updatedAt) else { return true }
        return max(now, generated).timeIntervalSince(updated) > ttlSeconds + 8
    }
}

struct Attribution: Codable {
    var id: String
    var name: String
    var url: String
    var text: String
}

enum Timestamp {
    static func date(_ string: String?) -> Date? {
        guard let string else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }
}

struct Coordinate: Codable, Hashable {
    var longitude: Double
    var latitude: Double
    init(_ longitude: Double, _ latitude: Double) { self.longitude = longitude; self.latitude = latitude }
    init(from decoder: Decoder) throws {
        var values = try decoder.unkeyedContainer()
        longitude = try values.decode(Double.self)
        latitude = try values.decode(Double.self)
        guard (-180...180).contains(longitude), (-90...90).contains(latitude) else {
            throw DecodingError.dataCorruptedError(in: values, debugDescription: "Invalid coordinate")
        }
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(longitude); try values.encode(latitude)
    }
    var location: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }
    func distance(to other: Coordinate) -> Double {
        CLLocation(latitude: latitude, longitude: longitude).distance(from: .init(latitude: other.latitude, longitude: other.longitude))
    }
}

struct LocalizedName: Codable {
    var traditional: String
    var simplified: String
    var en: String
    enum CodingKeys: String, CodingKey { case traditional = "zh-Hant", simplified = "zh-Hans", en }
    func value(_ language: AppLanguage) -> String {
        switch language { case .traditional: traditional; case .simplified: simplified; case .english: en }
    }
}

struct BusCompany: Codable { var id: String; var name: String; var color: String }
struct BusRoute: Codable, Identifiable {
    var routeName: String; var routeCode: String; var routeType: Int
    var company: BusCompany; var hasChange: Bool; var live: Bool
    var timetable: BusTimetable?
    var id: String { routeCode }
}
struct ArrivalEstimate: Codable {
    var minutes: Int; var generatedAt: String; var vehicleId: String; var basis: String
    var arrivalAt: String?; var nextBus: Bool?
}
struct ArrivalStatus: Codable {
    var state: String; var vehicleId: String; var generatedAt: String; var since: String; var nextBus: Bool?
}
struct BusStop: Codable, Identifiable {
    var sequence: Int; var stationCode: String; var stationName: String; var stopsAway: Int?
    var coordinates: Coordinate?; var trafficStatus: String; var trafficLevel: Int; var suspended: Bool
    var arrivalEstimate: ArrivalEstimate?; var arrivalStatus: ArrivalStatus?
    var id: String { "\(sequence):\(stationCode)" }

    func freshEstimate(at now: Date) -> ArrivalEstimate? {
        guard !suspended, let estimate = arrivalEstimate, recent(estimate.generatedAt, at: now) else { return nil }
        return estimate
    }
    func freshStatus(at now: Date) -> ArrivalStatus? {
        guard !suspended, let status = arrivalStatus, recent(status.generatedAt, at: now) else { return nil }
        return status
    }
    private func recent(_ value: String, at now: Date) -> Bool {
        guard let date = Timestamp.date(value) else { return false }
        return (-2...10).contains(now.timeIntervalSince(date))
    }
}
struct BusVehicle: Codable, Identifiable {
    var id: String; var plate: String; var busType: String; var lowFloor: Bool; var speedKph: Double?
    var status: String; var stationCode: String; var stationName: String; var stationSequence: Int
    var segmentIndex: Int?; var coordinates: Coordinate?; var bearing: Double?
    var positionSource: String?; var estimated: Bool
}
struct BusSegment: Codable {
    var fromStationCode: String; var toStationCode: String; var trafficStatus: String
    var trafficLevel: Int; var coordinates: [Coordinate]
}
struct BusETA: Codable {
    var routeName: String; var routeCode: String; var direction: Int
    var stops: [BusStop]; var vehicles: [BusVehicle]; var routeSegments: [BusSegment]
    var diversion: Diversion
    struct Diversion: Codable { var suspendedStops: [SuspendedStop] }
    struct SuspendedStop: Codable { var stationCode: String; var stationName: String }
}

struct Parking: Codable, Identifiable {
    var id: String; var name: String; var updatedAt: String?; var areaStatus: String
    var coordinates: Coordinate?; var availability: [String: Int?]
    func spaces(_ kind: String) -> Int? { availability[kind] ?? nil }
}
struct Weather: Codable {
    var observedAt: String?; var temperatureCelsius: Double?; var humidityPercent: Double?
    var wind: String?; var forecast: String?; var warnings: [Warning]
    struct Warning: Codable { var type: String; var updatedAt: String?; var text: String; var active: Bool }
}
struct Camera: Codable, Identifiable {
    var id: String; var name: LocalizedName; var location: LocalizedName; var coordinates: Coordinate
    var zone: LocalizedName; var subzone: LocalizedName; var streamUrl: String; var mediaType: String
}
struct Notice: Codable, Identifiable {
    var id: String; var title: String; var content: String; var publishedAt: String?; var category: String; var url: String
}
struct News: Codable {
    var items: [Notice]; var feeds: [Feed]
    struct Feed: Codable { var name: String; var url: String; var available: Bool }
}
struct Bridge: Codable, Identifiable {
    var id: String; var name: LocalizedName; var direction: String; var runtimeSeconds: Double
    var status: String; var officialLevel: Int
}
struct Border: Codable, Identifiable {
    var id: String; var name: LocalizedName; var status: String
    var estimatedWaitMinutes: Double?; var updatedAt: String?; var sourceUrl: String
}
struct Health: Codable {
    var status: String; var service: String; var cache: String; var failures: [String: Int]; var time: String
}
struct LRTNetwork: Codable {
    var lines: LineCollection<LRTLine>; var stations: [LRTStation]; var timetableEdition: String; var sourceUpdatedAt: String
}
struct LRTLine: Codable { var id: String; var ref: String; var name: LocalizedName; var color: String }
struct LRTStation: Codable, Identifiable {
    var id: String; var name: LocalizedName; var coordinates: Coordinate
    var lineCoordinates: [String: Coordinate]?; var lines: [String]; var interchange: Bool
}
struct LRTService: Codable {
    var lines: [Line]; var revisionNote: String
    struct Line: Codable { var name: String; var weekdayHours: String; var weekendHours: String; var frequency: String; var journeyTime: String; var timetables: [Timetable] }
    struct Timetable: Codable { var stationName: String; var url: String }
}
struct LRTNotice: Codable, Identifiable { var id: String; var title: String; var content: String; var publishedAt: String; var active: Bool }
struct LineCollection<Properties: Codable>: Codable { var features: [LineFeature<Properties>] }
struct LineFeature<Properties: Codable>: Codable { var properties: Properties; var geometry: LineGeometry }
struct LineGeometry: Codable { var coordinates: [Coordinate] }
struct Road: Codable { var id: String; var name: LocalizedName; var nameVisible: Bool; var lengthMeters: Double; var status: String; var officialLevel: Int }
