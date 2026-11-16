import SwiftUI
import RealityKit

struct BusModelView: View {
    @Environment(AppSettings.self) private var settings
    var company: BusCompany
    @State private var failed = false
    var body: some View {
        VStack(spacing: 8) {
            if failed {
                Image(systemName: "bus.fill").font(.system(size: 52)).frame(height: 180)
            } else {
                RealityView { content in
                    content.camera = .virtual
                    do {
                        let model = try await Entity(named: company.color == "orange" ? "bus-tcm.usdz" : "bus-transmac.usdz")
                        model.scale *= 1.8
                        model.orientation = simd_quatf(angle: .pi / 12, axis: [1, 0, 0]) * simd_quatf(angle: .pi / 5, axis: [0, 1, 0])
                        content.add(model)
                        content.cameraTarget = model
                    } catch { failed = true }
                }.realityViewCameraControls(.orbit).frame(height: 200)
            }
            Text(settings.text("車款示意", "Illustrative model")).font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity).accessibilityIdentifier("bus-model")
    }
}
