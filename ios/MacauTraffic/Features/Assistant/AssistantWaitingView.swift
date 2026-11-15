import SwiftUI

struct AssistantWaitingView: View {
    @Environment(AppSettings.self) private var settings
    var state: AssistantState
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let elapsed = max(0, Int(context.date.timeIntervalSince(state.startedAt ?? context.date)))
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    ProgressView()
                    Text(status)
                        .font(.subheadline.weight(.medium))
                    Spacer()
                    Text("\(elapsed)s").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
                if elapsed >= 8 {
                    Text(settings.text("仍在等候服務回覆。你可以停止，或先用手動規劃。", "Still waiting for the service. You can stop or use the manual planner.")).font(.caption).foregroundStyle(.secondary)
                    NavigationLink { ManualPlannerView() } label: { Label(settings.text("手動搵路", "Plan manually"), systemImage: "map") }.font(.subheadline)
                }
            }.padding(.vertical, 12)
        }.accessibilityIdentifier("assistant-waiting")
    }
    private var status: String {
        if state.answeringTraffic { return settings.text("正在整理資料", "Preparing the answer") }
        switch state.planningPhase {
        case "understanding": return settings.text("正在理解問題", "Understanding the request")
        case "comparing": return settings.text("正在比較路線", "Comparing routes")
        default: return settings.text("正在核對路線", "Checking routes")
        }
    }
}
