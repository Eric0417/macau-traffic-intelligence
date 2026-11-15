import SwiftUI
import MapKit

struct MapLine: Identifiable {
    var id: String
    var coordinates: [Coordinate]
    var color: Color = .blue
    var dashed = false
    var width: CGFloat = 5
}
struct MapPin: Identifiable {
    var id: String
    var coordinate: Coordinate
    var title: String
    var symbol = "mappin"
    var color: Color = .blue
}

struct TransitMap: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var lines: [MapLine] = []
    var pins: [MapPin] = []
    var fitID = "macau"
    var focus: Coordinate?
    var onSelect: ((String) -> Void)?
    @State private var position: MapCameraPosition = .region(Self.macau)
    @State private var selection: String?
    @State private var tilted = false
    static let macau = MKCoordinateRegion(center: .init(latitude: 22.171, longitude: 113.555), span: .init(latitudeDelta: 0.10, longitudeDelta: 0.085))

    var body: some View {
        Map(position: $position, selection: $selection) {
            ForEach(lines) { line in
                MapPolyline(coordinates: line.coordinates.map(\.location))
                    .stroke(line.color, style: StrokeStyle(lineWidth: line.width, lineCap: .round, lineJoin: .round, dash: line.dashed ? [7, 6] : []))
            }
            ForEach(pins) { pin in
                Marker(pin.title, systemImage: pin.symbol, coordinate: pin.coordinate.location).tint(pin.color).tag(pin.id)
            }
            UserAnnotation()
        }
        .mapStyle(.standard(elevation: .realistic, pointsOfInterest: .excludingAll))
        .mapControls { MapCompass(); MapScaleView() }
        .overlay(alignment: .topTrailing) {
            Button {
                tilted.toggle()
                let center = position.region?.center ?? position.camera?.centerCoordinate ?? Self.macau.center
                let camera = MapCamera(centerCoordinate: center, distance: tilted ? 6500 : 11000, heading: 0, pitch: tilted ? 55 : 0)
                withAnimation(reduceMotion ? nil : .smooth) { position = .camera(camera) }
            } label: { Text(tilted ? "2D" : "3D").font(.subheadline.weight(.semibold)).frame(width: 44, height: 44) }
                .buttonStyle(.glass).padding(12)
                .accessibilityLabel(settings.text("切換地圖角度", "Change map perspective"))
        }
        .onChange(of: selection) { _, value in if let value { onSelect?(value) } }
        .onChange(of: fitID, initial: true) { _, _ in fit() }
        .onChange(of: focus) { _, value in
            if let value { withAnimation(reduceMotion ? nil : .smooth) { position = .region(.init(center: value.location, span: .init(latitudeDelta: 0.012, longitudeDelta: 0.012))) } }
        }
        .accessibilityIdentifier("transit-map")
    }
    private func fit() {
        let points = lines.flatMap(\.coordinates) + pins.filter { $0.symbol != "bus.fill" }.map(\.coordinate)
        guard let first = points.first else { return }
        var rect = MKMapRect(origin: MKMapPoint(first.location), size: .init(width: 1, height: 1))
        for coordinate in points.dropFirst() { rect = rect.union(MKMapRect(origin: MKMapPoint(coordinate.location), size: .init(width: 1, height: 1))) }
        position = .rect(rect.insetBy(dx: -max(rect.width * 0.2, 900), dy: -max(rect.height * 0.2, 900)))
    }
}
