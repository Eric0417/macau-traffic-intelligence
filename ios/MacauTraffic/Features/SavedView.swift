import SwiftUI

struct SavedView: View {
    @Environment(AppSettings.self) private var settings
    @State private var showSettings = false
    @State private var routes = LiveResource<[BusRoute]>()
    var body: some View {
        List {
            if settings.saved.isEmpty {
                ContentUnavailableView(settings.text("常用地方，放喺呢度", "Your everyday places"), systemImage: "star", description: Text(settings.text("喺巴士路線、車站或停車場按星號，下次更快搵到。", "Save a bus route, stop or car park to find it quickly next time.")))
            }
            ForEach(settings.saved) { item in
                if let code = item.routeCode, let route = routes.data?.first(where: { $0.routeCode == code }) {
                    NavigationLink {
                        BusDetailView(route: route, initialDirection: item.direction ?? 0, initialStation: item.stationCode, initialSequence: item.sequence)
                    } label: {
                        Label { VStack(alignment: .leading, spacing: 5) { Text(item.title); if item.kind == "stop" { Text(route.routeName).font(.caption).foregroundStyle(.secondary) } } } icon: { Image(systemName: item.kind == "stop" ? "mappin.circle.fill" : "bus.fill") }
                    }.swipeActions { Button(role: .destructive) { settings.toggle(item) } label: { Label(settings.text("刪除", "Delete"), systemImage: "trash") } }
                } else if item.kind == "parking" {
                    NavigationLink { ParkingView(initialID: String(item.id.dropFirst("parking:".count))) } label: { Label(item.title, systemImage: "parkingsign.circle.fill") }
                        .swipeActions { Button(role: .destructive) { settings.toggle(item) } label: { Label(settings.text("刪除", "Delete"), systemImage: "trash") } }
                } else {
                    Label(item.title, systemImage: "star.fill").swipeActions { Button(role: .destructive) { settings.toggle(item) } label: { Label(settings.text("刪除", "Delete"), systemImage: "trash") } }
                }
            }
            Text(settings.text("收藏只儲存喺呢部裝置。", "Saved items stay on this device.")).font(.footnote).foregroundStyle(.secondary).listRowBackground(Color.clear)
        }
        .navigationTitle(settings.text("收藏", "Saved"))
        .toolbar { Button { showSettings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel(settings.text("設定", "Settings")) }
        .livePolling(routes, path: "bus/routes", interval: 21_600)
        .sheet(isPresented: $showSettings) { SettingsView() }
    }
}

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
                Section {
                    Picker(settings.text("語言", "Language"), selection: $settings.language) { ForEach(AppLanguage.allCases, id: \.self) { Text($0.name).tag($0) } }
                    Picker(settings.text("外觀", "Appearance"), selection: $settings.appearance) {
                        Text(settings.text("跟隨系統", "System")).tag("system")
                        Text(settings.text("淺色", "Light")).tag("light")
                        Text(settings.text("深色", "Dark")).tag("dark")
                    }
                }
                Section(settings.text("資料與私隱", "Data and privacy")) {
                    Text(settings.text("澳門出行係獨立應用，並非澳門政府官方程式。交通資料來自 DSAT、SMG、MLM、FSM；步行及輕軌幾何包含 OpenStreetMap 資料。", "Macau Traffic is an independent application, not an official government app. Transport data comes from DSAT, SMG, MLM and FSM. Walking and LRT geometry include OpenStreetMap data."))
                    Text(settings.text("手動行程計算喺裝置內執行。AI 問題、你選擇分享嘅位置及目的地會傳送到應用伺服器及 AI 供應商。語音錄音會交由 DeepSeek 轉寫；你可以先編輯文字再傳送。暫存錄音會喺完成、取消或下次開啟助手時刪除。對話同位置唔會存入裝置記錄；供應商保留政策由供應商決定。", "Manual journey calculation runs on this device. AI questions, destinations and locations you choose to share are sent to the app server and AI provider. DeepSeek transcribes voice clips for you to edit before sending. Temporary recordings are deleted after completion, cancellation or the next assistant launch. Conversations and locations are not saved on this device. Provider retention follows the provider's policy."))
                    Link("© OpenStreetMap contributors · ODbL", destination: URL(string: "https://www.openstreetmap.org/copyright")!)
                    Link(settings.text("交通事務局", "DSAT"), destination: URL(string: "https://www.dsat.gov.mo")!)
                }
                Section { LabeledContent(settings.text("版本", "Version"), value: (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0") + " (" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "2") + ")") }
            }
            .navigationTitle(settings.text("設定", "Settings")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { dismiss() } } }
        }
    }
}
