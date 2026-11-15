import SwiftUI

struct JourneyOptionCard: View {
    @Environment(AppSettings.self) private var settings
    var option: AssistantPlans.Option
    var index: Int
    var apply: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text(option.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                Spacer(minLength: 12)
                Text(String(format: "%02d", index + 1)).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
            }
            CompactJourneyLine(journey: option.journey)
            Button(action: apply) {
                HStack {
                    Text(settings.text("用呢條路線", "Use this route"))
                    Spacer()
                    Image(systemName: "arrow.up.right")
                }.font(.subheadline.weight(.semibold)).padding(16)
                    .foregroundStyle(.white).background(TransitStyle.ink, in: .rect(cornerRadius: 18))
            }.buttonStyle(PressFeedbackStyle()).accessibilityIdentifier("apply-route-\(index)")
            DisclosureGroup(settings.text("方案資料", "Route information")) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(option.reason).textSelection(.enabled)
                    JourneySummary(journey: option.journey)
                }.padding(.top, 8)
            }.font(.caption).foregroundStyle(.secondary)
        }.padding(20).background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 26))
    }
}
