import SwiftUI

private struct BusMapRequest: Identifiable {
    let id = UUID()
    var vehicleID: String?
}

struct BusListView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .largeTitle) private var routeSize = 34.0
    @State private var routes = LiveResource<[BusRoute]>()
    @State private var query = ""
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? 260 : 102), spacing: 12)], spacing: 12) {
                ForEach(filtered) { route in
                    NavigationLink { BusDetailView(route: route) } label: {
                        VStack(alignment: .leading, spacing: 16) {
                            Text(route.routeName).font(.system(size: routeSize, weight: .bold, design: .rounded)).tracking(-1)
                                .lineLimit(1).minimumScaleFactor(0.6).frame(maxWidth: .infinity, alignment: .leading)
                            HStack(spacing: 5) {
                                Circle().fill(route.company.color == "orange" ? Color.orange : TransitStyle.accent).frame(width: 5, height: 5)
                                Text(route.company.name).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                                if !route.live { Image(systemName: "calendar").font(.caption2) }
                            }
                        }.padding(16).frame(maxWidth: .infinity, minHeight: 110, alignment: .leading)
                            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 23))
                            .shadow(color: .black.opacity(0.035), radius: 2, y: 3)
                    }.buttonStyle(PressFeedbackStyle()).accessibilityIdentifier("route-\(route.routeCode)")
                }
            }.padding(.top, 8)
            LoadState(resource: routes) { Task { await routes.load("bus/routes") } }
            if routes.data != nil && filtered.isEmpty { ContentUnavailableView.search(text: query) }
            if routes.meta != nil { SourceNote(meta: routes.meta, error: routes.error).padding(.vertical, 20) }
        }.contentMargins(.horizontal, 20).background(Color(.systemGroupedBackground))
        .navigationTitle(settings.text("巴士", "Buses"))
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: settings.text("路線號碼", "Route number"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { ManualPlannerView() } label: { Image(systemName: "arrow.triangle.branch") }
                    .accessibilityLabel(settings.text("規劃行程", "Plan a journey"))
            }
        }
        .refreshable { await routes.load("bus/routes") }
        .livePolling(routes, path: "bus/routes", interval: 21_600)
    }
    private var filtered: [BusRoute] {
        (routes.data ?? []).filter { query.isEmpty || $0.routeName.localizedCaseInsensitiveContains(query) }
    }
}

struct BusDetailView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    @Environment(\.scenePhase) private var phase
    var route: BusRoute
    var initialDirection = 0
    var initialStation: String?
    var initialSequence: Int?
    @State private var direction = 0
    @State private var resource = LiveResource<BusETA>()
    @State private var selectedStop: String?
    @State private var search = ""
    @State private var mapRequest: BusMapRequest?
    @State private var visible = false
    var path: String { "bus/routes/\(route.routeCode)/eta?direction=\(direction)" }
    var eta: BusETA? { resource.data?.direction == direction ? resource.data : nil }
    var body: some View {
        List {
            Section {
                HStack(alignment: .top, spacing: 16) {
                    RouteBadge(name: route.routeName, color: route.company.color == "orange" ? .orange : .blue)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(eta?.stops.last?.stationName ?? route.company.name).font(.title3.weight(.semibold))
                        Text(settings.text("開往終點站", "Towards terminus")).font(.subheadline).foregroundStyle(.secondary)
                    }
                }.padding(.vertical, 8)
                if route.routeType != 2 {
                    Picker(settings.text("方向", "Direction"), selection: $direction) {
                        Text(settings.text("去程", "Outbound")).tag(0)
                        Text(settings.text("回程", "Inbound")).tag(1)
                    }.pickerStyle(.segmented).onChange(of: direction) { _, _ in selectedStop = nil }
                }
            }
            BusTimetableView(timetable: route.timetable)
            if !route.live {
                Text(settings.text("呢條路線暫無即時追蹤資料。服務日期請參閱官方公告。", "Live tracking is unavailable for this route. Check official notices for service dates."))
            } else {
                LoadState(resource: resource) { Task { await resource.load(path) } }
                if let eta {
                    if !eta.diversion.suspendedStops.isEmpty {
                        Section(settings.text("停站安排", "Suspended stops")) {
                            ForEach(eta.diversion.suspendedStops, id: \.stationCode) { Text($0.stationName + " · " + $0.stationCode).foregroundStyle(.orange) }
                        }
                    }
                    Section {
                        ForEach(eta.stops.filter { search.isEmpty || $0.stationName.localizedCaseInsensitiveContains(search) || $0.stationCode.localizedCaseInsensitiveContains(search) }) { stop in
                            BusStopRow(stop: stop, eta: eta, resource: resource, onStop: { selectedStop = stop.id }, onVehicle: { id in
                                mapRequest = .init(vehicleID: id)
                            }).listRowSeparator(.hidden).listRowInsets(.init(top: 0, leading: 20, bottom: 0, trailing: 20))
                        }
                    } header: { Text(settings.text("沿途車站", "Stops") + " · \(eta.stops.count)") }
                    Section {
                        DisclosureGroup(settings.text("車輛資料", "Vehicle details")) {
                        TimelineView(.periodic(from: .now, by: 2)) { context in
                            VStack(alignment: .leading, spacing: 20) {
                                if resource.fresh(at: context.date) {
                                    ForEach(eta.vehicles) { vehicle in
                                        BusVehicleRow(vehicle: vehicle, eta: eta)
                                    }
                                    if eta.vehicles.isEmpty { Text(settings.text("未有車輛資料", "No vehicles reported")) }
                                } else { Text(settings.text("位置資料已延遲", "Vehicle data is delayed")).foregroundStyle(.secondary) }
                            }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                        }
                        }
                        SourceNote(meta: resource.meta, error: resource.error)
                    }
                    Section {
                        Button { mapRequest = .init() } label: {
                            HStack { Text(settings.text("路線地圖", "Route map")); Spacer(); Image(systemName: "arrow.up.left.and.arrow.down.right") }
                        }.accessibilityIdentifier("bus-route-map")
                        BusRouteMap(resource: resource, compact: true, onStop: { selectedStop = $0 })
                            .frame(height: 260).listRowInsets(EdgeInsets())
                    }
                }
            }
        }
        .navigationTitle(route.routeName).navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: settings.text("搜尋沿途車站", "Find a stop on this route"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { mapRequest = .init() } label: { Image(systemName: "map") }
                    .accessibilityLabel(settings.text("路線地圖", "Route map")).accessibilityIdentifier("bus-map-open")
            }
            ToolbarItem(placement: .topBarTrailing) { SaveButton(item: .init(id: "bus:\(route.routeCode):\(direction)", kind: "bus", title: route.routeName, routeCode: route.routeCode, direction: direction)) }
        }
        .onAppear {
            visible = true
            if resource.data == nil { direction = initialDirection }
        }
        .onDisappear { visible = false }
        .task(id: "\(visible)-\(phase)") {
            guard visible && phase == .active && route.live else { return }
            while !Task.isCancelled {
                _ = try? await location.request(maxAccuracy: 50)
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
            }
        }
        .onChange(of: eta?.routeCode) { _, _ in
            if let station = initialStation, selectedStop == nil {
                selectedStop = eta?.stops.first(where: { $0.stationCode == station && (initialSequence == nil || $0.sequence == initialSequence) })?.id
            }
        }
        .livePolling(resource, path: path, interval: 2, enabled: route.live)
        .refreshable { if route.live { await resource.load(path) } }
        .sheet(item: $mapRequest) { request in
            NavigationStack {
                BusRouteMap(resource: resource, initialVehicle: request.vehicleID, onStop: { selectedStop = $0; mapRequest = nil })
                    .navigationTitle(route.routeName).navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { mapRequest = nil } } }
            }
        }
        .sheet(isPresented: Binding(get: { selectedStop != nil && mapRequest == nil }, set: { if !$0 { selectedStop = nil } })) {
            if let selectedStop {
                StopSheet(stopID: selectedStop, route: route, direction: direction, resource: resource)
                    .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
            }
        }
    }
}

struct ArrivalLabel: View {
    @Environment(AppSettings.self) private var settings
    var stop: BusStop
    var resource: LiveResource<BusETA>
    var prominent = false
    var body: some View {
        TimelineView(.periodic(from: .now, by: 2)) { context in
            Group {
                if stop.suspended {
                    Label(settings.text("暫停服務", "Stop suspended"), systemImage: "nosign").foregroundStyle(.orange)
                } else if !resource.fresh(at: context.date) {
                    Text(settings.text("資料更新中", "Updating data")).foregroundStyle(.secondary)
                } else if let status = stop.freshStatus(at: context.date) {
                    Text(status.state == "near-stop" ? settings.text("站點附近停留中", "Near stop · stationary") : settings.text("到站時間更新中", "Updating arrival"))
                } else if let estimate = stop.freshEstimate(at: context.date) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(settings.text("約 \(estimate.minutes) 分鐘", "About \(estimate.minutes) min")).foregroundStyle(.blue).fontWeight(.semibold)
                        Text((estimate.nextBus == true ? settings.text("班次已更新 · ", "Updated bus · ") : "") + settings.text("系統估算", "System estimate")).font(.caption2).foregroundStyle(.secondary)
                    }
                } else if let away = stop.stopsAway {
                    Text(away == 0 ? settings.text("正前往本站", "Approaching this stop") : settings.text("尚餘 \(away) 站", "\(away) stops away")).foregroundStyle(.blue)
                } else { Text(settings.text("未有到站資料", "No arrival data")).foregroundStyle(.secondary) }
            }.font(prominent ? .title2 : .subheadline)
        }
    }
}

struct StopSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings
    var stopID: String; var route: BusRoute; var direction: Int; var resource: LiveResource<BusETA>
    @State private var detailStopID: String?
    @State private var mapRequest: BusMapRequest?
    var body: some View {
        let current = resource.data?.stops.first { $0.id == (detailStopID ?? stopID) }
        NavigationStack {
            Group {
            if let current {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(current.stationName).font(.title.bold())
                            Text(current.stationCode).font(.caption.monospaced()).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        SaveButton(item: .init(id: "stop:\(route.routeCode):\(direction):\(current.id)", kind: "stop", title: current.stationName, routeCode: route.routeCode, direction: direction, stationCode: current.stationCode, sequence: current.sequence))
                    }
                    ArrivalLabel(stop: current, resource: resource, prominent: true)
                    if let eta = resource.data {
                        TimelineView(.periodic(from: .now, by: 2)) { context in
                            if resource.fresh(at: context.date), let bus = eta.nextVehicle(for: current, at: context.date) {
                                if bus.position.from != nil {
                                    Button { mapRequest = .init(vehicleID: bus.vehicle.id) } label: {
                                        busPosition(plate: bus.vehicle.plate, position: bus.position, showsMap: true)
                                    }.buttonStyle(.plain).accessibilityIdentifier("stop-bus-position")
                                } else {
                                    busPosition(plate: bus.vehicle.plate, position: bus.position, showsMap: false)
                                }
                            }
                        }
                    }
                }.padding(24)
            }
            } else {
                ContentUnavailableView(settings.text("車站資料已更新", "Stop information changed"), systemImage: "bus", description: Text(settings.text("請返回路線重新選擇車站。", "Return to the route and choose a stop again.")))
            }
            }
            .navigationTitle(route.routeName).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { dismiss() } } }
        }
        .sheet(item: $mapRequest) { request in
            NavigationStack {
                BusRouteMap(resource: resource, initialVehicle: request.vehicleID, onStop: { id in
                    detailStopID = id; mapRequest = nil
                }).navigationTitle(route.routeName).navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { mapRequest = nil } } }
            }
        }
    }

    private func busPosition(plate: String, position: BusRoutePosition, showsMap: Bool) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "bus.fill").foregroundStyle(.blue).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(plate + " · " + settings.text("官方估算", "Official estimate")).font(.caption).foregroundStyle(.secondary)
                if let from = position.from {
                    Text("\(from.stationName) → \(position.to.stationName)").font(.subheadline.weight(.medium))
                } else {
                    Text(settings.text("正前往 ", "Approaching ") + position.to.stationName).font(.subheadline.weight(.medium))
                }
            }
            Spacer(minLength: 0)
            if showsMap { Image(systemName: "map").foregroundStyle(.secondary).accessibilityHidden(true) }
        }.frame(minHeight: 44).readingCard().contentShape(Rectangle())
            .accessibilityElement(children: .combine)
            .accessibilityHint(showsMap ? settings.text("開啟地圖", "Opens map") : "")
    }
}

struct BusRouteMap: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    let resource: LiveResource<BusETA>
    var initialVehicle: String?
    var compact = false
    var onStop: (String) -> Void
    @State private var selectedVehicle: String?
    @State private var viewport = MapViewport()
    @State private var showsRouteTraffic = false
    var body: some View {
        TimelineView(.periodic(from: .now, by: 2)) { context in
            let eta = resource.data
            let fresh = resource.fresh(at: context.date)
            let nearby = location.fix?.nearbyStop(in: eta?.stops ?? [], now: context.date)?.id
            let stops = (eta?.stops ?? []).compactMap { stop -> MapPin? in
                guard let coordinate = stop.coordinates else { return nil }
                return .init(id: stop.id, coordinate: coordinate, title: stop.stationName, symbol: nearby == stop.id ? "figure.stand" : "circle.fill", color: stop.suspended ? .orange : .blue)
            }
            let vehicles = fresh ? (eta?.vehicles ?? []).compactMap { vehicle -> MapPin? in
                guard vehicle.positionSource == "feed", let coordinate = vehicle.coordinates else { return nil }
                return .init(id: "vehicle:\(vehicle.id)", coordinate: coordinate, title: vehicle.plate, symbol: "bus.fill", color: vehicle.id == (selectedVehicle ?? initialVehicle) ? .blue : .mint)
            } : []
            TransitMap(lines: (eta?.routeSegments ?? []).enumerated().map { index, segment in
                let status = fresh ? segment.trafficStatus : "unknown"
                return .init(id: "\(index)", coordinates: segment.coordinates,
                             color: showsRouteTraffic ? trafficColor(status) : .blue,
                             dashed: showsRouteTraffic && status == "unknown")
            }, pins: stops + vehicles, fitID: "\(eta?.routeCode ?? ""):\(eta?.direction ?? 0):\(initialVehicle ?? "route")", viewport: viewport, showsAppleTraffic: false,
               fitPadding: .init(top: 35, left: 30, bottom: 35, right: 30),
               fitCoordinates: initialVehicle.flatMap { id in eta?.vehicles.first(where: { $0.id == id && $0.positionSource == "feed" })?.coordinates }.map { [$0] },
               onSelect: { id in
                   if id.hasPrefix("vehicle:") { selectedVehicle = String(id.dropFirst(8)) }
                   else { onStop(id) }
               })
            .onChange(of: selectedVehicle) { _, id in
                if let coordinate = eta?.vehicles.first(where: { $0.id == id && $0.positionSource == "feed" })?.coordinates { viewport.focus(coordinate) }
            }
            .safeAreaInset(edge: .bottom) {
                if !compact {
                    VStack(spacing: 10) {
                        Picker(settings.text("地圖顯示", "Map display"), selection: $showsRouteTraffic) {
                            Text(settings.text("巴士路線", "Bus route")).tag(false)
                            Text(settings.text("沿線路況", "Traffic along route")).tag(true)
                        }.pickerStyle(.segmented).accessibilityIdentifier("bus-map-display")
                        if showsRouteTraffic {
                            Text(settings.text("綠 暢通 · 橙 緩慢 · 紅 擠塞 · 灰虛線 未知", "Green clear · Orange slow · Red congested · Dashed unknown"))
                                .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                                .accessibilityIdentifier("bus-route-traffic-legend")
                        }
                        SourceNote(meta: resource.meta, error: resource.error)
                    }.padding(16).background(.regularMaterial)
                }
            }
        }
    }
}
