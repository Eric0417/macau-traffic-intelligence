import SwiftUI

@main struct MacauTrafficApp: App {
    @Environment(\.scenePhase) private var phase
    @State private var settings = AppSettings()
    @State private var location = LocationService()
    @State private var navigation = AppNavigation()
    var body: some Scene {
        WindowGroup {
            RootView().environment(settings).environment(location).environment(navigation)
                .preferredColorScheme(settings.colorScheme)
                .environment(\.locale, Locale(identifier: settings.language.rawValue))
                .onChange(of: phase) { _, value in if value == .active { settings.refreshSystemLanguage() } }
        }
    }
}

@Observable @MainActor final class AppNavigation {
    enum Tab: Hashable { case explore, buses, assistant, city }
    var tab: Tab = .buses
    var explorePath = NavigationPath()
    var journey: JourneySelection?
    var journeyLive = JourneyLiveState()
    var mapRevision = 0
    func apply(_ selection: JourneySelection) {
        journey = selection
        journeyLive = JourneyLiveState()
        mapRevision += 1
        explorePath = NavigationPath()
        tab = .explore
    }
    func ask() { tab = .assistant }
}

struct RootView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(AppNavigation.self) private var navigation
    var body: some View {
        @Bindable var navigation = navigation
        TabView(selection: $navigation.tab) {
            Tab(settings.text("巴士", "Buses"), systemImage: "bus", value: .buses) {
                NavigationStack { BusListView() }
            }
            Tab(settings.text("探索", "Explore"), systemImage: "map", value: .explore) {
                NavigationStack(path: $navigation.explorePath) { ExploreView() }
            }
            Tab(settings.text("助手", "Assistant"), systemImage: "waveform", value: .assistant) {
                NavigationStack { AssistantView() }
            }
            Tab(settings.text("城市", "City"), systemImage: "square.grid.2x2", value: .city) {
                NavigationStack { CityView() }
            }
        }
        .tint(.primary)
    }
}
