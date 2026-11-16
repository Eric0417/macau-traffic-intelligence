import SwiftUI

struct ExploreView: View {
    private enum TrafficLayer { case dsat, forecast }
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    @Environment(AppNavigation.self) private var navigation
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var roads = LiveResource<LineCollection<Road>>()
    @State private var forecast = LiveResource<LineCollection<Road>>()
    @State private var viewport = MapViewport()
    private var live: JourneyLiveState { navigation.journeyLive }
    @State private var showTraffic = false
    @State private var trafficLayer: TrafficLayer = .dsat
    @State private var showSources = false
    @State private var showJourney = false
    @State private var error: String?
    @State private var locationTask: Task<Void, Never>?
    @State private var roadLines: [MapLine] = []
    @State private var forecastLines: [MapLine] = []
    private var visibleRoads: LiveResource<LineCollection<Road>> { trafficLayer == .forecast ? forecast : roads }

    private func trafficLines(at date: Date) -> [MapLine] {
        guard showTraffic else { return [] }
        switch trafficLayer {
        case .dsat: return roadLines
        case .forecast: return forecast.fresh(at: date) ? forecastLines : []
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Text("Macao Move")
                    .font(.system(.callout, design: .monospaced, weight: .medium))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                if navigation.journey != nil {
                    Button {
                        navigation.journey = nil
                        showJourney = false
                    } label: {
                        Image(systemName: "xmark").font(.subheadline.weight(.semibold))
                            .frame(width: 44, height: 44).contentShape(Circle())
                    }.buttonStyle(PressFeedbackStyle()).mapControlGlass()
                        .accessibilityLabel(settings.text("結束路線", "Clear route"))
                }
                PerspectiveButton(viewport: viewport)
            }
            TimelineView(.periodic(from: .now, by: 2)) { context in
                let route = navigation.journey.map { JourneyMapSnapshot(selection: $0, live: live, now: context.date) }
                TransitMap(lines: trafficLines(at: context.date) + (route?.lines ?? []), pins: route?.pins ?? [],
                           fitID: navigation.journey.map { $0.id + "-\(navigation.mapRevision)-\(live.selectionID == $0.id && live.geometry != nil)" } ?? "macau",
                           viewport: viewport, showsPerspective: false,
                           fitPadding: .init(top: 18, left: 16, bottom: 12, right: 16), fitCoordinates: route?.fitCoordinates)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipShape(.rect(cornerRadius: 26))
            .overlay(alignment: .topLeading) {
                if showTraffic { trafficStatus.padding(10) }
            }
            controls
            if let selection = navigation.journey { routeStatus(selection) }
        }
        .padding(.horizontal, 20).padding(.top, 4).padding(.bottom, 10)
        .frame(maxWidth: 760).frame(maxWidth: .infinity)
        .background(Color(.systemBackground))
        .toolbar(.hidden, for: .navigationBar)
        .livePolling(roads, path: "traffic/roads", interval: 60, enabled: navigation.tab == .explore && showTraffic && trafficLayer == .dsat, followSourceTTL: true)
        .livePolling(forecast, path: "traffic/forecast", interval: 60, enabled: navigation.tab == .explore && showTraffic && trafficLayer == .forecast, followSourceTTL: true)
        .onChange(of: roads.meta?.updatedAt) { _, _ in
            roadLines = (roads.data?.features ?? []).map { .init(id: $0.properties.id, coordinates: $0.geometry.coordinates, color: trafficColor($0.properties.status), width: 3) }
        }
        .onChange(of: forecast.meta?.updatedAt) { _, _ in
            forecastLines = (forecast.data?.features ?? []).filter { $0.properties.status != "unknown" }.map {
                .init(id: $0.properties.id, coordinates: $0.geometry.coordinates, color: trafficColor($0.properties.status), width: 3)
            }
        }
        .task(id: "\(navigation.mapRevision)-\(navigation.journey?.id ?? "")-\(navigation.tab)-\(scenePhase)-\(settings.language)") {
            if let selection = navigation.journey, navigation.tab == .explore, scenePhase == .active {
                await live.poll(selection, locale: settings.language.rawValue)
            }
        }
        .onChange(of: navigation.tab) { _, tab in if tab != .explore { showJourney = false; showSources = false } }
        .onChange(of: navigation.mapRevision) { _, _ in showJourney = false }
        .onDisappear { locationTask?.cancel() }
        .sheet(isPresented: $showJourney) {
            if let selection = navigation.journey {
                NavigationStack { JourneyDetailView(selection: selection, showsMap: false, live: live) }
                    .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
                    .presentationBackgroundInteraction(.enabled(upThrough: .medium))
            }
        }
        .sheet(isPresented: $showSources) {
            NavigationStack {
                List {
                    Section {
                        Picker(settings.text("路況來源", "Traffic source"), selection: $trafficLayer) {
                            Text(settings.text("即時路況", "Live traffic")).tag(TrafficLayer.dsat)
                            Text(settings.text("30 分鐘預測", "30 min forecast")).tag(TrafficLayer.forecast)
                        }.pickerStyle(.segmented).accessibilityIdentifier("traffic-layer-picker")
                    }
                    if trafficLayer == .dsat {
                        Section(settings.text("地圖顏色", "Map colours")) {
                            legendRow(.green, title: settings.text("暢通", "Clear"), detail: settings.text("官方回報交通正常", "Traffic reported as normal"))
                            legendRow(.orange, title: settings.text("緩慢", "Slow"), detail: settings.text("官方回報車流緩慢", "Traffic reported as slow"))
                            legendRow(.red, title: settings.text("擠塞", "Congested"), detail: settings.text("官方回報道路擠塞", "Congestion reported"))
                            legendRow(.gray, title: settings.text("未知", "Unknown"), detail: settings.text("未有確認路況，唔代表暢通", "No confirmed status; does not mean clear"))
                        }
                        SourceNote(meta: roads.meta, error: roads.error)
                    } else {
                        Section {
                            Text(settings.text("綠 暢通 · 橙 緩慢 · 紅 擠塞", "Green clear · Orange slow · Red congested"))
                        }.foregroundStyle(.secondary)
                        SourceNote(meta: forecast.meta, error: forecast.error)
                    }
                }.navigationTitle(settings.text("路況圖例", "Traffic legend")).navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { showSources = false } } }
            }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        }
        .sensoryFeedback(.selection, trigger: showSources)
        .alert(settings.text("定位未能完成", "Location unavailable"), isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button(settings.text("好", "OK")) { error = nil }
            if let url = URL(string: UIApplication.openSettingsURLString) { Link(settings.text("設定", "Settings"), destination: url) }
        } message: { Text(error ?? "") }
    }
    private func legendRow(_ color: Color, title: String, detail: String) -> some View {
        HStack(spacing: 16) {
            Capsule().fill(color).frame(width: 28, height: 5).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.body.weight(.medium))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 3).accessibilityElement(children: .combine)
    }
    private var trafficStatus: some View {
        TimelineView(.periodic(from: .now, by: 2)) { context in
            let predicted = trafficLayer == .forecast
            let resource = visibleRoads
            let delayed = resource.error != nil || resource.meta?.isDelayed(at: context.date) == true
            Button { showSources = true } label: {
                HStack(spacing: 8) {
                    if resource.loading { ProgressView().controlSize(.small) }
                    else if delayed { Image(systemName: "clock.badge.exclamationmark").foregroundStyle(.orange) }
                    else { Image(systemName: predicted ? "clock.arrow.circlepath" : "info.circle").font(.subheadline) }
                    (predicted ? Text(settings.text(delayed ? "預測暫未更新" : "30 分鐘預測", delayed ? "Forecast delayed" : "30 min forecast")) :
                        Text(settings.text(delayed ? "路況資料延遲" : "路況", delayed ? "Traffic data delayed" : "Traffic")))
                        .font(.caption.weight(.medium))
                }.padding(.horizontal, 14).frame(minHeight: 44).contentShape(Capsule()).glassEffect(.regular.interactive(), in: .capsule)
            }.buttonStyle(.plain).accessibilityLabel(settings.text("路況資料", "Traffic sources"))
                .accessibilityValue(delayed ? settings.text("資料延遲", "Data delayed") : resource.loading || resource.meta == nil ? settings.text("更新中", "Updating") :
                    predicted ? settings.text("交通事務局預測", "DSAT forecast") : settings.text("最新資料", "Up to date"))
        }
    }
    private var controls: some View {
        HStack(spacing: 12) {
            Button { showTraffic.toggle() } label: {
                Image(systemName: "car.side").font(.system(size: 19, weight: .medium))
                    .frame(width: 48, height: 48).contentShape(Circle())
                    .foregroundStyle(showTraffic ? Color(.systemBackground) : .primary)
                    .background(showTraffic ? Color(.label) : .clear, in: Circle())
            }.buttonStyle(PressFeedbackStyle()).mapControlGlass()
                .accessibilityLabel(settings.text("路況", "Traffic")).accessibilityValue(showTraffic ? "On" : "Off")
                .sensoryFeedback(.selection, trigger: showTraffic)

            let selection = navigation.journey
            Button {
                if selection == nil { navigation.ask() }
                else { showJourney = true }
            } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(selection?.destination.name ?? settings.text("想去邊？", "Where to?"))
                            .font(.headline).lineLimit(2)
                        if let selection {
                            let routes = selection.journey.legs.map(\.routeName)
                            Text(routes.isEmpty ? settings.text("步行", "Walk") : routes.joined(separator: " → "))
                                .font(.system(.caption, design: .monospaced)).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: selection == nil ? "arrow.up.right" : "chevron.up")
                        .font(.subheadline.weight(.semibold)).accessibilityHidden(true)
                }
                .multilineTextAlignment(.leading).padding(.horizontal, 18).padding(.vertical, 10)
                .frame(maxWidth: 420, minHeight: 56).contentShape(Capsule())
                .foregroundStyle(Color(.systemBackground)).background(Color(.label), in: Capsule())
            }.buttonStyle(PressFeedbackStyle())
                .accessibilityHint(selection == nil ? "" : settings.text("路線詳情", "Route details"))
                .accessibilityIdentifier(selection == nil ? "explore-search" : "home-route-details")
                .frame(maxWidth: .infinity)

            Button {
                locationTask?.cancel()
                locationTask = Task {
                    do {
                        let coordinate = try await location.request()
                        try Task.checkCancellation()
                        viewport.focus(coordinate, animated: !reduceMotion)
                    } catch is CancellationError {} catch { self.error = settings.description(for: error) }
                }
            } label: {
                Group {
                    if location.locating { ProgressView() }
                    else { Image(systemName: "location.fill").font(.system(size: 19, weight: .medium)) }
                }.frame(width: 48, height: 48).contentShape(Circle())
            }.buttonStyle(PressFeedbackStyle()).mapControlGlass().disabled(location.locating)
                .accessibilityLabel(settings.text("顯示目前位置", "Show my location"))
        }.frame(maxWidth: 540)
    }
    private func routeStatus(_ selection: JourneySelection) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if !selection.future, let first = selection.journey.legs.first {
                JourneyBoardingStatus(leg: first, envelope: live.envelopes[first.id], failed: live.errors.contains(first.id))
            }
            if live.geometry?.missingLegs.isEmpty == false || live.error != nil {
                Text(settings.text("部分路線未能核實", "Some route segments are unverified")).font(.caption).foregroundStyle(.orange)
            }
            if selection.future { Text(settings.text("預定行程，班次未核實", "Planned journey; future service unverified")).font(.caption).foregroundStyle(.orange) }
        }.frame(maxWidth: 540, alignment: .leading)
    }
}
