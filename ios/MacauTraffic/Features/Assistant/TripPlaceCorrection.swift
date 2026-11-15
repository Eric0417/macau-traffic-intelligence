import SwiftUI

struct TripPlaceCorrection: View {
    @Environment(AppSettings.self) private var settings
    @State var query: String
    var onSubmit: (String) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField(settings.text("輸入另一個地點名稱", "Enter another place name"), text: $query).textFieldStyle(.roundedBorder)
            Button(settings.text("用呢個名稱再搵", "Search this name")) { onSubmit(query) }
                .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }.readingCard()
    }
}

struct ResolvedBusView: View {
    @Environment(AppSettings.self) private var settings
    var code: String; var direction: Int; var station: String? = nil
    @State private var catalogue = LiveResource<[BusRoute]>()
    var body: some View {
        Group {
            if let route = catalogue.data?.first(where: { $0.routeCode == code || $0.routeName == code }) {
                BusDetailView(route: route, initialDirection: route.routeType == 2 ? 0 : direction, initialStation: station)
            } else if catalogue.data != nil {
                ContentUnavailableView(settings.text("路線未喺目錄內", "Route not in the catalogue"), systemImage: "bus")
            } else { LoadState(resource: catalogue) { Task { await catalogue.load("bus/routes") } } }
        }.task { await catalogue.load("bus/routes") }
    }
}
