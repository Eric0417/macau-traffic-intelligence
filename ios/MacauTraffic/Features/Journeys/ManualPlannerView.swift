import SwiftUI

struct ManualPlannerView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    @State private var origin: Place?
    @State private var destination: Place?
    @State private var choosing: String?
    @State private var nearby = false
    @State private var ready = false
    @State private var busy = false
    @State private var error: String?
    @State private var walkingUnavailable = false
    @State private var result: ManualPlan?
    @State private var searchedAt: Date?
    @State private var selected: JourneySelection?
    var body: some View {
        List {
            Section {
                endpointButton(origin, field: "origin", symbol: "circle.circle", placeholder: settings.text("選擇起點", "Choose origin"))
                endpointButton(destination, field: "destination", symbol: "mappin.circle.fill", placeholder: settings.text("你想去邊？", "Where to?"))
                Button {
                    Task {
                        do { let coordinate = try await location.request(); origin = .init(id: "current", name: settings.text("目前位置", "Current location"), coordinates: coordinate); result = nil }
                        catch { self.error = error.localizedDescription }
                    }
                } label: { Label(settings.text("用目前位置做起點", "Start from my location"), systemImage: "location") }
                    .disabled(location.locating || busy)
                Toggle(settings.text("包括起終點附近車站", "Include nearby platforms"), isOn: $nearby).disabled(busy || location.locating).onChange(of: nearby) { _, _ in result = nil }
            } header: { Text(settings.text("現在出發", "Leave now")) }
            Section {
                Button { Task { await plan() } } label: {
                    HStack { Spacer(); if busy { ProgressView() }; Text(settings.text("尋找路線", "Find routes")).fontWeight(.semibold); Spacer() }
                }.disabled(!ready || origin == nil || destination == nil || busy || origin?.id == destination?.id)
                    .accessibilityIdentifier("plan-manual")
            }
            if !ready && error == nil { ProgressView(settings.text("正在載入路網", "Loading transport network")) }
            if let error {
                Section {
                    Text(error).foregroundStyle(.orange)
                    if !ready { Button(settings.text("重試", "Retry")) { Task { await prepare() } } }
                }
            }
            if walkingUnavailable { Text(settings.text("步行路網未能載入。仍可選擇確切巴士站搜尋。", "Walking data is unavailable. Exact bus-stop searches remain available.")).font(.footnote).foregroundStyle(.secondary) }
            if let result {
                Section {
                    if result.journeys.isEmpty { Text(settings.text("現有路網未找到方案。呢個結果唔代表冇巴士服務。", "No match in the available network. This does not establish that no bus service exists.")) }
                    ForEach(result.journeys) { journey in
                        Button {
                            if let origin, let destination { selected = .init(journey: journey, origin: origin, destination: destination, networkFetchedAt: result.networkFetchedAt, walkingMappedAt: result.walkingMappedAt) }
                        } label: { JourneySummary(journey: journey) }
                    }
                } header: { Text(settings.text("出行方案", "Journey options")) }
                Section {
                    if let searchedAt { Text(settings.text("搜尋時間：", "Searched: ") + searchedAt.formatted(date: .omitted, time: .shortened)) }
                    Text(settings.text("按站數、步行距離及轉乘次數排序。部分路線營運時間未核實，請開啟方案確認停站安排。", "Ranked by stop count, walking distance and transfers. Some operating hours are unverified. Open an option to check current stop suspensions."))
                    Text(settings.text("路網日期：", "Network date: ") + result.networkFetchedAt)
                    if let date = result.walkingMappedAt { Text("© OpenStreetMap · " + date) }
                }.font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle(settings.text("規劃行程", "Plan a journey")).navigationBarTitleDisplayMode(.inline)
        .task { if !ready { await prepare() } }
        .sheet(isPresented: Binding(get: { choosing != nil }, set: { if !$0 { choosing = nil } })) {
            PlaceSearchView { place in
                if choosing == "origin" { origin = place } else { destination = place }
                result = nil; choosing = nil
            }
        }
        .sheet(item: $selected) { selection in NavigationStack { JourneyDetailView(selection: selection) } }
    }
    private func endpointButton(_ place: Place?, field: String, symbol: String, placeholder: String) -> some View {
        Button { choosing = field } label: {
            Label { VStack(alignment: .leading, spacing: 4) {
                Text(place?.name ?? placeholder).foregroundStyle(place == nil ? .secondary : .primary)
                if let code = place?.stationCode { Text(code).font(.caption).foregroundStyle(.secondary) }
            } } icon: { Image(systemName: symbol).foregroundStyle(field == "origin" ? .blue : .red) }.padding(.vertical, 8)
        }.disabled(!ready || busy || location.locating).accessibilityIdentifier("choose-\(field)")
    }
    private func prepare() async {
        error = nil
        do {
            async let bus: RawJSON = APIClient.shared.get("bus/network")
            async let walk: RawJSON? = try? APIClient.shared.get("journeys/walking-network")
            let (busData, walkData) = try await (bus, walk)
            try await PlannerEngine.shared.configure(bus: busData.data, walking: walkData?.data)
            walkingUnavailable = walkData == nil; ready = true
        } catch { self.error = error.localizedDescription }
    }
    private func plan() async {
        guard let origin, let destination else { return }
        busy = true; error = nil; result = nil
        defer { busy = false }
        do {
            var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Macau")!
            let now = Date.now
            struct Input: Encodable { var origin: Place; var destination: Place; var nearby: Bool; var departureMinute: Int }
            let input = Input(origin: origin, destination: destination, nearby: nearby, departureMinute: calendar.component(.hour, from: now) * 60 + calendar.component(.minute, from: now))
            let json = String(data: try JSONEncoder().encode(input), encoding: .utf8)!
            result = try await PlannerEngine.shared.call("plan", input: json); searchedAt = now
        } catch { self.error = error.localizedDescription }
    }
}

struct PlaceSearchView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    var onChoose: (Place) -> Void
    @State private var query = ""
    @State private var results: [Place] = []
    @State private var error: String?
    var body: some View {
        NavigationStack {
            List {
                if query.isEmpty { ContentUnavailableView(settings.text("搜尋澳門地點", "Search Macau"), systemImage: "magnifyingglass", description: Text(settings.text("地標、街道或巴士站名稱", "Landmarks, streets or bus stops"))) }
                ForEach(results) { place in
                    Button { onChoose(place) } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(place.name).foregroundStyle(.primary)
                                Text(place.stationCode ?? place.context ?? "").font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 5)
                        } icon: { Image(systemName: place.stationCode == nil ? "mappin.circle" : "bus") }
                    }
                }
                if !query.isEmpty && results.isEmpty { Text(settings.text("未找到相符地點", "No matching places")).foregroundStyle(.secondary) }
                if let error { Text(error).foregroundStyle(.orange) }
            }
            .navigationTitle(settings.text("搜尋地點", "Find a place")).navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: settings.text("輸入名稱或站號", "Name or stop code"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(settings.text("取消", "Cancel")) { dismiss() } } }
            .task(id: query) {
                do {
                    try await Task.sleep(for: .milliseconds(180))
                    let matches: [Place] = try await PlannerEngine.shared.call("search", input: query)
                    try Task.checkCancellation(); results = matches; error = nil
                } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            }
        }
    }
}

struct JourneySummary: View {
    @Environment(AppSettings.self) private var settings
    var journey: Journey
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if journey.legs.isEmpty {
                Label(settings.text("步行", "Walk"), systemImage: "figure.walk").font(.title3.weight(.semibold))
                if let walk = journey.walking?.direct { Text("\(Int(walk.meters)) m").font(.subheadline).foregroundStyle(.secondary) }
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { ForEach(journey.legs) { leg in RouteBadge(name: leg.routeName) } }
                    Text(journey.legs.map(\.routeName).joined(separator: " → ")).font(.title3.weight(.semibold))
                }
                Text(journey.legs.first!.from.stationName + " → " + journey.legs.last!.to.stationName).font(.body).foregroundStyle(.primary)
                Text(settings.text("\(journey.totalStops) 站 · \(max(0, journey.legs.count - 1)) 次轉乘", "\(journey.totalStops) stops · \(max(0, journey.legs.count - 1)) transfers")).font(.subheadline).foregroundStyle(.secondary)
                if journey.accessMeters + journey.egressMeters > 0 {
                    Text(settings.text("接駁 \(Int(journey.accessMeters + journey.egressMeters)) m", "Connections \(Int(journey.accessMeters + journey.egressMeters)) m")).font(.caption).foregroundStyle(.secondary)
                }
            }
        }.padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
    }
}
