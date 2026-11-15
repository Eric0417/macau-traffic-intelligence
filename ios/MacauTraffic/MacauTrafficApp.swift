import SwiftUI

@main struct MacauTrafficApp: App {
    @State private var settings = AppSettings()
    @State private var location = LocationService()
    var body: some Scene {
        WindowGroup {
            RootView().environment(settings).environment(location)
                .preferredColorScheme(settings.colorScheme)
                .environment(\.locale, Locale(identifier: settings.language.rawValue))
        }
    }
}

struct RootView: View {
    @Environment(AppSettings.self) private var settings
    var body: some View {
        TabView {
            Tab(settings.text("探索", "Explore"), systemImage: "map.fill") {
                NavigationStack { ExploreView() }
            }
            Tab(settings.text("巴士", "Buses"), systemImage: "bus.fill") {
                NavigationStack { BusListView() }
            }
            Tab(settings.text("收藏", "Saved"), systemImage: "star.fill") {
                NavigationStack { SavedView() }
            }
        }
        .tint(.blue)
        .tabBarMinimizeBehavior(.onScrollDown)
    }
}
