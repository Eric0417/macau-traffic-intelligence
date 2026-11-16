import SwiftUI

struct ExploreView: View {
    private enum TrafficLayer { case dsat, apple }
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    @Environment(AppNavigation.self) private var navigation
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var roads = LiveResource<LineCollection<Road>>()
    @State private var viewport = MapViewport()
    private var live: JourneyLiveState { navigation.journeyLive }
    @State private var showTraffic = false
    @State private var trafficLayer: TrafficLayer = .dsat
    @State private var showSources = false
    @State private var showJourney = false
    @State private var error: String?
    @State private var locationTask: Task<Void, Never>?
    @State private var roadLines: [MapLine] = []

    var body: some View {
        ZStack {
            TimelineView(.periodic(from: .now, by: 2)) { context in
                let route = navigation.journey.map { JourneyMapSnapshot(selection: $0, live: live, now: context.date) }
                TransitMap(lines: (showTraffic && trafficLayer == .dsat ? roadLines : []) + (route?.lines ?? []), pins: route?.pins ?? [],
                           fitID: navigation.journey.map { $0.id + "-\(navigation.mapRevision)-\(live.selectionID == $0.id && live.geometry != nil)" } ?? "macau",
                           viewport: viewport, showsPerspective: false, showsAppleTraffic: showTraffic && trafficLayer == .apple,
                           fitPadding: .init(top: 80, left: 40, bottom: navigation.journey == nil ? 180 : 440, right: 40), fitCoordinates: route?.fitCoordinates)
                    .ignoresSafeArea()
            }
            VStack(spacing: 0) {
                if showTraffic { trafficStatus.frame(maxWidth: .infinity, alignment: .leading) }
                Spacer(minLength: 24)
                controls
                if let selection = navigation.journey {
                    routePanel(selection).padding(.top, 14)
                } else {
                    Button { navigation.ask() } label: {
                        HStack {
                            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                            Text(settings.text("想去邊？", "Where to?")).font(.headline)
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.subheadline.weight(.semibold))
                        }.padding(.horizontal, 20).frame(minHeight: 56).contentShape(Capsule())
                            .glassEffect(.regular.interactive(), in: .capsule)
                    }.buttonStyle(PressFeedbackStyle()).accessibilityIdentifier("explore-search").padding(.top, 14)
                }
            }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 14).frame(maxWidth: 620)
        }
        .toolbar(.hidden, for: .navigationBar)
        .livePolling(roads, path: "traffic/roads", interval: 60, enabled: navigation.tab == .explore && showTraffic && trafficLayer == .dsat, followSourceTTL: true)
        .onChange(of: roads.meta?.updatedAt) { _, _ in
            roadLines = (roads.data?.features ?? []).map { .init(id: $0.properties.id, coordinates: $0.geometry.coordinates, color: trafficColor($0.properties.status), width: 3) }
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
                            Text(settings.text("交通事務局", "DSAT")).tag(TrafficLayer.dsat)
                            Text(settings.text("Apple 地圖", "Apple Maps")).tag(TrafficLayer.apple)
                        }.pickerStyle(.segmented).accessibilityIdentifier("traffic-layer-picker")
                        Toggle(settings.text("顯示路況", "Show traffic"), isOn: $showTraffic)
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
                            Text(settings.text("Apple 地圖提供路況，覆蓋視乎路段。", "Apple Maps provides traffic where available.")).foregroundStyle(.secondary)
                        }
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
            let apple = trafficLayer == .apple
            let delayed = !apple && (roads.error != nil || roads.meta?.isDelayed(at: context.date) == true)
            Button { showSources = true } label: {
                HStack(spacing: 8) {
                    if apple { Image(systemName: "map") }
                    else if roads.loading { ProgressView().controlSize(.small) }
                    else if delayed { Image(systemName: "clock.badge.exclamationmark").foregroundStyle(.orange) }
                    else {
                        HStack(spacing: 4) {
                            Circle().fill(.green)
                            Circle().fill(.orange)
                            Circle().fill(.red)
                        }.frame(width: 26, height: 6)
                    }
                    (apple ? Text(settings.text("Apple 路況", "Apple traffic")) :
                        Text(settings.text(delayed ? "路況資料延遲" : "路況", delayed ? "Traffic data delayed" : "Traffic")))
                        .font(.caption.weight(.medium))
                    Image(systemName: "info.circle").font(.caption)
                }.padding(.horizontal, 14).frame(minHeight: 44).contentShape(Capsule()).glassEffect(.regular.interactive(), in: .capsule)
            }.buttonStyle(.plain).accessibilityLabel(settings.text("路況資料", "Traffic sources"))
                .accessibilityValue(apple ? settings.text("Apple 地圖", "Apple Maps") :
                    delayed ? settings.text("資料延遲", "Data delayed") : roads.loading || roads.meta == nil ? settings.text("更新中", "Updating") : settings.text("最新資料", "Up to date"))
        }
    }
    private var controls: some View {
        HStack(alignment: .bottom) {
            Button { showTraffic.toggle() } label: {
                Image(systemName: "car.side.fill").font(.system(size: 19, weight: .medium)).frame(width: 48, height: 48).contentShape(Circle())
                    .foregroundStyle(showTraffic ? .white : .primary)
                    .background(showTraffic ? TransitStyle.ink : .clear, in: Circle())
            }.buttonStyle(.plain).glassEffect(.regular.interactive(), in: .circle)
                .accessibilityLabel(settings.text("路況", "Traffic")).accessibilityValue(showTraffic ? "On" : "Off")
                .sensoryFeedback(.selection, trigger: showTraffic)
            Spacer()
            VStack(spacing: 12) {
                PerspectiveButton(viewport: viewport)
                Button {
                    locationTask?.cancel()
                    locationTask = Task {
                        do {
                            let coordinate = try await location.request()
                            try Task.checkCancellation()
                            viewport.focus(coordinate, animated: !reduceMotion)
                        } catch is CancellationError {} catch { self.error = error.localizedDescription }
                    }
                } label: {
                    Group {
                        if location.locating { ProgressView() }
                        else { Image(systemName: "location.fill").font(.system(size: 19, weight: .medium)) }
                    }.frame(width: 48, height: 48).contentShape(Circle())
                }.buttonStyle(.plain).glassEffect(.regular.interactive(), in: .circle).disabled(location.locating)
                    .accessibilityLabel(settings.text("顯示目前位置", "Show my location"))
            }
        }
    }
    private func routePanel(_ selection: JourneySelection) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(selection.destination.name).font(.headline).lineLimit(2)
                    Text(selection.origin.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 12)
                Button { navigation.journey = nil; showJourney = false } label: { Image(systemName: "xmark").font(.subheadline.weight(.semibold)).frame(width: 44, height: 44) }
                    .buttonStyle(.plain).accessibilityLabel(settings.text("結束路線", "Clear route"))
            }
            CompactJourneyLine(journey: selection.journey)
            if !selection.future, let first = selection.journey.legs.first {
                JourneyBoardingStatus(leg: first, envelope: live.envelopes[first.id], failed: live.errors.contains(first.id))
            }
            if live.geometry?.missingLegs.isEmpty == false || live.error != nil {
                Text(settings.text("部分路線未能核實", "Some route segments are unverified")).font(.caption).foregroundStyle(.orange)
            }
            if selection.future { Text(settings.text("預定行程，班次未核實", "Planned journey; future service unverified")).font(.caption).foregroundStyle(.orange) }
            Button { showJourney = true } label: {
                HStack { Text(settings.text("路線詳情", "Route details")); Spacer(); Image(systemName: "chevron.up") }.font(.subheadline.weight(.semibold)).frame(minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier("home-route-details")
        }.padding(20).background(Color(.systemBackground), in: .rect(cornerRadius: 28))
            .shadow(color: .black.opacity(0.08), radius: 18, y: 6)
    }
}
