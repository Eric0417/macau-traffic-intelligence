import SwiftUI

@Observable @MainActor final class JourneyLiveState {
    var envelopes: [String: Envelope<BusETA>] = [:]
    var errors: Set<String> = []
    var geometry: JourneyGeometry?
    var error: String?
    func poll(_ selection: JourneySelection, locale: String) async {
        while !Task.isCancelled {
            await withTaskGroup(of: (String, Envelope<BusETA>?).self) { group in
                for leg in selection.journey.legs {
                    group.addTask { (leg.id, try? await APIClient.shared.get("bus/routes/\(leg.routeCode)/eta?direction=\(leg.direction)")) }
                }
                for await (id, response) in group {
                    guard !Task.isCancelled else { return }
                    if let response { envelopes[id] = response; errors.remove(id) } else { errors.insert(id) }
                }
            }
            guard !Task.isCancelled else { return }
            do {
                let input = GeometryInput(id: selection.id, legs: selection.journey.legs.map { leg in
                    .init(leg: leg, eta: envelopes[leg.id]?.data, positionsFresh: !selection.future && !errors.contains(leg.id) && envelopes[leg.id].map { !$0.meta.isDelayed() } == true)
                }, origin: selection.origin.coordinates, destination: selection.destination.coordinates, destinationName: selection.destination.name, walking: selection.journey.walking, locale: locale)
                let value: JourneyGeometry = try await PlannerEngine.shared.call("geometry", input: String(data: JSONEncoder().encode(input), encoding: .utf8)!)
                if !Task.isCancelled { geometry = value; error = nil }
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            if selection.journey.legs.isEmpty || selection.future { return }
            do { try await Task.sleep(for: .seconds(errors.isEmpty ? 2 : 8)) } catch { return }
        }
    }
}

struct JourneyDetailView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    var selection: JourneySelection
    @State private var live = JourneyLiveState()
    @State private var visible = false
    @State private var expandedMap = false
    var body: some View {
        List {
            Section {
                map.frame(height: 290).listRowInsets(EdgeInsets())
                Button { expandedMap = true } label: { Label(settings.text("展開地圖", "Expand map"), systemImage: "arrow.up.left.and.arrow.down.right") }
            }
            if let first = selection.journey.legs.first, selection.origin.coordinates.distance(to: first.endpoint(boarding: true, eta: live.envelopes[first.id]?.data)) > 1 {
                WalkingConnectionView(from: selection.origin.coordinates, to: first.endpoint(boarding: true, eta: live.envelopes[first.id]?.data), path: selection.journey.walking?.access, title: settings.text("步行前往上車站", "Walk to the boarding stop"))
            }
            Section {
                Text(selection.origin.name + " → " + selection.destination.name).font(.title3.weight(.semibold))
                JourneySummary(journey: selection.journey)
                if selection.future { Text(settings.text("呢個係行程規劃；目前路線資料唔代表未來班次。", "This is a planned itinerary. Current route data does not establish future service.")).font(.footnote).foregroundStyle(.orange) }
            }
            ForEach(Array(selection.journey.legs.enumerated()), id: \.element.id) { index, leg in
                Section {
                    HStack { RouteBadge(name: leg.routeName); Text(settings.text("開往 ", "Towards ") + leg.terminalName).font(.headline) }
                    Label(leg.from.stationName + " · " + leg.from.stationCode, systemImage: "arrow.up.circle.fill")
                    if !selection.future {
                        if index > 0 { Text(settings.text("以下係查詢當刻資料，唔代表轉乘時可趕到呢班車。", "Status at lookup time. This does not confirm you can catch this connection.")).font(.caption).foregroundStyle(.secondary) }
                        JourneyBoardingStatus(leg: leg, envelope: live.envelopes[leg.id], failed: live.errors.contains(leg.id))
                    }
                    Label(leg.to.stationName + " · " + leg.to.stationCode, systemImage: "arrow.down.circle.fill")
                    Text(settings.text("\(leg.stopCount) 站", "\(leg.stopCount) stops")).foregroundStyle(.secondary)
                    if leg.serviceWindows == nil { Text(settings.text("營運時間未核實", "Operating hours unverified")).font(.caption).foregroundStyle(.secondary) }
                    if let windows = leg.serviceWindows, !windows.isEmpty {
                        Text(windows.filter { $0.count == 2 }.map { terminalTime($0[0]) + "–" + terminalTime($0[1]) }.joined(separator: " / ")).font(.subheadline)
                        if let url = URL(string: "https://www.dsat.gov.mo/dsat/route_display.aspx?route=busroute_" + leg.routeName) {
                            Link(settings.text("官方總站班次時間", "Official terminal timetable"), destination: url).font(.caption)
                        }
                    }
                    NavigationLink {
                        ResolvedBusView(code: leg.routeCode, direction: leg.direction, station: leg.from.stationCode)
                    } label: { Text(settings.text("查看呢程巴士", "Inspect this bus leg")) }
                    SourceNote(meta: live.envelopes[leg.id]?.meta, error: live.errors.contains(leg.id) ? "unavailable" : nil)
                } header: { Text(settings.text("第 \(index + 1) 程", "Leg \(index + 1)")) }
            }
            if let last = selection.journey.legs.last, last.endpoint(boarding: false, eta: live.envelopes[last.id]?.data).distance(to: selection.destination.coordinates) > 1 {
                WalkingConnectionView(from: last.endpoint(boarding: false, eta: live.envelopes[last.id]?.data), to: selection.destination.coordinates, path: selection.journey.walking?.egress, title: settings.text("步行前往目的地", "Walk to the destination"))
            }
            if let walk = selection.journey.walking?.direct {
                WalkingConnectionView(from: selection.origin.coordinates, to: selection.destination.coordinates, path: walk, title: settings.text("步行路線", "Walking route"))
            }
            Section {
                if let geometry = live.geometry {
                    if !geometry.missingLegs.isEmpty { Text(settings.text("部分巴士路段未能核實，地圖保留缺口。", "Some bus alignments could not be verified and are omitted from the map.")).foregroundStyle(.orange) }
                    if !geometry.uncertainTransfers.isEmpty { Text(settings.text("轉乘站座標有差異，請確認站牌位置。", "Transfer coordinates differ. Check the platform location.")).foregroundStyle(.orange) }
                }
                if let error = live.error { Text(error).foregroundStyle(.orange) }
                Text(settings.text("綠線：有地圖依據嘅步行路徑。虛線：接駁直線，未核實可步行。", "Green: mapped walking path. Dashed: approximate connection, walkability unverified."))
                Text(settings.text("路網日期：", "Network date: ") + selection.networkFetchedAt)
                if let date = selection.walkingMappedAt { Text("© OpenStreetMap contributors · " + date) }
            }.font(.footnote).foregroundStyle(.secondary)
        }
        .navigationTitle(settings.text("行程詳情", "Journey")).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { dismiss() } } }
        .onAppear { visible = true }.onDisappear { visible = false }
        .task(id: "\(visible)-\(scenePhase)-\(settings.language)") { if visible && scenePhase == .active { await live.poll(selection, locale: settings.language.rawValue) } }
        .sheet(isPresented: $expandedMap) {
            NavigationStack {
                map.navigationTitle(selection.destination.name).navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { expandedMap = false } } }
            }
        }
    }
    private var map: some View {
        TimelineView(.periodic(from: .now, by: 2)) { context in mapContent(at: context.date) }
    }
    private func mapContent(at now: Date) -> some View {
        let features = live.geometry?.collection.features ?? []
        let lines: [MapLine] = features.enumerated().compactMap { index, item in
            guard let coordinates = item.geometry.line else { return nil }
            return .init(id: "\(index)", coordinates: coordinates, color: item.properties.kind == "walking-path" ? .green : Color(hex: item.properties.color ?? "#8E8E93"), dashed: item.properties.kind == "walk", width: item.properties.width ?? 5)
        }
        let pins: [MapPin] = features.enumerated().compactMap { index, item in
            guard let coordinate = item.geometry.point, item.properties.kind != "walk-label", item.properties.kind != "vehicle" else { return nil }
            return .init(id: "\(index)", coordinate: coordinate, title: item.properties.label ?? "", symbol: "mappin", color: Color(hex: item.properties.color ?? "#007AFF"))
        }
        let vehicles: [MapPin] = selection.future ? [] : selection.journey.legs.flatMap { leg in
            guard !live.errors.contains(leg.id), let envelope = live.envelopes[leg.id], !envelope.meta.isDelayed(at: now), envelope.data.routeCode == leg.routeCode, envelope.data.direction == leg.direction else { return [MapPin]() }
            return envelope.data.vehicles.compactMap { vehicle in
                guard vehicle.positionSource == "feed", let coordinate = vehicle.coordinates else { return nil }
                return MapPin(id: "vehicle:\(leg.id):\(vehicle.id)", coordinate: coordinate, title: leg.routeName + " · " + vehicle.plate, symbol: "bus.fill")
            }
        }
        return TransitMap(lines: lines, pins: pins + vehicles, fitID: selection.id + "\(live.geometry != nil)")
    }
    private func terminalTime(_ minutes: Int) -> String { String(format: "%02d:%02d", minutes / 60, minutes % 60) }
}

struct JourneyBoardingStatus: View {
    @Environment(AppSettings.self) private var settings
    var leg: JourneyLeg; var envelope: Envelope<BusETA>?; var failed: Bool
    var body: some View {
        TimelineView(.periodic(from: .now, by: 2)) { context in
            let matches = envelope?.data.stops.filter { $0.stationCode == leg.from.stationCode } ?? []
            if failed || envelope == nil || envelope!.meta.isDelayed(at: context.date) {
                Text(settings.text("即時資料未能確認", "Live data unavailable")).foregroundStyle(.secondary)
            } else if matches.count == 1, let stop = matches.first {
                if stop.suspended { Text(settings.text("上車站暫停服務，請選另一方案", "Boarding stop suspended. Choose another option.")).foregroundStyle(.orange) }
                else if let value = stop.freshStatus(at: context.date) { Text(value.state == "near-stop" ? settings.text("站點附近停留中", "Near stop · stationary") : settings.text("到站時間更新中", "Updating arrival")) }
                else if let estimate = stop.freshEstimate(at: context.date) { Text(settings.text("約 \(estimate.minutes) 分鐘 · 系統估算", "About \(estimate.minutes) min · system estimate")).foregroundStyle(.blue) }
                else if let count = stop.stopsAway { Text(settings.text("尚餘 \(count) 站", "\(count) stops away")).foregroundStyle(.blue) }
                else { Text(settings.text("未有到站資料", "No arrival data")).foregroundStyle(.secondary) }
            } else { Text(settings.text("上車站序未能唯一確認", "Boarding sequence is ambiguous")).foregroundStyle(.orange) }
            if envelope?.data.stops.contains(where: { $0.stationCode == leg.to.stationCode && $0.suspended }) == true {
                Text(settings.text("落車站暫停服務", "Alighting stop suspended")).foregroundStyle(.orange)
            }
        }.font(.subheadline)
    }
}
