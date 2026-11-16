import SwiftUI
import MapKit

extension BusVehicle {
    func segmentNames(in eta: BusETA) -> (String, String)? {
        guard positionSource == "feed", let coordinates, let index = segmentIndex,
              eta.routeSegments.indices.contains(index) else { return nil }
        let segment = eta.routeSegments[index]
        let point = MKMapPoint(coordinates.location)
        let points = segment.coordinates.map { MKMapPoint($0.location) }
        let onSegment = zip(points, points.dropFirst()).contains { start, end in
            let dx = end.x - start.x, dy = end.y - start.y
            let lengthSquared = dx * dx + dy * dy
            let fraction = lengthSquared == 0 ? 0 : max(0, min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
            return point.distance(to: MKMapPoint(x: start.x + fraction * dx, y: start.y + fraction * dy)) <= 100
        }
        guard onSegment else { return nil }
        guard let from = eta.stops.first(where: { $0.stationCode == segment.fromStationCode }),
              let to = eta.stops.first(where: { $0.stationCode == segment.toStationCode }) else { return nil }
        return (from.stationName, to.stationName)
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
