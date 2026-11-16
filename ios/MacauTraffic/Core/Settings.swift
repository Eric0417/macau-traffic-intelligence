import SwiftUI

enum AppLanguage: String, CaseIterable, Codable {
    case traditional = "zh-Hant", simplified = "zh-Hans", english = "en"
    case japanese = "ja", korean = "ko", portuguese = "pt", spanish = "es"

    var name: String {
        switch self {
        case .traditional: "繁體中文"
        case .simplified: "简体中文"
        case .english: "English"
        case .japanese: "日本語"
        case .korean: "한국어"
        case .portuguese: "Português"
        case .spanish: "Español"
        }
    }

    static func preferred(in identifiers: [String]) -> Self {
        for identifier in identifiers {
            let language = Locale.Language(identifier: identifier)
            guard let code = language.languageCode?.identifier else { continue }
            if code == "yue" { return .traditional }
            if code == "zh" {
                if language.script?.identifier == "Hant" { return .traditional }
                if language.script?.identifier == "Hans" { return .simplified }
                return ["HK", "MO", "TW"].contains(language.region?.identifier ?? "") ? .traditional : .simplified
            }
            if let supported = Self(rawValue: code) { return supported }
        }
        return .english
    }

    private static let bundles = Dictionary(uniqueKeysWithValues: allCases.compactMap { language in
        Bundle.main.url(forResource: language.rawValue, withExtension: "lproj")
            .flatMap(Bundle.init(url:)).map { (language, $0) }
    })

    func localized(_ english: String.LocalizationValue) -> String {
        String(localized: english, bundle: Self.bundles[self] ?? Self.bundles[.english], locale: Locale(identifier: rawValue))
    }
}

struct SavedItem: Codable, Identifiable, Equatable {
    var id: String; var kind: String; var title: String; var routeCode: String?; var direction: Int?; var stationCode: String?; var sequence: Int?
}

@Observable @MainActor final class AppSettings {
    var languageOverride: AppLanguage? { didSet { defaults.set(languageOverride?.rawValue, forKey: "language") } }
    private var systemLanguage: AppLanguage
    var language: AppLanguage { languageOverride ?? systemLanguage }
    var appearance: String { didSet { defaults.set(appearance, forKey: "appearance") } }
    var saved: [SavedItem] { didSet { if let data = try? JSONEncoder().encode(saved) { defaults.set(data, forKey: "saved") } } }
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        languageOverride = defaults.string(forKey: "language").flatMap(AppLanguage.init(rawValue:))
        systemLanguage = .preferred(in: Locale.preferredLanguages)
        appearance = defaults.string(forKey: "appearance") ?? "system"
        saved = defaults.data(forKey: "saved").flatMap { try? JSONDecoder().decode([SavedItem].self, from: $0) } ?? []
    }
    var colorScheme: ColorScheme? { appearance == "dark" ? .dark : appearance == "light" ? .light : nil }
    func refreshSystemLanguage() { systemLanguage = .preferred(in: Locale.preferredLanguages) }
    func text(_ traditional: String, _ english: String.LocalizationValue) -> String {
        switch language {
        case .traditional: traditional
        case .simplified: traditional.applyingTransform(StringTransform("Traditional-Simplified"), reverse: false) ?? traditional
        default: language.localized(english)
        }
    }
    func description(for error: Error) -> String {
        switch error as? LocationService.LocationError {
        case .denied: text("定位權限已關閉，可以改用地標。", "Location access is off. You can enter a landmark instead.")
        case .unavailable: text("暫時未能定位，可以改用地標。", "Location is unavailable. You can enter a landmark instead.")
        case .busy: text("正在定位。", "A location request is already running.")
        case nil: error.localizedDescription
        }
    }
    func toggle(_ item: SavedItem) {
        if saved.contains(where: { $0.id == item.id }) { saved.removeAll { $0.id == item.id } }
        else if saved.count < 100 { saved.append(item) }
    }
}
