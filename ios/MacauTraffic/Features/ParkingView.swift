import SwiftUI
import MapKit

enum ParkingKind: String, CaseIterable, Identifiable {
    case lightVehicle, motorcycle, electricVehicle, electricMotorcycle, accessible, heavyVehicleShort, heavyVehicleLong
    var id: String { rawValue }
    var labels: (String, String.LocalizationValue) {
        switch self {
        case .lightVehicle: ("輕型車", "Cars")
        case .motorcycle: ("電單車", "Motorcycles")
        case .electricVehicle: ("電動車", "Electric cars")
        case .electricMotorcycle: ("電動電單車", "Electric motorcycles")
        case .accessible: ("無障礙車位", "Accessible")
        case .heavyVehicleShort: ("重型車（短）", "Heavy vehicles, short")
        case .heavyVehicleLong: ("重型車（長）", "Heavy vehicles, long")
        }
    }
}

struct ParkingView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    var initialID: String?
    @State private var resource = LiveResource<[Parking]>()
    @State private var query = ""
    @State private var kind: ParkingKind = .lightVehicle
    @State private var byDistance = false
    @State private var showMap = false
    @State private var selected: Parking?
    @State private var locationError: String?
    var body: some View {
        List {
            Section {
                Picker(settings.text("車種", "Vehicle type"), selection: $kind) {
                    ForEach(ParkingKind.allCases) { item in Text(settings.text(item.labels.0, item.labels.1)).tag(item) }
                }
                Button {
                    Task {
                        do { _ = try await location.request(); byDistance = true; locationError = nil }
                        catch { locationError = error.localizedDescription }
                    }
                } label: { Label(settings.text("按附近距離排序", "Sort by distance"), systemImage: "location") }
                    .disabled(location.locating)
                if byDistance { Button(settings.text("改按空位排序", "Sort by availability")) { byDistance = false } }
                if let locationError { Text(locationError).font(.footnote).foregroundStyle(.orange) }
            }
            Section {
                LoadState(resource: resource) { Task { await resource.load("parking") } }
                ForEach(filtered) { facility in
                    Button { selected = facility } label: {
                        HStack(alignment: .center, spacing: 16) {
                            Image(systemName: "parkingsign.circle").font(.title).foregroundStyle(.primary)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(facility.name).font(.headline).foregroundStyle(.primary)
                                if byDistance, let from = location.coordinate, let to = facility.coordinates {
                                    Text(settings.text("直線距離 \(Int(from.distance(to: to))) m", "\(Int(from.distance(to: to))) m in a straight line")).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer(minLength: 6)
                            VStack(alignment: .trailing, spacing: 3) {
                                Text(facility.spaces(kind.rawValue).map(String.init) ?? "—").font(.system(.title, design: .rounded, weight: .semibold)).foregroundStyle(.primary).monospacedDigit()
                                Text(settings.text("空位", "spaces")).font(.caption).foregroundStyle(.secondary)
                            }
                        }.padding(.vertical, 8)
                    }
                }
                if resource.data != nil && filtered.isEmpty { Text(settings.text("沒有符合嘅停車場", "No matching car parks")).foregroundStyle(.secondary) }
            }
            SourceNote(meta: resource.meta, error: resource.error).listRowBackground(Color.clear)
        }
        .navigationTitle(settings.text("泊車", "Parking"))
        .searchable(text: $query, prompt: settings.text("搜尋停車場", "Search car parks"))
        .toolbar { Button { showMap = true } label: { Image(systemName: "map") }.accessibilityLabel(settings.text("停車場地圖", "Car park map")) }
        .livePolling(resource, path: "parking", interval: 30)
        .refreshable { await resource.load("parking") }
        .onChange(of: resource.data?.count) { _, _ in if let initialID { selected = resource.data?.first { $0.id == initialID } } }
        .sheet(item: $selected) { facility in ParkingDetailView(facility: resource.data?.first { $0.id == facility.id } ?? facility, meta: resource.meta, error: resource.error).presentationDetents([.medium, .large]).presentationDragIndicator(.visible) }
        .sheet(isPresented: $showMap) {
            NavigationStack {
                TransitMap(pins: filtered.compactMap { item in
                    guard let coordinate = item.coordinates else { return nil }
                    return .init(id: item.id, coordinate: coordinate, title: item.name + " · " + (item.spaces(kind.rawValue).map(String.init) ?? "—"), symbol: "parkingsign", color: .blue)
                }, fitID: "parking", onSelect: { id in selected = resource.data?.first { $0.id == id }; showMap = false })
                .safeAreaInset(edge: .bottom) { SourceNote(meta: resource.meta, error: resource.error).padding(16).background(.regularMaterial) }
                .navigationTitle(settings.text("泊車", "Parking")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { showMap = false } } }
            }
        }
    }
    private var filtered: [Parking] {
        (resource.data ?? []).filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }.sorted {
            if byDistance, let point = location.coordinate {
                let first = $0.coordinates.map { point.distance(to: $0) } ?? .infinity
                let second = $1.coordinates.map { point.distance(to: $0) } ?? .infinity
                if first != second { return first < second }
            }
            return ($0.spaces(kind.rawValue) ?? -1) > ($1.spaces(kind.rawValue) ?? -1)
        }
    }
}

struct ParkingDetailView: View {
    @Environment(AppSettings.self) private var settings
    var facility: Parking; var meta: SourceMeta?; var error: String?
    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text(facility.name).font(.title2.bold())
                        Spacer()
                        SaveButton(item: .init(id: "parking:\(facility.id)", kind: "parking", title: facility.name))
                    }
                    ForEach(ParkingKind.allCases) { kind in
                        LabeledContent(settings.text(kind.labels.0, kind.labels.1), value: facility.spaces(kind.rawValue).map(String.init) ?? settings.text("未提供", "Unavailable"))
                    }
                }
                if let coordinate = facility.coordinates {
                    TransitMap(pins: [.init(id: facility.id, coordinate: coordinate, title: facility.name, symbol: "parkingsign")], fitID: facility.id).frame(height: 220).listRowInsets(EdgeInsets())
                }
                Section {
                    if let observed = Timestamp.date(facility.updatedAt) { Text(settings.text("官方更新：", "Publisher update: ") + observed.formatted()) }
                    else { Text(settings.text("官方更新時間未提供", "Publisher update time unavailable")) }
                    SourceNote(meta: meta, error: error)
                }.font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}
