import SwiftUI

struct CityView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var weather = LiveResource<Weather>()
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                NavigationLink { WeatherView() } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(settings.text("澳門天氣", "Macau weather")).font(.subheadline.weight(.medium))
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.subheadline)
                        }.foregroundStyle(.secondary)
                        HStack(alignment: .bottom) {
                            Text(weather.data?.temperatureCelsius.map { "\(Int($0))°" } ?? "—")
                                .font(.system(size: 100, weight: .bold, design: .rounded)).tracking(-7).lineLimit(1).minimumScaleFactor(0.65).contentTransition(.numericText())
                            Spacer()
                            if !typeSize.isAccessibilitySize, let humidity = weather.data?.humidityPercent {
                                VStack(alignment: .trailing, spacing: 4) {
                                    Text("\(Int(humidity))%").font(.system(.title2, design: .rounded, weight: .semibold))
                                    Text(settings.text("濕度", "Humidity")).font(.caption).foregroundStyle(.secondary)
                                }.padding(.bottom, 18)
                            }
                        }
                        if typeSize.isAccessibilitySize, let humidity = weather.data?.humidityPercent {
                            Text(settings.text("濕度", "Humidity") + " \(Int(humidity))%").font(.title3).fixedSize(horizontal: false, vertical: true)
                        }
                    }.padding(24).background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 30))
                }.buttonStyle(PressFeedbackStyle())
                if let warning = weather.data?.warnings.first(where: \.active) {
                    Label(warning.text, systemImage: "exclamationmark.triangle.fill").font(.subheadline).foregroundStyle(.orange)
                }
                TimelineView(.periodic(from: .now, by: 2)) { context in
                    if weather.error != nil || weather.meta?.isDelayed(at: context.date) == true { Text(settings.text("天氣資料延遲", "Weather data delayed")).font(.caption).foregroundStyle(.orange) }
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 12) {
                    NavigationLink { LRTView() } label: { CityTile(title: settings.text("輕軌", "Light rail"), symbol: "tram.fill", color: .teal) }
                    NavigationLink { ParkingView() } label: { CityTile(title: settings.text("泊車", "Parking"), symbol: "parkingsign", color: TransitStyle.accent) }
                    NavigationLink { NoticesView() } label: { CityTile(title: settings.text("消息", "Updates"), symbol: "text.bubble.fill", color: .orange) }
                    NavigationLink { CamerasView() } label: { CityTile(title: settings.text("鏡頭", "Cameras"), symbol: "video.fill", color: .primary) }
                }.buttonStyle(PressFeedbackStyle())
                VStack(spacing: 0) {
                    NavigationLink { TrafficView() } label: { CityRow(title: settings.text("道路與大橋", "Roads and bridges"), symbol: "car.side.fill") }
                    Divider().padding(.leading, 52)
                    NavigationLink { BordersView() } label: { CityRow(title: settings.text("口岸", "Border crossings"), symbol: "door.left.hand.open") }
                    Divider().padding(.leading, 52)
                    NavigationLink { ManualPlannerView() } label: { CityRow(title: settings.text("行程規劃", "Journey planner"), symbol: "point.topleft.down.to.point.bottomright.curvepath") }
                    Divider().padding(.leading, 52)
                    NavigationLink { SourceStatusView() } label: { CityRow(title: settings.text("資料來源", "Sources"), symbol: "info.circle") }
                }.buttonStyle(.plain)
            }.padding(20)
        }.background(Color(.systemGroupedBackground))
        .navigationTitle(settings.text("城市", "City"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { SavedView() } label: { Image(systemName: "star") }.accessibilityLabel(settings.text("收藏", "Saved"))
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { SettingsView() } label: { Image(systemName: "slider.horizontal.3") }.accessibilityLabel(settings.text("設定", "Settings"))
            }
        }
        .livePolling(weather, path: "weather", interval: 60)
        .refreshable { await weather.load("weather") }
    }
}

private struct CityTile: View {
    var title: String
    var symbol: String
    var color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Image(systemName: symbol).font(.system(size: 32, weight: .semibold)).foregroundStyle(color)
                .shadow(color: color.opacity(0.16), radius: 0, y: 3)
            HStack {
                Text(title).font(.headline)
                Spacer()
                Image(systemName: "arrow.up.right").font(.caption.weight(.medium)).foregroundStyle(.secondary)
            }
        }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 26))
    }
}

struct CityRow: View {
    var title: String; var symbol: String
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: symbol).font(.title3).foregroundStyle(.primary).frame(width: 36, height: 42)
            Text(title).font(.body)
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }.padding(.vertical, 5).contentShape(Rectangle())
    }
}

struct WeatherView: View {
    @Environment(AppSettings.self) private var settings
    @State private var resource = LiveResource<Weather>()
    var body: some View {
        List {
            LoadState(resource: resource) { Task { await resource.load("weather") } }
            if let value = resource.data {
                Section {
                    Text(value.temperatureCelsius.map { "\(Int($0))°" } ?? "—").font(.system(size: 80, weight: .light, design: .rounded)).frame(maxWidth: .infinity).padding(24)
                    if let date = Timestamp.date(value.observedAt) { Text(settings.text("觀測時間：", "Observed: ") + date.formatted()).font(.caption).foregroundStyle(.secondary) }
                    LabeledContent(settings.text("濕度", "Humidity"), value: value.humidityPercent.map { "\(Int($0))%" } ?? "—")
                    LabeledContent(settings.text("風向及風速", "Wind"), value: value.wind ?? "—")
                }
                Section(settings.text("預報", "Forecast")) { Text(value.forecast ?? settings.text("未有預報", "Forecast unavailable")).textSelection(.enabled) }
                Section(settings.text("天氣警告", "Weather warnings")) {
                    if value.warnings.filter(\.active).isEmpty { Text(settings.text("呢次資料未列出有效警告", "No active warnings in this response")) }
                    ForEach(Array(value.warnings.enumerated()), id: \.offset) { _, warning in
                        VStack(alignment: .leading, spacing: 7) {
                            Label(warning.type, systemImage: "exclamationmark.triangle").foregroundStyle(warning.active ? .orange : .secondary)
                            Text(warning.text)
                            if let date = Timestamp.date(warning.updatedAt) { Text(date.formatted()).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
                SourceNote(meta: resource.meta, error: resource.error)
            }
        }.navigationTitle(settings.text("天氣", "Weather"))
            .livePolling(resource, path: "weather", interval: 60)
            .refreshable { await resource.load("weather") }
    }
}

struct TrafficView: View {
    @Environment(AppSettings.self) private var settings
    @State private var roads = LiveResource<LineCollection<Road>>()
    @State private var bridges = LiveResource<[Bridge]>()
    @State private var query = ""
    @State private var focus: Coordinate?
    var body: some View {
        List {
            Section {
                TransitMap(lines: (roads.data?.features ?? []).map { .init(id: $0.properties.id, coordinates: $0.geometry.coordinates, color: trafficColor($0.properties.status), width: 3) }, focus: focus).frame(height: 300).listRowInsets(EdgeInsets())
                Text(settings.text("灰色道路冇官方路況資料，唔代表暢通。", "Gray roads have no official traffic status; they are not confirmed clear.")).font(.caption).foregroundStyle(.secondary)
            }
            Section(settings.text("大橋行車時間", "Bridge travel times")) {
                LoadState(resource: bridges) { Task { await bridges.load("traffic/bridges") } }
                ForEach(bridges.data ?? []) { bridge in
                    HStack {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(bridge.name.value(settings.language)).font(.headline)
                            Text(bridge.direction == "northbound" ? settings.text("北行", "Northbound") : settings.text("南行", "Southbound")).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(settings.text("\(Int(bridge.runtimeSeconds)) 秒", "\(Int(bridge.runtimeSeconds)) sec")).font(.title3.monospacedDigit()).foregroundStyle(trafficColor(bridge.status))
                    }.padding(.vertical, 4)
                }
                SourceNote(meta: bridges.meta, error: bridges.error)
            }
            Section(settings.text("監測路段", "Monitored roads")) {
                LoadState(resource: roads) { Task { await roads.load("traffic/roads") } }
                ForEach((roads.data?.features ?? []).filter { query.isEmpty ? $0.properties.status != "normal" : $0.properties.name.value(settings.language).localizedCaseInsensitiveContains(query) }, id: \.properties.id) { feature in
                    Button { focus = feature.geometry.coordinates.first } label: {
                        HStack {
                            Text(feature.properties.name.value(settings.language)).foregroundStyle(.primary)
                            Spacer()
                            Text(statusName(feature.properties.status, settings)).font(.caption).foregroundStyle(trafficColor(feature.properties.status))
                        }
                    }
                }
                SourceNote(meta: roads.meta, error: roads.error)
            }
        }.navigationTitle(settings.text("道路與大橋", "Roads and bridges"))
            .searchable(text: $query, prompt: settings.text("搜尋道路", "Search roads"))
            .livePolling(roads, path: "traffic/roads", interval: 60)
            .livePolling(bridges, path: "traffic/bridges", interval: 60)
    }
}

@MainActor func statusName(_ status: String, _ settings: AppSettings) -> String {
    switch status {
    case "normal", "clear": settings.text("暢通", "Clear")
    case "slow", "busy": settings.text("繁忙", "Busy")
    case "congested", "very_busy": settings.text("擠塞", "Congested")
    case "closed": settings.text("關閉", "Closed")
    default: settings.text("未有資料", "Unknown")
    }
}

struct BordersView: View {
    @Environment(AppSettings.self) private var settings
    @State private var resource = LiveResource<[Border]>()
    var body: some View {
        List {
            LoadState(resource: resource) { Task { await resource.load("borders") } }
            ForEach(resource.data ?? []) { border in
                Section {
                    HStack { Text(border.name.value(settings.language)).font(.headline); Spacer(); Text(statusName(border.status, settings)).foregroundStyle(trafficColor(border.status)) }
                    if let date = Timestamp.date(border.updatedAt) { Text(settings.text("官方更新：", "Publisher update: ") + date.formatted()).font(.caption).foregroundStyle(.secondary) }
                    if let url = URL(string: border.sourceUrl) { Link(settings.text("查看官方資訊", "Official information"), destination: url) }
                }
            }
            Text(settings.text("官方狀態並非輪候分鐘預測。", "The official status is not a waiting-time prediction.")).font(.footnote).foregroundStyle(.secondary)
            SourceNote(meta: resource.meta, error: resource.error)
        }.navigationTitle(settings.text("口岸", "Border crossings"))
            .livePolling(resource, path: "borders", interval: 60)
            .refreshable { await resource.load("borders") }
    }
}
