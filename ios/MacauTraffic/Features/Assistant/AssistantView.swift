import SwiftUI

private struct TripEditorRequest: Identifiable {
    let id = UUID()
    var draft: TripDraft
    var newTrip: Bool
}

struct AssistantView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LocationService.self) private var location
    @Environment(AppNavigation.self) private var navigation
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var state = AssistantState()
    @State private var voice = VoiceRecorder()
    @State private var locationTask: Task<Void, Never>?
    @State private var editingTrip: TripEditorRequest?
    @State private var manualOrigin = ""
    @State private var locationError: String?
    @State private var nearBottom = true
    @FocusState private var typing: Bool
    @FocusState private var originTyping: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(Array(state.history.enumerated()), id: \.offset) { _, turn in
                        questionBubble(turn.question)
                        AssistantReplyText(text: turn.reply)
                    }
                    if state.currentQuestion.isEmpty { welcome }
                    else {
                        questionBubble(state.currentQuestion)
                        if state.busy && state.partialReply.isEmpty && !state.preview {
                            AssistantWaitingView()
                        }
                        if !state.partialReply.isEmpty {
                            AssistantReplyText(text: state.partialReply).accessibilityIdentifier("assistant-streaming-reply")
                        }
                        if state.cancelled && !state.preview {
                            Text(settings.text("已停止查詢", "Request stopped")).font(.subheadline).foregroundStyle(.secondary)
                        }
                        if let error = state.error {
                            VStack(alignment: .leading, spacing: 12) {
                                Label(settings.text("暫時未能完成查詢", "Unable to complete the request"), systemImage: "exclamationmark.circle")
                                Text(error).font(.subheadline).foregroundStyle(.secondary)
                                if let request = state.pending { Button(settings.text("重試", "Retry")) { state.start(request) }.buttonStyle(.bordered) }
                                NavigationLink(settings.text("使用手動行程規劃", "Use the manual planner")) { ManualPlannerView() }
                            }.readingCard()
                        }
                        if let answer = state.answer { AnswerView(answer: answer).id("response") }
                        if let result = state.result {
                            if state.preview {
                                Text(settings.text(state.busy ? "候選路線 · AI 正在比較" : "候選路線 · AI 比較未完成", state.busy ? "Route candidates · AI is comparing" : "Route candidates · AI comparison incomplete")).font(.caption).foregroundStyle(.secondary)
                            }
                            resultView(result).id("response")
                        }
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }.padding(24).frame(maxWidth: 760).frame(maxWidth: .infinity)
            }
            .background(Color(.systemBackground))
            .scrollDismissesKeyboard(.interactively)
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentSize.height + geometry.contentInsets.bottom - geometry.visibleRect.maxY < 180
            } action: { _, value in nearBottom = value }
            .safeAreaInset(edge: .bottom) { if !originTyping { AssistantComposer(state: state, voice: voice, typing: $typing, submit: submit) } }
            .onChange(of: state.busy) { _, busy in
                if busy {
                    proxy.scrollTo("bottom", anchor: .bottom)
                } else if nearBottom, case .plans = state.result {
                    withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) { proxy.scrollTo("response", anchor: .top) }
                } else if nearBottom, state.result != nil || state.answer != nil {
                    proxy.scrollTo("response", anchor: .top)
                }
            }
            .onChange(of: state.partialReply) { _, value in
                if !value.isEmpty && nearBottom { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: state.preview) { _, preview in
                if preview { withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) { proxy.scrollTo("response", anchor: .top) } }
            }
        }
        .navigationTitle(settings.text("出行助手", "Assistant"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(settings.text("新對話", "New conversation"), systemImage: "square.and.pencil") { voice.cancel(); state.clear() }
                    Button(settings.text("安排一日遊", "Plan a day trip"), systemImage: "calendar") { editingTrip = .init(draft: .init(mode: "day"), newTrip: true) }
                    Button(settings.text("依次去幾個地方", "Visit several places"), systemImage: "list.number") { editingTrip = .init(draft: .init(mode: "ordered"), newTrip: true) }
                    NavigationLink { ManualPlannerView() } label: { Label(settings.text("手動規劃", "Manual planner"), systemImage: "map") }
                } label: { Image(systemName: "ellipsis") }
                .disabled(state.busy || location.locating)
                .accessibilityLabel(settings.text("助手選項", "Assistant options"))
            }
        }
        .sheet(item: $editingTrip) { request in
                TripEditorView(draft: request.draft) { value in
                    editingTrip = nil
                    if request.newTrip || state.pending == nil {
                        state.begin(.init(question: settings.text(value.mode == "day" ? "安排文化一日遊" : "依次去以下地方", value.mode == "day" ? "Plan a cultural day trip" : "Visit these places in order"), locale: settings.language.rawValue, trip: value))
                    } else { state.continueTrip(value) }
                }
        }
        .onChange(of: voice.transcript) { _, value in if !value.isEmpty { state.draft = value; typing = true } }
        .onChange(of: phase) { _, value in
            if value == .background || (value == .inactive && (voice.isRecording || voice.transcribing)) { voice.cancel() }
        }
        .onAppear { typing = false; originTyping = false }
        .onDisappear { voice.cancel(); locationTask?.cancel(); typing = false; originTyping = false }
    }
    private func questionBubble(_ question: String) -> some View {
        Text(question).padding(.horizontal, 18).padding(.vertical, 12)
            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 22))
            .padding(.leading, 36).frame(maxWidth: .infinity, alignment: .trailing)
    }
    private var welcome: some View {
        VStack(spacing: 18) {
            if !typeSize.isAccessibilitySize {
                Image("RouteSculpture").resizable().scaledToFit().frame(width: 176, height: 176)
                    .padding(.top, 18).accessibilityHidden(true)
            }
            Text(settings.text("想去邊？", "Where to?")).font(.system(.largeTitle, design: .rounded, weight: .bold))
                .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.bottom, 16)
            VStack(spacing: 0) {
                suggestion("搭巴士", "Find a bus", "bus", question: settings.text("去大三巴點搭巴士？", "How do I get to St Paul's by bus?"))
                Divider().padding(.leading, 54)
                suggestion("搵附近", "Find nearby", "location", question: settings.text("附近有咩停車場？", "Which car parks are nearby?"))
                Divider().padding(.leading, 54)
                suggestion("一日遊", "Plan a day", "sun.max", question: settings.text("幫我安排文化一日遊", "Plan a cultural day trip"))
            }
        }.padding(.bottom, 16)
    }
    private func suggestion(_ chinese: String, _ english: String, _ symbol: String, question: String) -> some View {
        Button { state.draft = question; submit() } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol).frame(width: 24).foregroundStyle(.secondary)
                Text(settings.text(chinese, english)).foregroundStyle(.primary).multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                Image(systemName: "arrow.up.left").font(.caption).foregroundStyle(.secondary)
            }.padding(.horizontal, 12).padding(.vertical, 18).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
    private func submit() { locationTask?.cancel(); typing = false; state.ask(locale: settings.language.rawValue) }
    private func apply(_ selection: JourneySelection) {
        voice.cancel(); typing = false; originTyping = false
        if state.busy { state.cancel() }
        navigation.apply(selection)
    }
    private func useManualOrigin() {
        let query = String(manualOrigin.trimmingCharacters(in: .whitespacesAndNewlines).prefix(150))
        guard !query.isEmpty, !location.locating, !state.busy else { return }
        originTyping = false; state.useOrigin(query: query)
    }

    @ViewBuilder private func resultView(_ result: AssistantResult) -> some View {
        switch result {
        case .answer(let answer): AnswerView(answer: answer)
        case .traffic: EmptyView()
        case .emergency:
            VStack(alignment: .leading, spacing: 14) {
                Text(settings.text("需要緊急救護，請直接致電 999。", "For an emergency ambulance in Macau, call 999.")).font(.title3.bold())
                Link(settings.text("致電 999", "Call 999"), destination: URL(string: "tel:999")!).buttonStyle(.borderedProminent)
                Link(settings.text("衛生局急救服務資訊", "Health Bureau emergency service"), destination: URL(string: "https://www.gov.mo/en/services/ps-1544/")!)
            }.readingCard()
        case .location(let place): locationPrompt(title: settings.text("由邊度去 ", "Where are you starting for ") + place.name)
        case .nearbyLocation: locationPrompt(title: settings.text("以邊度為中心搜尋？", "Where should I search nearby?"))
        case .facilityLocation(let value):
            locationPrompt(title: value.reason == "outside-macau" ? settings.text("請選擇澳門嘅起點", "Choose an origin in Macau") : settings.text("提供附近地標或目前位置", "Use a nearby landmark or your location"))
        case .tripLocation: locationPrompt(title: settings.text("行程由邊度開始？", "Where does the trip start?"))
        case .clarify(let value):
            Text(value.message).readingCard()
            if value.allowOrigin != false { locationPrompt(title: settings.text("補充起點", "Add an origin")) }
        case .choose(let value): choices(value.choices) { state.choose($0, field: value.field) }
        case .tripChoice(let value):
            Text(settings.text("請確認：", "Please choose: ") + value.query).font(.headline)
            choices(value.choices) { state.chooseTrip($0, choice: value) }
            TripPlaceCorrection(query: value.query) { state.correctTripPlace($0, choice: value) }
        case .tripDetails(let value):
            VStack(alignment: .leading, spacing: 14) {
                Text(value.message ?? settings.text("加返日期、時間同偏好，就可以安排完整行程。", "Add your date, times and preferences to plan the trip."))
                Button(settings.text("填寫行程資料", "Trip details")) { editingTrip = .init(draft: value.draft, newTrip: false) }.buttonStyle(.borderedProminent)
            }.readingCard()
        case .nearby(let answer): AnswerView(answer: answer)
        case .plans(let plans):
            VStack(alignment: .leading, spacing: 6) {
                Text(plans.origin.name).font(.caption).foregroundStyle(.secondary)
                Text(plans.destination.name).font(.system(.title2, design: .rounded, weight: .bold))
            }
            ForEach(Array(plans.options.enumerated()), id: \.element.journey.id) { index, option in
                JourneyOptionCard(option: option, index: index) {
                    apply(.init(journey: option.journey, origin: plans.origin, destination: plans.destination, networkFetchedAt: plans.networkFetchedAt, walkingMappedAt: plans.walkingMappedAt))
                }
            }
            if !plans.warnings.isEmpty {
                DisclosureGroup(settings.text("路線注意事項", "Route notices") + " · \(plans.warnings.count)") { warningList(plans.warnings) }.font(.footnote).foregroundStyle(.secondary)
            }
            DisclosureGroup(settings.text("規劃說明", "Planning details")) {
                AssistantReplyText(text: plans.summary).font(.footnote).textSelection(.enabled)
                if let taxi = plans.taxiAlternative { Text(taxi).font(.footnote) }
                Text(plans.model + " · " + plans.networkFetchedAt).font(.caption)
            }.font(.footnote).foregroundStyle(.secondary)
        case .facilities(let result):
            Text(settings.text("附近設施", "Nearby places")).font(.title2.bold())
            if result.matches.isEmpty { Text(settings.text("呢次地圖搜尋未有結果，唔代表附近冇相關設施。", "No matches in this map search. Nearby facilities may still exist.")) }
            ForEach(result.matches) { place in
                VStack(alignment: .leading, spacing: 12) {
                    Text(place.name).font(.headline)
                    if let meters = place.distanceMeters { Text("\(Int(meters)) m · " + (result.search.distance == "walking" ? settings.text("地圖步行距離", "Mapped walking distance") : settings.text("直線距離", "Straight-line distance"))).font(.subheadline).foregroundStyle(.secondary) }
                    if let context = place.context { Text(context).font(.caption).foregroundStyle(.secondary) }
                    Button(settings.text("前往呢個地方", "Directions")) { state.directions(to: place, from: result.origin) }.buttonStyle(.bordered)
                }.frame(maxWidth: .infinity, alignment: .leading).readingCard()
            }
            if let note = result.routeNote { Text(note).foregroundStyle(.orange) }
            Text(settings.text("營業時間、具體服務同無障礙設施未核實。", "Opening hours, specific services and accessibility are unverified.")).font(.footnote).foregroundStyle(.secondary)
            Text("© OpenStreetMap · " + result.mappedAt).font(.caption).foregroundStyle(.secondary)
        case .itineraries(let plans):
            ItineraryResultsView(plans: plans, onJourney: { apply($0) }, onSelect: { state.activeTrip = $0 }, onEdit: { editingTrip = .init(draft: $0, newTrip: false) })
        }
    }
    private func locationPrompt(title: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.headline)
            Text(settings.text("位置會交由伺服器及 AI 規劃，亦可輸入地標。", "Shares location with the server and AI. Or enter a landmark.")).font(.footnote).foregroundStyle(.secondary)
            Button {
                locationTask = Task {
                    do { let coordinate = try await location.request(); try Task.checkCancellation(); locationError = nil; state.useOrigin(coordinate: coordinate) }
                    catch is CancellationError {} catch { locationError = error.localizedDescription }
                }
            } label: {
                Label(settings.text("分享目前位置", "Share current location"), systemImage: "location.fill")
                    .foregroundStyle(Color(.systemBackground))
            }
                .buttonStyle(.borderedProminent).controlSize(.large).accessibilityIdentifier("assistant-origin-location").disabled(location.locating || state.busy)
            TextField(settings.text("或者輸入起點地標", "Or enter an origin landmark"), text: $manualOrigin).textFieldStyle(.roundedBorder).disabled(location.locating)
                .focused($originTyping).submitLabel(.go).onSubmit(useManualOrigin)
            Button(settings.text("使用呢個起點", "Use this origin"), action: useManualOrigin).buttonStyle(.bordered).controlSize(.large)
                .disabled(manualOrigin.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || location.locating || state.busy)
            if location.locating { ProgressView(settings.text("定位中", "Locating")) }
            if let locationError { Text(locationError).font(.footnote).foregroundStyle(.orange) }
        }.readingCard()
    }
    private func choices(_ values: [Place], action: @escaping (Place) -> Void) -> some View {
        VStack(spacing: 12) {
            ForEach(values) { place in
                Button { action(place) } label: {
                    HStack { Label(place.name, systemImage: "mappin.circle"); Spacer(); Image(systemName: "chevron.right") }.padding(18).frame(maxWidth: .infinity).background(.background, in: .rect(cornerRadius: 18))
                }.buttonStyle(.plain)
            }
        }
    }
    private func warningList(_ values: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) { ForEach(values, id: \.self) { Text($0).font(.footnote).foregroundStyle(.secondary) } }
    }
}

struct AnswerView: View {
    @Environment(AppSettings.self) private var settings
    var answer: TrafficAnswer
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            AssistantReplyText(text: answer.answer).textSelection(.enabled)
            if let action = answer.action {
                if action.kind == "lrt" { NavigationLink(settings.text("查看輕軌", "Open light rail")) { LRTView() } }
                else if let code = action.routeCode {
                    NavigationLink(settings.text("查看相關巴士", "Open the bus route")) { ResolvedBusView(code: code, direction: action.direction ?? 0) }
                }
            }
            if !answer.contextSummary.isEmpty {
                DisclosureGroup(settings.text("回答依據", "Answer sources")) {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(answer.contextSummary, id: \.self) { Text($0) }
                    Text(answer.model + " · " + answer.snapshotAt)
                }.font(.caption).foregroundStyle(.secondary)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
