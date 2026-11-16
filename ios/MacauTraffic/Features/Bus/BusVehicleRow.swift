import SwiftUI
import MapKit

struct BusRoutePosition {
    var from: BusStop?
    var to: BusStop
}

extension BusVehicle {
    func routePosition(in eta: BusETA) -> BusRoutePosition? {
        if let segment = matchedSegment(in: eta) {
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
    private func matchedSegment(in eta: BusETA) -> BusSegment? {
        guard positionSource == "feed", let coordinates, let index = segmentIndex,
              eta.routeSegments.indices.contains(index) else { return nil }
        let segment = eta.routeSegments[index]
        let point = MKMapPoint(coordinates.location)
        let points = segment.coordinates.map { MKMapPoint($0.location) }
        for (start, end) in zip(points, points.dropFirst()) {
            let dx = end.x - start.x, dy = end.y - start.y
            let lengthSquared = dx * dx + dy * dy
            guard lengthSquared > 0 else { continue }
            let fraction = max(0, min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
            let distance = point.distance(to: MKMapPoint(x: start.x + fraction * dx, y: start.y + fraction * dy))
            if distance <= 100 { return segment }
        }
        return nil
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
    func nextVehicle(for target: BusStop, at now: Date) -> (vehicle: BusVehicle, position: BusRoutePosition)? {
        guard !target.suspended, let end = stops.firstIndex(where: { $0.id == target.id }) else { return nil }
        let loop = routeSegments.contains { $0.fromStationCode == stops.last?.stationCode && $0.toStationCode == stops.first?.stationCode }
        let predictedID = target.freshStatus(at: now)?.vehicleId ?? target.freshEstimate(at: now)?.vehicleId
        let candidates = vehicles.compactMap { vehicle -> (vehicle: BusVehicle, position: BusRoutePosition, distance: Int)? in
            guard predictedID == nil || vehicle.id == predictedID,
                  let position = vehicle.routePosition(in: self),
                  let to = stops.firstIndex(where: { $0.id == position.to.id }), to <= end || loop else { return nil }
            return (vehicle, position, (end - to + stops.count) % stops.count)
        }
        guard let next = candidates.min(by: { $0.distance < $1.distance }) else { return nil }
        return (next.vehicle, next.position)
    }
}
