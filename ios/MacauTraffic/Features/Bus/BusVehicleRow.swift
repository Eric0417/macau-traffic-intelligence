import SwiftUI
import MapKit

struct BusRoutePosition {
    var from: BusStop?
    var to: BusStop
}

extension BusVehicle {
    func routePosition(in eta: BusETA) -> BusRoutePosition? {
        if let match = matchedSegment(in: eta) {
            let segment = match.segment
            var adjacent = Array(zip(eta.stops, eta.stops.dropFirst()))
            if let last = eta.stops.last, let first = eta.stops.first, last.id != first.id { adjacent.append((last, first)) }
            let pairs = adjacent.filter {
                $0.stationCode == segment.fromStationCode && $1.stationCode == segment.toStationCode
            }
            if pairs.count == 1, let pair = pairs.first { return .init(from: pair.0, to: pair.1) }
            let occurrences = pairs.filter {
                ($0.sequence == stationSequence && $0.stationCode == stationCode) ||
                ($1.sequence == stationSequence && $1.stationCode == stationCode)
            }
            if occurrences.count == 1, let pair = occurrences.first { return .init(from: pair.0, to: pair.1) }
        }
        guard let stop = eta.stops.first(where: { $0.sequence == stationSequence && $0.stationCode == stationCode }) else { return nil }
        return .init(from: nil, to: stop)
    }
    func segmentNames(in eta: BusETA) -> (String, String)? {
        guard let position = routePosition(in: eta), let from = position.from else { return nil }
        return (from.stationName, position.to.stationName)
    }
    func routeBearing(in eta: BusETA) -> Double? { matchedSegment(in: eta)?.bearing }
    private func matchedSegment(in eta: BusETA) -> (segment: BusSegment, bearing: Double)? {
        guard positionSource == "feed", let coordinates, let index = segmentIndex,
              eta.routeSegments.indices.contains(index) else { return nil }
        let segment = eta.routeSegments[index]
        let point = MKMapPoint(coordinates.location)
        let points = segment.coordinates.map { MKMapPoint($0.location) }
        var nearest: (distance: Double, bearing: Double)?
        for (start, end) in zip(points, points.dropFirst()) {
            let dx = end.x - start.x, dy = end.y - start.y
            let lengthSquared = dx * dx + dy * dy
            guard lengthSquared > 0 else { continue }
            let fraction = max(0, min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
            let distance = point.distance(to: MKMapPoint(x: start.x + fraction * dx, y: start.y + fraction * dy))
            if nearest == nil || distance < nearest!.distance {
                nearest = (distance, (atan2(dx, -dy) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360))
            }
        }
        guard let nearest, nearest.distance <= 100 else { return nil }
        return (segment, nearest.bearing)
    }
}

struct BusVehicleRow: View {
    @Environment(AppSettings.self) private var settings
    var vehicle: BusVehicle
    var eta: BusETA
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Image(systemName: "bus.fill").frame(width: 22)
                Text(vehicle.plate).fontWeight(.semibold)
                if vehicle.lowFloor { Image(systemName: "figure.roll").font(.caption).foregroundStyle(.secondary) }
                Spacer(minLength: 0)
                if let speed = vehicle.speedKph { Text("\(Int(speed)) km/h").font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
            }
            Group {
                if let (from, to) = vehicle.segmentNames(in: eta) {
                    Text(from == to ? from : "\(from) → \(to)")
                    Text(settings.text("估算所在路段", "Estimated route segment")).font(.caption).foregroundStyle(.secondary)
                } else {
                    Text(settings.text("正前往 ", "Approaching ") + vehicle.stationName)
                    Text(settings.text("未有確實位置", "Exact location unavailable")).font(.caption).foregroundStyle(.secondary)
                }
            }.font(.subheadline)
        }.frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .contain).accessibilityIdentifier("vehicle-\(vehicle.id)")
    }
}

extension BusETA {
    func stopContext(through target: BusStop, includeVehicles: Bool) -> [BusStop] {
        guard let end = stops.firstIndex(where: { $0.id == target.id }) else { return [] }
        let loop = routeSegments.contains { $0.fromStationCode == stops.last?.stationCode && $0.toStationCode == stops.first?.stationCode }
        let positions = includeVehicles ? vehicles.compactMap { $0.routePosition(in: self) } : []
        let candidates = positions.compactMap { position -> (start: Int, distance: Int)? in
            guard let to = stops.firstIndex(where: { $0.id == position.to.id }), to <= end || loop else { return nil }
            let start = position.from.flatMap { from in stops.firstIndex { $0.id == from.id } } ?? to
            return (start, (end - to + stops.count) % stops.count)
        }
        let start = candidates.min { $0.distance < $1.distance }?.start ?? max(0, end - 2)
        if start <= end { return Array(stops[start...end]) }
        return Array(stops[start...]) + Array(stops[...end])
    }
}
