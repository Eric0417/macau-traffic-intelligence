import SwiftUI

struct JourneyOptionCard: View {
    @Environment(AppSettings.self) private var settings
    var option: AssistantPlans.Option
    var index: Int
    var apply: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(option.title).font(.subheadline.weight(.semibold)).lineLimit(2)
            CompactJourneyLine(journey: option.journey)
            Button(action: apply) {
                Label(settings.text("用呢條路線", "Use this route"), systemImage: "arrow.up.right")
                    .font(.subheadline.weight(.semibold)).padding(.horizontal, 16).padding(.vertical, 8)
                    .frame(minHeight: 44).foregroundStyle(Color(.systemBackground)).background(Color(.label), in: Capsule())
            }.buttonStyle(PressFeedbackStyle()).accessibilityIdentifier("apply-route-\(index)")
            DisclosureGroup(settings.text("方案資料", "Route information")) {
                VStack(alignment: .leading, spacing: 10) {
                    AssistantReplyText(text: option.reason).textSelection(.enabled)
                    JourneySummary(journey: option.journey)
                }.padding(.top, 8)
            }.font(.caption).foregroundStyle(.secondary)
        }.padding(16).background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 22))
    }
}
