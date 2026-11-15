import SwiftUI

enum TransitStyle {
    static let ink = Color(red: 0.09, green: 0.10, blue: 0.11)
    static let accent = Color(red: 0.24, green: 0.38, blue: 0.94)
}

struct PressFeedbackStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

struct CompactJourneyLine: View {
    @Environment(AppSettings.self) private var settings
    var journey: Journey
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if journey.legs.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Image(systemName: "figure.walk").font(.title2)
                    Text(journey.walking?.direct.map { distanceLabel($0.meters) } ?? settings.text("步行", "Walk"))
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
                }
                Text(settings.text("地圖步行路線", "Mapped walking route")).font(.caption).foregroundStyle(.secondary)
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        ForEach(Array(journey.legs.enumerated()), id: \.element.id) { index, leg in
                            if index > 0 { Image(systemName: "arrow.right").font(.caption).foregroundStyle(.secondary) }
                            RouteBadge(name: leg.routeName)
                        }
                    }
                    Text(journey.legs.map(\.routeName).joined(separator: " → ")).font(.system(.title, design: .rounded, weight: .bold))
                }
                Text(journey.legs.first!.from.stationName + " → " + journey.legs.last!.to.stationName).font(.subheadline).lineLimit(2)
                HStack(spacing: 12) {
                    Text(settings.text("\(journey.totalStops) 站", "\(journey.totalStops) stops"))
                    Text(journey.legs.count == 1 ? settings.text("直達", "Direct") : settings.text("\(journey.legs.count - 1) 次轉乘", "\(journey.legs.count - 1) transfers"))
                    let meters = journey.accessMeters + journey.egressMeters + journey.transferMeters
                    if meters > 0 { Label(distanceLabel(meters), systemImage: "figure.walk") }
                }.font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

func distanceLabel(_ meters: Double) -> String {
    meters >= 1_000 ? String(format: "%.1f km", meters / 1_000) : "\(Int(meters.rounded())) m"
}
