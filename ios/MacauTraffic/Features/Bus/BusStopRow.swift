import SwiftUI

struct BusStopRow: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    var stop: BusStop
    var eta: BusETA
    var resource: LiveResource<BusETA>
    var onStop: () -> Void
    var onVehicle: (String) -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 2)) { context in
            let vehicles = resource.fresh(at: context.date) ? eta.vehicles.filter { $0.routePosition(in: eta)?.to.id == stop.id } : []
            VStack(spacing: 0) {
                if !vehicles.isEmpty {
                    HStack(spacing: 14) {
                        Rectangle().fill(.blue.opacity(0.25)).frame(width: 3).frame(width: 28)
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(vehicles) { vehicle in
                                Button {
                                    if vehicle.positionSource == "feed" && vehicle.coordinates != nil { onVehicle(vehicle.id) }
                                    else { onStop() }
                                } label: {
                                    HStack(spacing: 10) {
                                        Image(systemName: "bus.fill").font(.subheadline).frame(width: 28, height: 30)
                                            .foregroundStyle(.white).background(.blue, in: .rect(cornerRadius: 8))
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(vehicle.plate).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                            Text(vehicle.routePosition(in: eta)?.from == nil ? settings.text("正前往本站 · 位置未確認", "Approaching · location unavailable") : settings.text("兩站之間 · 官方估算", "Between stops · official estimate"))
                                                .font(.caption2).foregroundStyle(.secondary)
                                        }
                                        Spacer(minLength: 0)
                                        if vehicle.positionSource == "feed" { Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(.secondary) }
                                    }.padding(.vertical, 6).contentShape(Rectangle())
                                }.buttonStyle(.plain).accessibilityIdentifier("route-bus-\(vehicle.id)")
                            }
                        }.padding(.vertical, 9)
                    }.fixedSize(horizontal: false, vertical: true)
                }
                Button(action: onStop) {
                    HStack(alignment: .top, spacing: 14) {
                        VStack(spacing: 0) {
                            Circle().strokeBorder(stop.suspended ? .orange : .blue, lineWidth: 3)
                                .background(Color(.secondarySystemGroupedBackground), in: Circle()).frame(width: 14, height: 14).padding(.top, 5)
                            Rectangle().fill(.blue.opacity(0.25)).frame(width: 3)
                                .opacity(stop.id == eta.stops.last?.id ? 0 : 1)
                        }.frame(width: 28)
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(stop.stationName).font(.body.weight(.medium)).foregroundStyle(.primary)
                                if location.fix?.nearbyStop(in: eta.stops, now: context.date)?.id == stop.id {
                                    Image(systemName: "figure.stand").foregroundStyle(.blue)
                                        .accessibilityLabel(settings.text("你在此站附近", "You are near this stop"))
                                        .accessibilityIdentifier("nearby-stop-\(stop.id)")
                                }
                            }
                            ArrivalLabel(stop: stop, resource: resource)
                            Text(stop.stationCode).font(.caption2).foregroundStyle(.tertiary)
                        }.padding(.bottom, 22).frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.right").font(.caption2.weight(.semibold)).foregroundStyle(.tertiary).padding(.top, 7)
                    }.fixedSize(horizontal: false, vertical: true).contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityIdentifier("stop-\(stop.stationCode)")
            }
        }
    }
}
