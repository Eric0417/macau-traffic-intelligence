import SwiftUI

struct JourneyMapSnapshot {
    var lines: [MapLine]
    var pins: [MapPin]
    var fitCoordinates: [Coordinate] { lines.flatMap(\.coordinates) + pins.filter { $0.symbol != "bus.fill" }.map(\.coordinate) }
    @MainActor init(selection: JourneySelection, live: JourneyLiveState, now: Date) {
        let features = live.selectionID == selection.id ? live.geometry?.collection.features ?? [] : []
        lines = features.enumerated().compactMap { index, item in
            guard let coordinates = item.geometry.line else { return nil }
            return .init(id: "journey-\(index)", coordinates: coordinates, color: item.properties.kind == "walking-path" ? TransitStyle.accent : Color(hex: item.properties.color ?? "#8E8E93"), dashed: item.properties.kind == "walk", width: item.properties.width ?? 5)
        }
        pins = features.enumerated().compactMap { index, item in
            guard let coordinate = item.geometry.point, item.properties.kind != "walk-label", item.properties.kind != "vehicle" else { return nil }
            return .init(id: "journey-\(index)", coordinate: coordinate, title: item.properties.label ?? "", symbol: "mappin", color: Color(hex: item.properties.color ?? "#007AFF"))
        }
        if pins.isEmpty {
            pins = [.init(id: "origin", coordinate: selection.origin.coordinates, title: selection.origin.name, symbol: "circle.fill", color: .blue),
                    .init(id: "destination", coordinate: selection.destination.coordinates, title: selection.destination.name, symbol: "flag.fill", color: .red)]
        }
        guard !selection.future, live.selectionID == selection.id else { return }
        pins += selection.journey.legs.flatMap { leg in
            guard !live.errors.contains(leg.id), let envelope = live.envelopes[leg.id], !envelope.meta.isDelayed(at: now), envelope.data.routeCode == leg.routeCode, envelope.data.direction == leg.direction else { return [MapPin]() }
            return envelope.data.vehicles.compactMap { vehicle in
                guard vehicle.positionSource == "feed", let coordinate = vehicle.coordinates else { return nil }
                return MapPin(id: "vehicle:\(leg.id):\(vehicle.id)", coordinate: coordinate, title: leg.routeName + " · " + vehicle.plate, symbol: "bus.fill")
            }
        }
    }
}
