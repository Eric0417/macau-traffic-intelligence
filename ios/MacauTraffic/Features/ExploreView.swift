import SwiftUI

struct ExploreView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    @Environment(AppNavigation.self) private var navigation
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var roads = LiveResource<LineCollection<Road>>()
    @State private var weather = LiveResource<Weather>()
    @State private var viewport = MapViewport()
    private var live: JourneyLiveState { navigation.journeyLive }
    @State private var showTraffic = false
    @State private var showSources = false
    @State private var showJourney = false
    @State private var error: String?
    @State private var locationTask: Task<Void, Never>?
    @State private var roadLines: [MapLine] = []

    var body: some View {
        ZStack {
            TimelineView(.periodic(from: .now, by: 2)) { context in
                let route = navigation.journey.map { JourneyMapSnapshot(selection: $0, live: live, now: context.date) }
                TransitMap(lines: (showTraffic ? roadLines : []) + (route?.lines ?? []), pins: route?.pins ?? [],
                           fitID: navigation.journey.map { $0.id + "-\(navigation.mapRevision)-\(live.selectionID == $0.id && live.geometry != nil)" } ?? "macau",
                           viewport: viewport, showsPerspective: false,
                           fitPadding: .init(top: 140, left: 40, bottom: navigation.journey == nil ? 210 : 440, right: 40), fitCoordinates: route?.fitCoordinates)
                    .ignoresSafeArea()
            }
            VStack(spacing: 0) {
                header
                Spacer(minLength: 24)
                controls
                if let selection = navigation.journey {
                    routePanel(selection).padding(.top, 14)
                } else {
                    Button { navigation.ask() } label: {
                        HStack {
                            Text(settings.text("想去邊？", "Where to?")).font(.system(.title2, design: .rounded, weight: .bold))
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.title2.weight(.semibold))
                        }.padding(22).foregroundStyle(.white).background(TransitStyle.ink, in: .rect(cornerRadius: 28))
                    }.buttonStyle(PressFeedbackStyle()).accessibilityIdentifier("explore-search").padding(.top, 14)
                }
            }.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 14).frame(maxWidth: 620)
        }
        .toolbar(.hidden, for: .navigationBar)
        .livePolling(weather, path: "weather", interval: 60, enabled: navigation.tab == .explore)
        .livePolling(roads, path: "traffic/roads", interval: 60, enabled: navigation.tab == .explore && showTraffic)
        .onChange(of: roads.meta?.generatedAt) { _, _ in
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
                    Text(settings.text("只顯示官方監測路段；灰色代表未有路況。", "Officially monitored segments only. Gray means no traffic status."))
                    SourceNote(meta: roads.meta, error: roads.error)
                }.navigationTitle(settings.text("路況資料", "Traffic sources"))
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { showSources = false } } }
            }.presentationDetents([.medium]).presentationDragIndicator(.visible)
        }
        .alert(settings.text("定位未能完成", "Location unavailable"), isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button(settings.text("好", "OK")) { error = nil }
            if let url = URL(string: UIApplication.openSettingsURLString) { Link(settings.text("設定", "Settings"), destination: url) }
        } message: { Text(error ?? "") }
    }
    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 8) {
                Text(settings.text("澳門", "Macau")).font(.system(size: 42, weight: .bold, design: .rounded)).tracking(-1.5)
                if showTraffic {
                    Button { showSources = true } label: {
                        HStack(spacing: 8) {
                            Circle().fill(.green).frame(width: 6, height: 6)
                            Circle().fill(.orange).frame(width: 6, height: 6)
                            Circle().fill(.red).frame(width: 6, height: 6)
                            Text(settings.text("路況", "Traffic")).font(.caption.weight(.semibold))
                            Image(systemName: "info.circle").font(.caption)
                        }.padding(.horizontal, 12).padding(.vertical, 10).glassEffect()
                    }.buttonStyle(.plain).accessibilityLabel(settings.text("路況資料", "Traffic sources"))
                    if roads.loading { ProgressView().controlSize(.small) }
                    TimelineView(.periodic(from: .now, by: 2)) { context in
                        if roads.error != nil || roads.meta?.isDelayed(at: context.date) == true {
                            Text(settings.text("路況資料延遲", "Traffic data delayed")).font(.caption).foregroundStyle(.orange)
                        }
                    }
                }
            }
            Spacer()
            TimelineView(.periodic(from: .now, by: 30)) { context in
                if weather.fresh(at: context.date), let temperature = weather.data?.temperatureCelsius {
                    NavigationLink { WeatherView() } label: {
                        Text("\(Int(temperature))°").font(.system(.title2, design: .rounded, weight: .semibold)).padding(14).glassEffect()
                    }.buttonStyle(.plain).accessibilityLabel(settings.text("天氣", "Weather") + " \(Int(temperature))°")
                }
            }
        }
        .padding(.bottom, 12)
        .background { LinearGradient(colors: [Color(.systemBackground).opacity(0.9), Color(.systemBackground).opacity(0)], startPoint: .top, endPoint: .bottom).padding(-24).allowsHitTesting(false) }
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
