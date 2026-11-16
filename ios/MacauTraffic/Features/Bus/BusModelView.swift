import SwiftUI
import RealityKit
import MapKit
import Observation

@Observable @MainActor final class BusModelPose {
    var yaw: Float = 0
    var pitch: Float = 0
    static func yaw(bearing: Double, heading: Double) -> Float {
        // The exported bus faces +X; north is -Z in the map-aligned scene.
        Float((90 - bearing + heading) * .pi / 180)
    }
    func update(bearing: Double, heading: Double, pitch: Double) {
        yaw = Self.yaw(bearing: bearing, heading: heading)
        self.pitch = Float(max(0, min(80, pitch)) * .pi / 180)
    }
}

struct BusMapModel: View {
    var modelName: String
    var plate: String
    var pose: BusModelPose
    @State private var failed = false
    var body: some View {
        VStack(spacing: 0) {
            if failed {
                Image(systemName: "bus.fill").font(.system(size: 32)).frame(height: 84)
            } else {
                RealityView { content in
                    content.camera = .virtual
                    do {
                        let model = try await Entity(named: modelName)
                        let bounds = model.visualBounds(relativeTo: nil)
                        model.scale *= 1.2 / max(bounds.extents.x, bounds.extents.y, bounds.extents.z)
                        model.position -= model.visualBounds(relativeTo: nil).center
                        let root = Entity(); root.name = "bus-orientation"; root.addChild(model)
                        content.add(root)
                        let camera = PerspectiveCamera(); camera.name = "map-camera"
                        camera.camera.fieldOfViewInDegrees = 30
                        content.add(camera)
                        update(root: root, camera: camera)
                    } catch { failed = true }
                } update: { content in
                    if let root = content.entities.first(where: { $0.name == "bus-orientation" }),
                       let camera = content.entities.first(where: { $0.name == "map-camera" }) as? PerspectiveCamera {
                        update(root: root, camera: camera)
                    }
                }.frame(height: 84)
            }
            Text(plate).font(.system(.caption2, design: .monospaced, weight: .semibold))
                .padding(.horizontal, 8).padding(.vertical, 4).background(.regularMaterial, in: .capsule)
        }.frame(width: 120).allowsHitTesting(false)
    }
    private func update(root: Entity, camera: PerspectiveCamera) {
        root.orientation = simd_quatf(angle: pose.yaw, axis: [0, 1, 0])
        camera.look(at: .zero, from: [0, 2.8 * cos(pose.pitch), 2.8 * sin(pose.pitch)], upVector: [0, 0, -1], relativeTo: nil)
    }
}

final class BusModelAnnotationView: MKAnnotationView {
    private var host: UIHostingController<BusMapModel>?
    private let pose = BusModelPose()
    func configure(modelName: String, plate: String) {
        host?.view.removeFromSuperview()
        let controller = UIHostingController(rootView: BusMapModel(modelName: modelName, plate: plate, pose: pose))
        controller.view.backgroundColor = .clear
        controller.view.isUserInteractionEnabled = false
        controller.view.frame = CGRect(x: 0, y: 0, width: 120, height: 110)
        frame = controller.view.frame
        addSubview(controller.view)
        host = controller
        centerOffset = CGPoint(x: 0, y: 13)
        displayPriority = .required
        zPriority = .max
        isAccessibilityElement = true
        accessibilityLabel = plate
        accessibilityIdentifier = "map-bus-model"
    }
    func updatePose(bearing: Double, camera: MKMapCamera) {
        pose.update(bearing: bearing, heading: camera.heading, pitch: camera.pitch)
        #if DEBUG
        accessibilityValue = String(format: "bearing=%.0f;heading=%.0f;pitch=%.0f", bearing, camera.heading, camera.pitch)
        #endif
    }
    override func prepareForReuse() {
        super.prepareForReuse()
        host?.view.removeFromSuperview(); host = nil
    }
}
