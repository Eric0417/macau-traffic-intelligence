import SwiftUI

struct BusTimetable: Codable {
    var checkedAt: String
    var sourceUrl: URL
    var schedules: [Schedule]
    struct Schedule: Codable {
        var days: String
        var towards: String?
        var periods: [Period]
        @MainActor func dayLabel(_ settings: AppSettings) -> String {
            switch days {
            case "daily": settings.text("每日", "Daily")
            case "mon-fri-except-public": settings.text("週一至五，公眾假期除外", "Mon–Fri, except public holidays")
            case "mon-sat-except-public": settings.text("週一至六，公眾假期除外", "Mon–Sat, except public holidays")
            case "mon-fri-except-mandatory": settings.text("週一至五，強制性假日除外", "Mon–Fri, except mandatory holidays")
            case "mon-sat-except-mandatory": settings.text("週一至六，強制性假日除外", "Mon–Sat, except mandatory holidays")
            case "mon-fri-except-public-and-um": settings.text("週一至五，公眾假期及澳大休假日除外", "Mon–Fri, except public holidays and UM holidays")
            default: settings.text("服務日期請查閱官方班表", "Check the official service dates")
            }
        }
    }
    struct Period: Codable {
        var start: String
        var end: String?
        var crossesMidnight: Bool { end.map { $0 <= start } ?? false }
        @MainActor func label(_ settings: AppSettings) -> String {
            guard let end else { return start }
            return "\(start) – \(end)" + (crossesMidnight ? settings.text(" 翌日", " +1 day") : "")
        }
    }
}

struct BusTimetableView: View {
    @Environment(AppSettings.self) private var settings
    var timetable: BusTimetable?
    @State private var showSource = false
    var body: some View {
        Section {
            if let timetable {
                ForEach(timetable.schedules.indices, id: \.self) { index in
                    let schedule = timetable.schedules[index]
                    VStack(alignment: .leading, spacing: 5) {
                        if let towards = schedule.towards {
                            Text(settings.text("往", "Towards ") + towards).font(.subheadline)
                        }
                        ForEach(schedule.periods.indices, id: \.self) { period in
                            Text(schedule.periods[period].label(settings)).font(.body.monospacedDigit().weight(.medium))
                        }
                        Text(schedule.dayLabel(settings)).font(.caption).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 3)
                }
            } else {
                Text(settings.text("未有已核實時間", "Hours not verified")).foregroundStyle(.secondary)
                Link(settings.text("查看官方路線班表", "Official route timetables"), destination: URL(string: "https://www.dsat.gov.mo/dsat/bus_route.aspx")!)
            }
        } header: {
            HStack {
                Text(settings.text("營運時間", "Operating hours"))
                Spacer()
                if timetable != nil {
                    Button { showSource = true } label: { Image(systemName: "info.circle") }
                        .accessibilityLabel(settings.text("時間表資料", "Timetable information"))
                }
            }
        }
        .sheet(isPresented: $showSource) {
            if let timetable {
                NavigationStack {
                    List {
                        Text(settings.text("總站發車時間。臨時交通措施、特別日子及颱風期間可能調整。", "Terminal departure times. Temporary traffic measures, special dates and typhoons can change service."))
                        LabeledContent(settings.text("核對日期", "Checked"), value: timetable.checkedAt)
                        Link(settings.text("官方班表", "Official timetable"), destination: timetable.sourceUrl)
                    }.navigationTitle(settings.text("營運時間", "Operating hours")).navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { showSource = false } } }
                }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
            }
        }
    }
}
