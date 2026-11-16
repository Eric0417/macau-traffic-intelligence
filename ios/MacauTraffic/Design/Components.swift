import SwiftUI

struct LivePolling<Value: Codable>: ViewModifier {
    @Environment(\.scenePhase) private var phase
    @State private var visible = false
    let resource: LiveResource<Value>
    let path: String
    let interval: Double
    var enabled: Bool = true
    var followSourceTTL = false
    func body(content: Content) -> some View {
        content.onAppear { visible = true }.onDisappear { visible = false }
            .task(id: "\(visible)-\(phase)-\(path)-\(enabled)") {
                if visible && phase == .active && enabled { await resource.poll(path, interval: interval, followSourceTTL: followSourceTTL) }
            }
    }
}
extension View {
    func livePolling<T>(_ resource: LiveResource<T>, path: String, interval: Double, enabled: Bool = true, followSourceTTL: Bool = false) -> some View {
        modifier(LivePolling(resource: resource, path: path, interval: interval, enabled: enabled, followSourceTTL: followSourceTTL))
    }
    func readingCard() -> some View {
        padding(18).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
    }
    func journeyExpansion(source: String, namespace: Namespace.ID) -> some View {
        modifier(JourneyExpansion(source: source, namespace: namespace))
    }
}

private struct JourneyExpansion: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var source: String
    var namespace: Namespace.ID
    @ViewBuilder func body(content: Content) -> some View {
        if reduceMotion { content }
        else { content.navigationTransition(.zoom(sourceID: source, in: namespace)) }
    }
}

struct SourceNote: View {
    @Environment(AppSettings.self) private var settings
    var meta: SourceMeta?
    var error: String? = nil
    var body: some View {
        if let meta {
            TimelineView(.periodic(from: .now, by: 2)) { context in
                VStack(alignment: .leading, spacing: 5) {
                    if error != nil || meta.isDelayed(at: context.date) {
                        Label(settings.text("資料延遲，請重新確認", "Delayed data. Check again."), systemImage: "clock.badge.exclamationmark")
                            .foregroundStyle(.orange)
                    }
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(meta.source.name)
                            Text(meta.source.text)
                            if let url = URL(string: meta.source.url) { Link(settings.text("官方來源", "Source website"), destination: url) }
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                    } label: {
                        HStack {
                            Label(settings.text("資料", "Source"), systemImage: "info.circle")
                            Spacer(minLength: 12)
                            if let date = Timestamp.date(meta.updatedAt) { Text(date.formatted(date: .omitted, time: .standard)) }
                        }
                    }
                }.font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct LoadState<Value: Codable>: View {
    @Environment(AppSettings.self) private var settings
    let resource: LiveResource<Value>
    let retry: () -> Void
    var body: some View {
        if resource.data == nil {
            if let error = resource.error {
                ContentUnavailableView {
                    Label(settings.text("暫時未能載入", "Unable to load"), systemImage: "wifi.exclamationmark")
                } description: { Text(error) } actions: {
                    Button(settings.text("再試一次", "Try again"), action: retry).buttonStyle(.borderedProminent)
                }
            } else { ProgressView(settings.text("正在取得資料", "Loading")).frame(maxWidth: .infinity).padding(40) }
        }
    }
}

struct RouteBadge: View {
    var name: String
    var color: Color = .blue
    var body: some View {
        Text(name).font(.system(.title3, design: .rounded, weight: .bold))
            .minimumScaleFactor(0.7).lineLimit(1).frame(minWidth: 54, minHeight: 46)
            .padding(.horizontal, 8).foregroundStyle(color)
            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 15))
            .accessibilityLabel(name)
    }
}

struct SaveButton: View {
    @Environment(AppSettings.self) private var settings
    var item: SavedItem
    var body: some View {
        Button {
            settings.toggle(item)
        } label: {
            Image(systemName: settings.saved.contains(where: { $0.id == item.id }) ? "star.fill" : "star")
        }
        .accessibilityLabel(settings.text("收藏", "Save"))
        .accessibilityValue(settings.saved.contains(where: { $0.id == item.id }) ? settings.text("已收藏", "Saved") : settings.text("未收藏", "Not saved"))
        .sensoryFeedback(.selection, trigger: settings.saved.count)
    }
}

func trafficColor(_ status: String) -> Color {
    switch status { case "normal", "clear", "green": .green; case "slow", "busy", "yellow": .orange; case "congested", "very_busy", "closed", "orange": .red; default: .gray }
}

extension Color {
    init(hex: String) {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted), radix: 16) ?? 0x007AFF
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}
