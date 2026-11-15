import CoreLocation
import Observation

@Observable @MainActor final class LocationService: NSObject, @preconcurrency CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var pending: CheckedContinuation<Coordinate, Error>?
    private var timeout: Task<Void, Never>?
    private(set) var coordinate: Coordinate?
    private(set) var locating = false
    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }
    func request() async throws -> Coordinate {
        guard pending == nil else { throw LocationError.busy }
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation; locating = true
                timeout = Task { [weak self] in
                    do { try await Task.sleep(for: .seconds(20)) } catch { return }
                    self?.finish(.failure(LocationError.unavailable))
                }
                switch manager.authorizationStatus {
                case .notDetermined: manager.requestWhenInUseAuthorization()
                case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
                default: finish(.failure(LocationError.denied))
                }
            }
        } onCancel: {
            Task { @MainActor in self.finish(.failure(CancellationError())) }
        }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard pending != nil else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
        case .denied, .restricted: finish(.failure(LocationError.denied))
        default: break
        }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last, latest.horizontalAccuracy >= 0,
              abs(latest.timestamp.timeIntervalSinceNow) < 60 else { finish(.failure(LocationError.unavailable)); return }
        let value = Coordinate(latest.coordinate.longitude, latest.coordinate.latitude)
        coordinate = value; finish(.success(value))
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { finish(.failure(error)) }
    private func finish(_ result: Result<Coordinate, Error>) {
        timeout?.cancel(); timeout = nil
        manager.stopUpdatingLocation(); locating = false
        let continuation = pending; pending = nil
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
