import SwiftUI

struct WalkingConnectionView: View {
    @Environment(AppSettings.self) private var settings
    var from: Coordinate; var to: Coordinate; var path: WalkingPath?; var title: String
    private var mapped: Bool { path?.matches(from: from, to: to) == true }
    private var meters: Double { mapped ? path!.meters : from.distance(to: to) }
    var body: some View {
        Section {
            Label(title, systemImage: "figure.walk")
            Text("\(Int(meters)) m · " + (mapped ? settings.text("地圖步行", "Mapped walk") : settings.text("直線，步行未核實", "Straight line, walk unverified"))).font(.subheadline).foregroundStyle(.secondary)
            if let url {
                Link(settings.text("步行導航", "Walking directions"), destination: url)
                Text(settings.text("起終點會分享畀 Apple 地圖。", "Shares endpoints with Apple Maps.")).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
    private var url: URL? {
        var components = URLComponents(string: "https://maps.apple.com/")!
        components.queryItems = [
            .init(name: "saddr", value: "\(from.latitude),\(from.longitude)"),
            .init(name: "daddr", value: "\(to.latitude),\(to.longitude)"),
            .init(name: "dirflg", value: "w")
        ]
        return components.url
    }
}
