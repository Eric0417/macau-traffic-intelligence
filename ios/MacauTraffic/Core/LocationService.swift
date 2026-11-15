import CoreLocation
import Observation

@Observable @MainActor final class LocationService: NSObject, @preconcurrency CLLocationManagerDelegate {
    private let manager: CLLocationManager
    private let requestTimeout: Duration
    private var pending: CheckedContinuation<Coordinate, Error>?
    private var requestID: UUID?
    private var timeout: Task<Void, Never>?
    private(set) var coordinate: Coordinate?
    private(set) var locating = false
    init(manager: CLLocationManager = CLLocationManager(), timeout: Duration = .seconds(20)) {
        self.manager = manager; requestTimeout = timeout
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }
    func request() async throws -> Coordinate {
        try Task.checkCancellation()
        guard pending == nil else { throw LocationError.busy }
        let id = UUID()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                guard !Task.isCancelled else { continuation.resume(throwing: CancellationError()); return }
                pending = continuation; requestID = id; locating = true
                timeout = Task { [weak self] in
                    guard let self else { return }
                    do { try await Task.sleep(for: requestTimeout) } catch { return }
                    if requestID == id { finish(.failure(LocationError.unavailable)) }
                }
                switch manager.authorizationStatus {
                case .notDetermined: manager.requestWhenInUseAuthorization()
                case .authorizedAlways, .authorizedWhenInUse: manager.startUpdatingLocation()
                default: finish(.failure(LocationError.denied))
                }
            }
        } onCancel: {
            Task { @MainActor in if self.requestID == id { self.finish(.failure(CancellationError())) } }
        }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard pending != nil else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: manager.startUpdatingLocation()
        case .denied, .restricted: finish(.failure(LocationError.denied))
        default: break
        }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard pending != nil else { return }
        guard let latest = locations.last, latest.horizontalAccuracy >= 0,
              abs(latest.timestamp.timeIntervalSinceNow) < 30 else { return }
        let value = Coordinate(latest.coordinate.longitude, latest.coordinate.latitude)
        coordinate = value; finish(.success(value))
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .locationUnknown { return }
        finish(.failure(error))
    }
    private func finish(_ result: Result<Coordinate, Error>) {
        timeout?.cancel(); timeout = nil
        manager.stopUpdatingLocation(); locating = false
        let continuation = pending; pending = nil; requestID = nil
        continuation?.resume(with: result)
    }
    enum LocationError: LocalizedError {
        case denied, unavailable, busy
        var errorDescription: String? {
            switch self {
            case .denied: "Location access is off. You can enter a landmark instead."
            case .unavailable: "Location is unavailable. You can enter a landmark instead."
            case .busy: "A location request is already running."
            }
        }
    }
}
