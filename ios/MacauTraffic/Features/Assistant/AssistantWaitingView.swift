import SwiftUI

struct AssistantWaitingView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var glowing = false
    var body: some View {
        Circle()
            .fill(.primary)
            .frame(width: 12, height: 12)
            .opacity(reduceMotion || glowing ? 1 : 0.3)
            .scaleEffect(reduceMotion || glowing ? 1 : 0.85)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.85).repeatForever(autoreverses: true), value: glowing)
            .onAppear { glowing = true }
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(settings.text("正在回覆", "Preparing a reply"))
            .accessibilityIdentifier("assistant-waiting-dot")
    }
}
