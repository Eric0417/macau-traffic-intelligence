import Foundation
import Observation

@Observable @MainActor final class AssistantState {
    private let client: APIClient
    init(client: APIClient = .shared) { self.client = client }
    var draft = ""
    var currentQuestion = ""
    var result: AssistantResult?
    var answer: TrafficAnswer?
    var meta: SourceMeta?
    var pending: AssistantRequest?
    var activeTrip: TripDraft?
    var busy = false
    var cancelled = false
    var preview = false
    var error: String?
    private var task: Task<Void, Never>?
    private var generation = 0

    func ask(locale: String) {
        let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (2...500).contains(question.count), !busy else { return }
        draft = ""
        start(.init(question: question, locale: locale, previousTrip: activeTrip))
    }
    func start(_ request: AssistantRequest) {
        task?.cancel(); generation += 1
        let current = generation
        pending = request; currentQuestion = request.question; busy = true; error = nil; result = nil; answer = nil; meta = nil
        cancelled = false; preview = false
        task = Task {
            defer { if generation == current { busy = false } }
            do {
                let response = try await client.journey(request) { [weak self] event in
                    guard let self, generation == current, busy else { return }
                    switch event {
                    case .candidates(let plans): result = .plans(plans); preview = true; activeTrip = nil
                    default: break
                    }
                }
                try Task.checkCancellation()
                guard generation == current else { return }
                preview = false
                if case .traffic = response.data {
                    let response: Envelope<TrafficAnswer> = try await client.post("assistant", body: TrafficQuestion(question: request.question, locale: request.locale))
                    try Task.checkCancellation()
                    guard generation == current else { return }
                    answer = response.data; meta = response.meta; activeTrip = nil
                } else {
                    apply(response.data, request: request); meta = response.meta
                }
            } catch { if !Task.isCancelled && generation == current { self.error = error.localizedDescription } }
        }
    }
    func apply(_ result: AssistantResult, request: AssistantRequest) {
        self.result = result
        var continuation = request
        switch result {
        case .location(let place): continuation.destinationId = place.id; activeTrip = nil
        case .facilityLocation(let value): continuation.facilitySearch = value.search; activeTrip = nil
        case .choose(let value):
            continuation.destinationId = value.destination?.id ?? continuation.destinationId
            continuation.originQuery = value.originQuery ?? continuation.originQuery
            continuation.facilitySearch = value.facilitySearch ?? continuation.facilitySearch
            activeTrip = nil
        case .tripDetails(let value): continuation.trip = value.draft; activeTrip = value.draft
        case .tripChoice(let value): continuation.trip = value.draft; activeTrip = value.draft
        case .tripLocation(let draft): continuation.trip = draft; activeTrip = draft
        case .itineraries(let plans):
            continuation.trip = plans.draft
            activeTrip = plans.options.first.map { plans.editable($0) } ?? plans.draft
        default: activeTrip = nil
        }
        pending = continuation
    }
    func useOrigin(query: String? = nil, coordinate: Coordinate? = nil) {
        guard var request = pending else { return }
        request.origin = coordinate; request.originId = nil; request.originQuery = query
        if request.trip != nil { request.trip?.originQuery = query; request.trip?.originId = nil }
        start(request)
    }
    func choose(_ place: Place, field: String) {
        guard var request = pending else { return }
        if field == "origin" { request.originId = place.id; request.originQuery = nil; request.origin = nil }
        else { request.destinationId = place.id }
        start(request)
    }
    func chooseTrip(_ place: Place, choice: TripChoice) {
        var draft = choice.draft
        switch choice.field {
        case .name("origin"): draft.originId = place.id; draft.originQuery = place.name
        case .name("end"): draft.endId = place.id; draft.endQuery = place.name
        case .index(let index):
            guard draft.stops.indices.contains(index) else { return }
            draft.stops[index].placeId = place.id; draft.stops[index].query = place.name
        default: return
        }
        continueTrip(draft)
    }
    func correctTripPlace(_ query: String, choice: TripChoice) {
        let value = String(query.trimmingCharacters(in: .whitespacesAndNewlines).prefix(150))
        guard !value.isEmpty else { return }
        var draft = choice.draft
        switch choice.field {
        case .name("origin"): draft.originId = nil; draft.originQuery = value
        case .name("end"): draft.endId = nil; draft.endQuery = value
        case .index(let index):
            guard draft.stops.indices.contains(index) else { return }
            draft.stops[index].placeId = nil; draft.stops[index].query = value
        default: return
        }
        continueTrip(draft)
    }
    func continueTrip(_ draft: TripDraft) {
        guard var request = pending else { return }
        request.trip = draft; start(request)
    }
    func directions(to place: Place, from origin: Place) {
        guard let request = pending else { return }
        start(.init(question: request.question, locale: request.locale, destinationId: place.id, origin: origin.coordinates))
    }
    func clear() {
        task?.cancel(); generation += 1; busy = false
        draft = ""; currentQuestion = ""; result = nil; answer = nil; pending = nil; activeTrip = nil; error = nil; meta = nil
        cancelled = false; preview = false
    }
    func cancel() {
        task?.cancel(); generation += 1; busy = false; cancelled = true
        if draft.isEmpty { draft = currentQuestion }
    }
}
