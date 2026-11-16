import SwiftUI

struct TripEditorView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @State var draft: TripDraft
    var onSubmit: (TripDraft) -> Void
    @State private var date = Date.now
    @State private var start = Date.now
    @State private var end = Date.now.addingTimeInterval(8 * 3600)
    @State private var useSchedule = false
    @State private var includeDate = false
    @State private var includeEndTime = false
    var body: some View {
        NavigationStack {
            Form {
                Section(settings.text("起點與終點", "Start and finish")) {
                    TextField(settings.text("起點，可留空再選位置", "Origin, or choose location later"), text: Binding(get: { draft.originQuery ?? "" }, set: { draft.originQuery = limited($0, 150); draft.originId = nil }))
                        .accessibilityIdentifier("trip-origin")
                    if draft.mode == "day" {
                        TextField(settings.text("最後想返到邊？", "Where should the day end?"), text: Binding(get: { draft.endQuery ?? "" }, set: { draft.endQuery = limited($0, 150); draft.endId = nil }))
                            .accessibilityIdentifier("trip-end")
                    }
                }
                if draft.mode == "day" || useSchedule {
                    Section(settings.text("日期及時間（澳門）", "Date and time (Macau)")) {
                        if draft.mode == "ordered" { Toggle(settings.text("指定日期", "Set a date"), isOn: $includeDate) }
                        if draft.mode == "day" || includeDate { DatePicker(settings.text("日期", "Date"), selection: $date, displayedComponents: .date) }
                        DatePicker(settings.text("開始", "Start"), selection: $start, displayedComponents: .hourAndMinute)
                        if draft.mode == "ordered" { Toggle(settings.text("指定結束時間", "Set an end time"), isOn: $includeEndTime) }
                        if draft.mode == "day" || includeEndTime {
                            DatePicker(settings.text("結束", "End"), selection: $end, displayedComponents: .hourAndMinute)
                            if clock(end) <= clock(start) { Text(settings.text("結束時間要遲過開始時間。", "The end time must be later than the start time.")).foregroundStyle(.orange) }
                        }
                    }
                }
                if draft.mode == "ordered" { Toggle(settings.text("指定日期同時間", "Set a date and time"), isOn: $useSchedule) }
                if draft.mode == "day" {
                    Section(settings.text("行程偏好", "Preferences")) {
                        TextField(settings.text("例如歷史建築、少啲步行、親子", "History, less walking, family activities…"), text: Binding(get: { draft.preferences ?? "" }, set: { draft.preferences = limited($0, 300) }), axis: .vertical).lineLimit(3...5)
                            .accessibilityIdentifier("trip-preferences")
                    }
                }
                Section {
                    ForEach(draft.stops.indices, id: \.self) { index in
                        VStack(alignment: .leading, spacing: 12) {
                            TextField(settings.text("第 \(index + 1) 個地方", "Place \(index + 1)"), text: Binding(get: { draft.stops[index].query }, set: { draft.stops[index].query = String($0.prefix(150)); draft.stops[index].placeId = nil }))
                            Stepper(settings.text("停留 \(draft.stops[index].stayMinutes ?? 0) 分鐘", "Stay \(draft.stops[index].stayMinutes ?? 0) min"), value: Binding(get: { draft.stops[index].stayMinutes ?? 0 }, set: { draft.stops[index].stayMinutes = $0 }), in: 0...240, step: 5).font(.subheadline)
                        }.padding(.vertical, 5)
                    }.onDelete { draft.stops.remove(atOffsets: $0) }.onMove { draft.stops.move(fromOffsets: $0, toOffset: $1) }
                    if draft.stops.count < 8 { Button(settings.text("加一個地方", "Add a place"), systemImage: "plus") { draft.stops.append(.init(query: "", stayMinutes: draft.mode == "day" ? 30 : 0)) } }
                } header: { Text(settings.text("依次前往", "Visit in this order")) } footer: {
                    Text(settings.text(draft.mode == "day" ? "可以留空，由助手提供已核對開放資料嘅文化地點。時間係參觀目標，唔係交通到達預測。" : "最多八個地方；可以重複返回同一地方。", draft.mode == "day" ? "Leave empty for reviewed cultural suggestions. Visit targets are not travel-time predictions." : "Up to eight places, including return visits."))
                }
            }
            .environment(\.timeZone, TimeZone(identifier: "Asia/Macau")!)
            .navigationTitle(settings.text(draft.mode == "day" ? "安排一日遊" : "多站行程", draft.mode == "day" ? "Plan a day out" : "Multi-stop trip"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(settings.text("取消", "Cancel")) { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) { EditButton() }
                ToolbarItem(placement: .confirmationAction) { Button(settings.text("規劃", "Plan")) { submit() }.disabled(!valid) }
            }
            .onAppear {
                if let value = draft.date, let parsed = formatter("yyyy-MM-dd").date(from: value) { date = parsed }
                if let value = draft.startTime, let parsed = formatter("HH:mm").date(from: value) { start = parsed }
                else { start = formatter("HH:mm").date(from: "09:00")! }
                if let value = draft.endTime, let parsed = formatter("HH:mm").date(from: value) { end = parsed }
                else { end = formatter("HH:mm").date(from: "18:00")! }
                useSchedule = draft.date != nil || draft.startTime != nil || draft.endTime != nil
                includeDate = draft.date != nil
                includeEndTime = draft.endTime != nil
            }
        }
    }
    private var valid: Bool {
        !draft.stops.contains { $0.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } &&
        (draft.mode != "ordered" || !draft.stops.isEmpty) &&
        (!(draft.mode == "day" || (useSchedule && includeEndTime)) || clock(end) > clock(start)) &&
        (draft.mode != "day" || [draft.endQuery, draft.preferences].allSatisfy { $0?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false })
    }
    private func limited(_ text: String, _ count: Int) -> String? {
        let value = String(text.prefix(count))
        return value.isEmpty ? nil : value
    }
    private func formatter(_ pattern: String) -> DateFormatter {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(identifier: "Asia/Macau"); formatter.dateFormat = pattern
        return formatter
    }
    private func clock(_ value: Date) -> String { formatter("HH:mm").string(from: value) }
    private func submit() {
        var value = draft
        func cleaned(_ text: String?) -> String? {
            guard let value = text?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
            return value
        }
        value.originQuery = cleaned(value.originQuery)
        value.endQuery = cleaned(value.endQuery)
        value.preferences = cleaned(value.preferences)
        value.stops = value.stops.map { var stop = $0; stop.query = stop.query.trimmingCharacters(in: .whitespacesAndNewlines); return stop }
        if draft.mode == "day" || useSchedule {
            value.date = draft.mode == "day" || includeDate ? formatter("yyyy-MM-dd").string(from: date) : nil
            value.startTime = clock(start)
            value.endTime = draft.mode == "day" || includeEndTime ? clock(end) : nil
        } else { value.date = nil; value.startTime = nil; value.endTime = nil }
        onSubmit(value)
    }
}

struct ItineraryResultsView: View {
    @Environment(AppSettings.self) private var settings
    var plans: ItineraryPlans
    var onJourney: (JourneySelection) -> Void
    var onSelect: (TripDraft) -> Void
    var onEdit: (TripDraft) -> Void
    @State private var selected = 0
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if plans.options.count > 1 {
                Picker(settings.text("行程選擇", "Choose an itinerary"), selection: $selected) {
                    ForEach(plans.options.indices, id: \.self) { index in Text(plans.options[index].title).tag(index) }
                }.pickerStyle(.menu).onChange(of: selected) { _, index in if plans.options.indices.contains(index) { onSelect(plans.editable(plans.options[index])) } }
            }
            if plans.options.indices.contains(selected) {
                let option = plans.options[selected]
                Text(option.title).font(.title2.bold())
                AssistantReplyText(text: option.reason).foregroundStyle(.secondary).textSelection(.enabled)
                TransitMap(pins: option.stops.enumerated().map { index, stop in .init(id: "\(index)", coordinate: stop.coordinates, title: "\(index + 1). " + stop.name, symbol: "mappin", color: .teal) }, fitID: option.id).frame(height: 240).clipShape(.rect(cornerRadius: 24))
                Button(settings.text("修改地點同停留時間", "Edit places and visit lengths"), systemImage: "slider.horizontal.3") { onEdit(plans.editable(option)) }.buttonStyle(.bordered)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(option.stops.enumerated()), id: \.offset) { index, stop in
                        HStack(alignment: .top, spacing: 15) {
                            Text("\(index + 1)").font(.headline.monospacedDigit()).foregroundStyle(.teal).frame(width: 32, height: 32).background(.teal.opacity(0.12), in: Circle())
                            VStack(alignment: .leading, spacing: 7) {
                                Text(stop.name).font(.headline)
                                if let time = stop.targetTime { Text(settings.text("目標時間 ", "Visit target ") + time).font(.subheadline).foregroundStyle(.secondary) }
                                if stop.stayMinutes > 0 { Text(settings.text("停留 \(stop.stayMinutes) 分鐘", "Stay \(stop.stayMinutes) min")).font(.subheadline).foregroundStyle(.secondary) }
                                if let hours = stop.hours { Text(hours).font(.caption).foregroundStyle(.secondary) }
                                if let string = stop.sourceUrl, let url = URL(string: string) { Link(settings.text("官方開放資料", "Official visitor information"), destination: url).font(.caption) }
                            }
                        }.padding(.vertical, 14)
                        if index < option.stops.count - 1 { Divider().padding(.leading, 47) }
                    }
                }.readingCard()
                ForEach(Array(option.sections.enumerated()), id: \.offset) { index, section in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(section.from.name + " → " + section.to.name).font(.headline)
                        if let first = section.journeys.first {
                            connection(first, section: section, index: index)
                            if section.journeys.count > 1 {
                                DisclosureGroup(settings.text("其他接駁方案", "Other connections")) {
                                    ForEach(Array(section.journeys.dropFirst())) { connection($0, section: section, index: index) }
                                }
                            }
                        } else { Text(settings.text("暫未能確認呢段接駁", "This connection could not be verified")).foregroundStyle(.orange) }
                        ForEach(section.warnings, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                        if let taxi = section.taxiAlternative { Text(taxi).font(.caption).foregroundStyle(.secondary) }
                    }.readingCard()
                }
                Text(settings.text("參觀時間係規劃目標，未扣除未知交通時間。即時巴士資料只代表查詢當刻。", "Visit times are planning targets and exclude unknown travel time. Live bus data describes lookup time only.")).font(.footnote).foregroundStyle(.secondary)
                ForEach(plans.warnings, id: \.self) { Text($0).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
    private func connection(_ journey: Journey, section: ItinerarySection, index: Int) -> some View {
        Button {
            onJourney(.init(journey: journey, origin: section.from, destination: section.to, networkFetchedAt: plans.networkFetchedAt, walkingMappedAt: plans.walkingMappedAt, future: plans.draft.date != nil || index > 0))
        } label: { JourneySummary(journey: journey) }.buttonStyle(.plain)
    }
}
