import SwiftUI

struct BusListView: View {
    @Environment(AppSettings.self) private var settings
    @State private var routes = LiveResource<[BusRoute]>()
    @State private var query = ""
    var body: some View {
        List {
            Section {
                NavigationLink { ManualPlannerView() } label: {
                    Label(settings.text("由起點搵路線", "Plan a bus journey"), systemImage: "arrow.triangle.branch")
                }
            }
            Section {
                LoadState(resource: routes) { Task { await routes.load("bus/routes") } }
                ForEach(filtered) { route in
                    NavigationLink {
                        BusDetailView(route: route)
                    } label: {
                        HStack(spacing: 14) {
                            RouteBadge(name: route.routeName, color: route.company.color == "orange" ? .orange : .blue)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(route.company.name).font(.subheadline).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if !route.live { Image(systemName: "calendar").accessibilityLabel(settings.text("季節性服務，無即時追蹤", "Seasonal, no live tracking")) }
                        }.padding(.vertical, 5)
                    }.accessibilityIdentifier("route-\(route.routeCode)")
                }
                if routes.data != nil && filtered.isEmpty { Text(settings.text("沒有符合嘅路線", "No matching routes")).foregroundStyle(.secondary) }
            } header: { Text(settings.text("全部路線", "All routes") + " · \(filtered.count)") }
            if routes.meta != nil { SourceNote(meta: routes.meta, error: routes.error).listRowBackground(Color.clear) }
        }
        .navigationTitle(settings.text("巴士", "Buses"))
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: settings.text("搜尋路線號碼", "Search route number"))
        .refreshable { await routes.load("bus/routes") }
        .livePolling(routes, path: "bus/routes", interval: 21_600)
    }
    private var filtered: [BusRoute] {
        (routes.data ?? []).filter { query.isEmpty || $0.routeName.localizedCaseInsensitiveContains(query) }
    }
}

struct BusDetailView: View {
    @Environment(AppSettings.self) private var settings
    var route: BusRoute
    var initialDirection = 0
    var initialStation: String?
    var initialSequence: Int?
    @State private var direction = 0
    @State private var resource = LiveResource<BusETA>()
    @State private var selectedStop: String?
    @State private var search = ""
    @State private var showMap = false
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
                Button { showMap = true } label: { Label(settings.text("路線地圖", "Route map"), systemImage: "map") }
            }
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
                            Button { selectedStop = stop.id } label: {
                                HStack(alignment: .top, spacing: 14) {
                                    Text("\(stop.sequence + 1)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                                        .frame(width: 28, height: 28).background(.quaternary, in: Circle())
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(stop.stationName).font(.body.weight(.medium)).foregroundStyle(.primary)
                                        Text(stop.stationCode).font(.caption).foregroundStyle(.secondary)
                                        ArrivalLabel(stop: stop, resource: resource)
                                        if stop.trafficStatus == "slow" || stop.trafficStatus == "congested" {
                                            Label(settings.text(stop.trafficStatus == "slow" ? "前方路段緩慢" : "前方路段擠塞", stop.trafficStatus == "slow" ? "Slow traffic ahead" : "Congestion ahead"), systemImage: "car.side").font(.caption).foregroundStyle(trafficColor(stop.trafficStatus))
                                        }
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                                }.padding(.vertical, 5)
                            }.accessibilityIdentifier("stop-\(stop.stationCode)")
                        }
                    } header: { Text(settings.text("沿途車站", "Stops") + " · \(eta.stops.count)") }
                    Section {
                        DisclosureGroup(settings.text("車輛資料", "Vehicle details")) {
                            TimelineView(.periodic(from: .now, by: 2)) { context in
                                if resource.fresh(at: context.date) {
                                    ForEach(eta.vehicles) { vehicle in
                                        VStack(alignment: .leading, spacing: 5) {
                                            Label(vehicle.plate, systemImage: vehicle.lowFloor ? "figure.roll" : "bus.fill")
                                            Text(vehicle.stationName).font(.subheadline)
                                            if let speed = vehicle.speedKph { Text("\(Int(speed)) km/h").font(.subheadline.monospacedDigit()) }
                                            Text(vehicle.positionSource == "feed" ? settings.text("官方位置估算", "Official position estimate") : settings.text("只提供正前往嘅車站", "Approaching stop only; position unavailable")).font(.caption).foregroundStyle(.secondary)
                                        }.padding(.vertical, 4)
                                    }
                                    if eta.vehicles.isEmpty { Text(settings.text("未有車輛資料", "No vehicles reported")) }
                                } else { Text(settings.text("位置資料已延遲", "Vehicle data is delayed")).foregroundStyle(.secondary) }
                            }
                        }
                        SourceNote(meta: resource.meta, error: resource.error)
                    }
                }
            }
        }
        .navigationTitle(route.routeName).navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: settings.text("搜尋沿途車站", "Find a stop on this route"))
        .toolbar { SaveButton(item: .init(id: "bus:\(route.routeCode):\(direction)", kind: "bus", title: route.routeName, routeCode: route.routeCode, direction: direction)) }
        .onAppear {
            if resource.data == nil { direction = initialDirection }
        }
        .onChange(of: eta?.routeCode) { _, _ in
            if let station = initialStation, selectedStop == nil {
                selectedStop = eta?.stops.first(where: { $0.stationCode == station && (initialSequence == nil || $0.sequence == initialSequence) })?.id
            }
        }
        .livePolling(resource, path: path, interval: 2, enabled: route.live)
        .refreshable { if route.live { await resource.load(path) } }
        .sheet(isPresented: $showMap) {
            NavigationStack {
                BusRouteMap(resource: resource, onStop: { selectedStop = $0; showMap = false })
                    .navigationTitle(route.routeName).navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { showMap = false } } }
            }
        }
        .sheet(isPresented: Binding(get: { selectedStop != nil && !showMap }, set: { if !$0 { selectedStop = nil } })) {
            if let stop = eta?.stops.first(where: { $0.id == selectedStop }) {
                StopSheet(stop: stop, route: route, direction: direction, resource: resource)
                    .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
            }
        }
    }
}

struct ArrivalLabel: View {
    @Environment(AppSettings.self) private var settings
    var stop: BusStop
    var resource: LiveResource<BusETA>
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
            }.font(.subheadline)
        }
    }
}

struct StopSheet: View {
    @Environment(AppSettings.self) private var settings
    var stop: BusStop; var route: BusRoute; var direction: Int; var resource: LiveResource<BusETA>
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack { RouteBadge(name: route.routeName); Spacer(); SaveButton(item: .init(id: "stop:\(route.routeCode):\(direction):\(stop.id)", kind: "stop", title: stop.stationName, routeCode: route.routeCode, direction: direction, stationCode: stop.stationCode, sequence: stop.sequence)) }
                    Text(stop.stationName).font(.largeTitle.bold())
                    Text(stop.stationCode).font(.subheadline.monospaced()).foregroundStyle(.secondary)
                    ArrivalLabel(stop: stop, resource: resource).font(.title2)
                    if let coordinate = stop.coordinates { TransitMap(pins: [.init(id: stop.id, coordinate: coordinate, title: stop.stationName, symbol: "bus")], fitID: stop.id).frame(height: 220).clipShape(.rect(cornerRadius: 24)) }
                    DisclosureGroup(settings.text("估算說明", "About estimates")) {
                        Text(settings.text("到站分鐘為未經實際到站校準嘅系統估算；巴士位置為官方估算。", "Arrival minutes are system estimates, not calibrated against observed arrivals. Bus positions are official estimates.")).font(.footnote).foregroundStyle(.secondary)
                    }
                    SourceNote(meta: resource.meta, error: resource.error)
                }.padding(24)
            }
        }
    }
}

struct BusRouteMap: View {
    @Environment(AppSettings.self) private var settings
    let resource: LiveResource<BusETA>
    var onStop: (String) -> Void
    var body: some View {
        TimelineView(.periodic(from: .now, by: 2)) { context in
            let eta = resource.data
            let stops = (eta?.stops ?? []).compactMap { stop -> MapPin? in
                guard let coordinate = stop.coordinates else { return nil }
                return .init(id: stop.id, coordinate: coordinate, title: stop.stationName, symbol: "circle.fill", color: stop.suspended ? .orange : .blue)
            }
            let vehicles = resource.fresh(at: context.date) ? (eta?.vehicles ?? []).compactMap { vehicle -> MapPin? in
                guard vehicle.positionSource == "feed", let coordinate = vehicle.coordinates else { return nil }
                return .init(id: "vehicle:\(vehicle.id)", coordinate: coordinate, title: vehicle.plate, symbol: "bus.fill", color: .mint)
            } : []
            TransitMap(lines: (eta?.routeSegments ?? []).enumerated().map { index, segment in
                .init(id: "\(index)", coordinates: segment.coordinates, color: resource.fresh(at: context.date) ? trafficColor(segment.trafficStatus) : .gray)
            }, pins: stops + vehicles, fitID: "\(eta?.routeCode ?? ""):\(eta?.direction ?? 0)", onSelect: { id in if !id.hasPrefix("vehicle:") { onStop(id) } })
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    Text(settings.text("綠：暢通 · 橙：緩慢 · 紅：擠塞 · 灰：未確認", "Green: clear · Orange: slow · Red: congested · Gray: unknown")).font(.caption)
                    Text(settings.text("巴士為官方估算位置，並非 GPS 直播", "Official estimated positions, not live GPS")).font(.caption)
                    SourceNote(meta: resource.meta, error: resource.error)
                }.padding(16).background(.regularMaterial)
            }
        }
    }
}
