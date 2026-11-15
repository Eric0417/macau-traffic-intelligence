import SwiftUI

struct ExploreView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    @State private var roads = LiveResource<LineCollection<Road>>()
    @State private var weather = LiveResource<Weather>()
    @State private var showTraffic = false
    @State private var focus: Coordinate?
    @State private var error: String?
    var body: some View {
        TransitMap(lines: showTraffic ? roadLines : [], focus: focus, controlTopPadding: 170)
            .ignoresSafeArea(edges: .top)
            .safeAreaInset(edge: .top, spacing: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(settings.text("澳門", "Macau")).font(.system(.title, weight: .semibold))
                    }
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 5)) { context in
                        if weather.fresh(at: context.date), let temperature = weather.data?.temperatureCelsius {
                            Label("\(Int(temperature))°", systemImage: "thermometer.medium").font(.headline).padding(12).glassEffect()
                        }
                    }
                }.padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 16)
                .background(LinearGradient(colors: [Color(.systemBackground).opacity(0.94), Color(.systemBackground).opacity(0)], startPoint: .top, endPoint: .bottom))
            }
            .safeAreaInset(edge: .bottom, spacing: 16) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Button { showTraffic.toggle() } label: { Label(settings.text("路況", "Traffic"), systemImage: "car.side.fill").padding(.vertical, 5) }
                            .buttonStyle(.glass).tint(showTraffic ? .blue : .primary)
                        Spacer()
                        Button {
                            Task { do { focus = try await location.request() } catch { self.error = error.localizedDescription } }
                        } label: { Image(systemName: "location.fill").frame(width: 44, height: 44) }
                            .buttonStyle(.plain).glassEffect(.regular.interactive(), in: .circle).disabled(location.locating)
                            .accessibilityLabel(settings.text("顯示目前位置", "Show my location"))
                    }
                    NavigationLink { ManualPlannerView() } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "magnifyingglass").font(.title3.weight(.medium)).foregroundStyle(.primary)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(settings.text("去邊？", "Where to?")).font(.title3.weight(.semibold)).foregroundStyle(.primary)
                            }
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.title3).foregroundStyle(.primary)
                        }.padding(22).glassEffect(.regular.interactive(), in: .rect(cornerRadius: 28))
                    }.buttonStyle(.plain).accessibilityIdentifier("explore-search")
                    if showTraffic {
                        HStack(spacing: 12) {
                            Label(settings.text("暢通", "Clear"), systemImage: "circle.fill").foregroundStyle(.green)
                            Label(settings.text("緩慢", "Slow"), systemImage: "circle.fill").foregroundStyle(.orange)
                            Label(settings.text("擠塞", "Busy"), systemImage: "circle.fill").foregroundStyle(.red)
                        }.font(.caption).padding(12).background(.regularMaterial, in: Capsule())
                        SourceNote(meta: roads.meta, error: roads.error).padding(12).background(.regularMaterial, in: .rect(cornerRadius: 16))
                        Text(settings.text("顏色只代表官方監測路段", "Colors cover officially monitored segments only")).font(.caption2).foregroundStyle(.secondary)
                    }
                }.padding(.horizontal, 20).padding(.bottom, 8)
                .frame(maxWidth: 580)
            }
            .toolbar(.hidden, for: .navigationBar)
            .livePolling(weather, path: "weather", interval: 60)
            .livePolling(roads, path: "traffic/roads", interval: 60)
            .alert(settings.text("定位未能完成", "Location unavailable"), isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button(settings.text("好", "OK")) { error = nil }
            } message: { Text(error ?? "") }
    }
    private var roadLines: [MapLine] {
        (roads.data?.features ?? []).map { .init(id: $0.properties.id, coordinates: $0.geometry.coordinates, color: trafficColor($0.properties.status), width: 3) }
    }
}
