import SwiftUI
import MapKit
import Observation

struct MapLine: Identifiable, Equatable {
    var id: String
    var coordinates: [Coordinate]
    var color: Color = .blue
    var dashed = false
    var width: CGFloat = 5
}
struct MapPin: Identifiable, Equatable {
    var id: String
    var coordinate: Coordinate
    var title: String
    var symbol = "mappin"
    var color: Color = .blue
    var modelName: String?
    var bearing: Double?
}

@Observable @MainActor final class MapViewport {
    private(set) var pitched = false
    @ObservationIgnored weak var map: MKMapView?

    func focus(_ coordinate: Coordinate, animated: Bool = true) {
        guard let map else { return }
        let camera = MKMapCamera(lookingAtCenter: coordinate.location, fromDistance: 1_600, pitch: map.camera.pitch, heading: map.camera.heading)
        map.setCamera(camera, animated: animated)
    }
    func togglePerspective(animated: Bool = true) {
        guard let map else { return }
        let current = map.camera
        let camera = MKMapCamera(lookingAtCenter: current.centerCoordinate, fromDistance: current.centerCoordinateDistance, pitch: current.pitch > 10 ? 0 : 55, heading: current.heading)
        map.setCamera(camera, animated: animated)
        pitched = camera.pitch > 10
    }
    func update() { pitched = (map?.camera.pitch ?? 0) > 10 }
}

struct TransitMap: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var lines: [MapLine] = []
    var pins: [MapPin] = []
    var fitID = "macau"
    var focus: Coordinate?
    var controlTopPadding: CGFloat = 12
    var viewport: MapViewport?
    var showsPerspective = true
    var fitPadding = UIEdgeInsets(top: 70, left: 40, bottom: 60, right: 40)
    var fitCoordinates: [Coordinate]?
    var onSelect: ((String) -> Void)?
    @State private var ownViewport = MapViewport()
    static let macau = MKCoordinateRegion(center: .init(latitude: 22.171, longitude: 113.555), span: .init(latitudeDelta: 0.10, longitudeDelta: 0.085))
    private var camera: MapViewport { viewport ?? ownViewport }

    var body: some View {
        NativeTransitMap(lines: lines, pins: pins, fitID: fitID, fitPadding: fitPadding, fitCoordinates: fitCoordinates, viewport: camera, animated: !reduceMotion, onSelect: onSelect)
            .overlay(alignment: .topTrailing) {
                if showsPerspective {
                    PerspectiveButton(viewport: camera).padding(.horizontal, 16).padding(.top, controlTopPadding)
                }
            }
            .onChange(of: focus) { _, value in if let value { camera.focus(value, animated: !reduceMotion) } }
    }
}

struct PerspectiveButton: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var viewport: MapViewport
    var body: some View {
        Button { viewport.togglePerspective(animated: !reduceMotion) } label: {
            Text(viewport.pitched ? "2D" : "3D").font(.system(.subheadline, design: .rounded, weight: .bold)).frame(width: 48, height: 48).contentShape(Circle())
        }
        .buttonStyle(.plain).glassEffect(.regular.interactive(), in: .circle)
        .accessibilityLabel(settings.text("切換地圖角度", "Change map perspective"))
        .accessibilityValue(viewport.pitched ? "3D" : "2D")
        .sensoryFeedback(.selection, trigger: viewport.pitched)
    }
}

struct MapStroke: Hashable {
    var color: Color
    var dashed: Bool
    var width: CGFloat
}
struct MapOverlayBatch {
    var overlay: MKMultiPolyline
    var stroke: MapStroke
    static func make(_ lines: [MapLine]) -> [MapOverlayBatch] {
        var groups: [MapStroke: [MKPolyline]] = [:]
        var order: [MapStroke] = []
        for line in lines where line.coordinates.count > 1 {
            let stroke = MapStroke(color: line.color, dashed: line.dashed, width: line.width)
            if groups[stroke] == nil { order.append(stroke) }
            let coordinates = line.coordinates.map(\.location)
            groups[stroke, default: []].append(MKPolyline(coordinates: coordinates, count: coordinates.count))
        }
        return order.map { .init(overlay: MKMultiPolyline(groups[$0]!), stroke: $0) }
    }
}

struct NativeTransitMap: UIViewRepresentable {
    var lines: [MapLine]
    var pins: [MapPin]
    var fitID: String
    var fitPadding: UIEdgeInsets
    var fitCoordinates: [Coordinate]?
    var viewport: MapViewport
    var animated: Bool
    var onSelect: ((String) -> Void)?

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        let configuration = MKStandardMapConfiguration(elevationStyle: .realistic, emphasisStyle: .muted)
        configuration.pointOfInterestFilter = .excludingAll
        map.preferredConfiguration = configuration
        map.showsUserLocation = true
        map.showsCompass = true
        map.showsScale = true
        map.isPitchEnabled = true
        map.setRegion(TransitMap.macau, animated: false)
        map.delegate = context.coordinator
        map.accessibilityIdentifier = "transit-map"
        viewport.map = map
        return map
    }
    func updateUIView(_ map: MKMapView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        viewport.map = map
        let margins = NSDirectionalEdgeInsets(top: fitPadding.top, leading: 16, bottom: fitPadding.bottom, trailing: 16)
        if map.directionalLayoutMargins != margins { map.directionalLayoutMargins = margins }
        if coordinator.lines != lines {
            map.removeOverlays(map.overlays)
            coordinator.lines = lines
            coordinator.batches = MapOverlayBatch.make(lines)
            map.addOverlays(coordinator.batches.map(\.overlay), level: .aboveRoads)
        }
        coordinator.updatePins(pins, on: map)
        if coordinator.fitID != fitID, fitID != "macau" {
            let points = fitCoordinates ?? (lines.flatMap(\.coordinates) + pins.filter { $0.symbol != "bus.fill" }.map(\.coordinate))
            if !points.isEmpty {
                coordinator.fitID = fitID
                DispatchQueue.main.async { [weak map] in
                    guard let map, coordinator.fitID == fitID else { return }
                    Self.fit(points, on: map, animated: animated)
                }
            }
        }
    }
    static func dismantleUIView(_ map: MKMapView, coordinator: Coordinator) {
        map.delegate = nil
        if coordinator.parent.viewport.map === map { coordinator.parent.viewport.map = nil }
    }
    static func fit(_ points: [Coordinate], on map: MKMapView, animated: Bool) {
        guard let first = points.first else { return }
        var rect = MKMapRect(origin: MKMapPoint(first.location), size: .init(width: 1, height: 1))
        for point in points.dropFirst() { rect = rect.union(MKMapRect(origin: MKMapPoint(point.location), size: .init(width: 1, height: 1))) }
        rect = rect.insetBy(dx: -max(rect.width * 0.08, 500), dy: -max(rect.height * 0.08, 500))
        map.setVisibleMapRect(rect, edgePadding: .zero, animated: animated)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: NativeTransitMap
        var lines: [MapLine] = []
        var batches: [MapOverlayBatch] = []
        var annotations: [String: TransitAnnotation] = [:]
        var fitID: String?
        init(_ parent: NativeTransitMap) { self.parent = parent }
        func updatePins(_ pins: [MapPin], on map: MKMapView) {
            let ids = Set(pins.map(\.id))
            for id in Array(annotations.keys) where !ids.contains(id) {
                if let annotation = annotations.removeValue(forKey: id) { map.removeAnnotation(annotation) }
            }
            for pin in pins {
                if let annotation = annotations[pin.id] {
                    if annotation.pin != pin {
                        if annotation.pin.modelName != pin.modelName {
                            map.removeAnnotation(annotation)
                            let replacement = TransitAnnotation(pin)
                            annotations[pin.id] = replacement
                            map.addAnnotation(replacement)
                            continue
                        }
                        annotation.pin = pin
                        annotation.coordinate = pin.coordinate.location
                        annotation.title = pin.title
                        if let view = map.view(for: annotation) as? MKMarkerAnnotationView { configure(view, with: pin) }
                        if let view = map.view(for: annotation) as? BusModelAnnotationView, let bearing = pin.bearing { view.updatePose(bearing: bearing, camera: map.camera) }
                    }
                } else {
                    let annotation = TransitAnnotation(pin)
                    annotations[pin.id] = annotation
                    map.addAnnotation(annotation)
                }
            }
        }
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let polyline = overlay as? MKMultiPolyline, let batch = batches.first(where: { $0.overlay === polyline }) else { return MKOverlayRenderer(overlay: overlay) }
            let renderer = MKMultiPolylineRenderer(multiPolyline: polyline)
            renderer.strokeColor = UIColor(batch.stroke.color)
            renderer.lineWidth = batch.stroke.width
            renderer.lineCap = .round; renderer.lineJoin = .round
            if batch.stroke.dashed { renderer.lineDashPattern = [7, 6] }
            return renderer
        }
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let annotation = annotation as? TransitAnnotation else { return nil }
            if let modelName = annotation.pin.modelName {
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: "bus-model") as? BusModelAnnotationView ?? BusModelAnnotationView(annotation: annotation, reuseIdentifier: "bus-model")
                view.annotation = annotation
                view.configure(modelName: modelName, plate: annotation.pin.title)
                if let bearing = annotation.pin.bearing { view.updatePose(bearing: bearing, camera: mapView.camera) }
                return view
            }
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: "transit") as? MKMarkerAnnotationView ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: "transit")
            view.annotation = annotation
            configure(view, with: annotation.pin)
            return view
        }
        private func configure(_ view: MKMarkerAnnotationView, with pin: MapPin) {
            view.markerTintColor = UIColor(pin.color)
            view.glyphImage = UIImage(systemName: pin.symbol)
            view.titleVisibility = .adaptive
            view.canShowCallout = parent.onSelect == nil
            view.accessibilityLabel = pin.title
        }
        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            guard let annotation = view.annotation as? TransitAnnotation, let select = parent.onSelect else { return }
            select(annotation.pin.id)
            mapView.deselectAnnotation(annotation, animated: false)
        }
        func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
            for annotation in annotations.values where annotation.pin.modelName != nil {
                if let view = mapView.view(for: annotation) as? BusModelAnnotationView, let bearing = annotation.pin.bearing {
                    view.updatePose(bearing: bearing, camera: mapView.camera)
                }
            }
        }
        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            parent.viewport.update()
            #if DEBUG
            let center = mapView.centerCoordinate
            mapView.accessibilityValue = String(format: "%.5f,%.5f;pitch=%.0f;overlays=%d;span=%.5f", center.latitude, center.longitude, mapView.camera.pitch, mapView.overlays.count, mapView.region.span.latitudeDelta)
            #endif
        }
    }
}

final class TransitAnnotation: NSObject, MKAnnotation {
    var pin: MapPin
    @objc dynamic var coordinate: CLLocationCoordinate2D
    @objc dynamic var title: String?
    init(_ pin: MapPin) { self.pin = pin; coordinate = pin.coordinate.location; title = pin.title }
}
