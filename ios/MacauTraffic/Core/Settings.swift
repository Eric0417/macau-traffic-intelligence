import SwiftUI

enum AppLanguage: String, CaseIterable, Codable {
    case traditional = "zh-Hant", simplified = "zh-Hans", english = "en"
    var name: String { switch self { case .traditional: "繁體中文"; case .simplified: "简体中文"; case .english: "English" } }
}

struct SavedItem: Codable, Identifiable, Equatable {
    var id: String; var kind: String; var title: String; var routeCode: String?; var direction: Int?; var stationCode: String?; var sequence: Int?
}

@Observable @MainActor final class AppSettings {
    var language: AppLanguage { didSet { defaults.set(language.rawValue, forKey: "language") } }
    var appearance: String { didSet { defaults.set(appearance, forKey: "appearance") } }
    var saved: [SavedItem] { didSet { if let data = try? JSONEncoder().encode(saved) { defaults.set(data, forKey: "saved") } } }
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        language = AppLanguage(rawValue: defaults.string(forKey: "language") ?? "zh-Hant") ?? .traditional
        appearance = defaults.string(forKey: "appearance") ?? "system"
        saved = defaults.data(forKey: "saved").flatMap { try? JSONDecoder().decode([SavedItem].self, from: $0) } ?? []
    }
    var colorScheme: ColorScheme? { appearance == "dark" ? .dark : appearance == "light" ? .light : nil }
    func text(_ traditional: String, _ english: String) -> String {
        switch language {
        case .english: english
        case .traditional: traditional
        case .simplified: traditional.applyingTransform(StringTransform("Traditional-Simplified"), reverse: false) ?? traditional
        }
    }
    func toggle(_ item: SavedItem) {
        if saved.contains(where: { $0.id == item.id }) { saved.removeAll { $0.id == item.id } }
        else if saved.count < 100 { saved.append(item) }
    }
}
