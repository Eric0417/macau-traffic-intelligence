import SwiftUI

struct LRTView: View {
    @Environment(AppSettings.self) private var settings
    @State private var network = LiveResource<LRTNetwork>()
    @State private var service = LiveResource<LRTService>()
    @State private var notices = LiveResource<[LRTNotice]>()
    @State private var selectedRef: String?
    @State private var selectedStation: String?
    var body: some View {
        List {
            Section {
                Text(settings.text("沿住軌道，穿過澳門。", "Across Macau, by rail.")).font(.title2.weight(.semibold)).padding(.vertical, 10)
                Text(settings.text("路線、車站同官方服務時間", "Lines, stations and published service hours")).foregroundStyle(.secondary)
            }
            LoadState(resource: network) { Task { await network.load("lrt/network") } }
            if let data = network.data {
                Section {
                    Picker(settings.text("路線", "Line"), selection: $selectedRef) {
                        Text(settings.text("全部路線", "All lines")).tag(String?.none)
                        ForEach(data.lines.features, id: \.properties.ref) { line in Text(line.properties.name.value(settings.language)).tag(Optional(line.properties.ref)) }
                    }
                    TransitMap(lines: data.lines.features.filter { selectedRef == nil || $0.properties.ref == selectedRef }.map { .init(id: $0.properties.id, coordinates: $0.geometry.coordinates, color: Color(hex: $0.properties.color), width: 6) }, pins: data.stations.filter { selectedRef == nil || $0.lines.contains(selectedRef!) }.map { .init(id: $0.id, coordinate: $0.coordinates, title: $0.name.value(settings.language), symbol: "tram.fill", color: .teal) }, fitID: selectedRef ?? "all-lrt", focus: data.stations.first { $0.id == selectedStation }?.coordinates, onSelect: { selectedStation = $0 })
                        .frame(height: 300).listRowInsets(EdgeInsets())
                    Text(settings.text("路線圖示意，未提供即時列車位置或到站預測。", "Route map only. Live train positions and arrival predictions are unavailable.")).font(.caption).foregroundStyle(.secondary)
                }
                Section(settings.text("車站", "Stations")) {
                    ForEach(data.stations.filter { selectedRef == nil || $0.lines.contains(selectedRef!) }) { station in
                        DisclosureGroup(isExpanded: Binding(get: { selectedStation == station.id }, set: { selectedStation = $0 ? station.id : nil })) {
                            Text(station.lines.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                            ForEach(stationTimetables(station), id: \.url) { timetable in
                                if let url = URL(string: timetable.url) { Link(settings.text("官方時刻表原圖", "Official timetable image"), destination: url) }
                            }
                        } label: {
                            Label(station.name.value(settings.language), systemImage: station.interchange ? "arrow.triangle.branch" : "tram.circle")
                        }
                    }
                }
                SourceNote(meta: network.meta, error: network.error)
                Text("© OpenStreetMap contributors · " + data.sourceUpdatedAt).font(.caption).foregroundStyle(.secondary)
            }
            Section(settings.text("服務時間", "Service hours")) {
                LoadState(resource: service) { Task { await service.load("lrt/service") } }
                ForEach(service.data?.lines ?? [], id: \.name) { line in
                    DisclosureGroup(line.name) {
                        LabeledContent(settings.text("星期一至四", "Monday–Thursday"), value: line.weekdayHours)
                        LabeledContent(settings.text("星期五至日及公眾假期", "Friday–Sunday and public holidays"), value: line.weekendHours)
                        Text(line.frequency)
                        Text(line.journeyTime)
                        ForEach(line.timetables, id: \.url) { timetable in
                            if let url = URL(string: timetable.url) { Link(timetable.stationName, destination: url) }
                        }
                    }
                }
                if let note = service.data?.revisionNote { Text(note).font(.caption).foregroundStyle(.secondary) }
                SourceNote(meta: service.meta, error: service.error)
            }
            Section(settings.text("輕軌公告", "LRT notices")) {
                LoadState(resource: notices) { Task { await notices.load("lrt/notices") } }
                ForEach(notices.data ?? []) { notice in
                    DisclosureGroup(notice.title) {
                        Text(notice.content).textSelection(.enabled)
                        Text(notice.publishedAt).font(.caption).foregroundStyle(.secondary)
                        if !notice.active { Text(settings.text("歷史公告", "Historical notice")).font(.caption).foregroundStyle(.secondary) }
                    }
                }
                SourceNote(meta: notices.meta, error: notices.error)
            }
        }
        .navigationTitle(settings.text("輕軌", "Light rail"))
        .livePolling(network, path: "lrt/network", interval: 21_600)
        .livePolling(service, path: "lrt/service", interval: 21_600)
        .livePolling(notices, path: "lrt/notices", interval: 300)
    }
    private func stationTimetables(_ station: LRTStation) -> [LRTService.Timetable] {
        service.data?.lines.flatMap(\.timetables).filter { station.name.traditional.contains($0.stationName) || $0.stationName.contains(station.name.traditional) } ?? []
    }
}
