import SwiftUI
import AVKit

struct CamerasView: View {
    @Environment(AppSettings.self) private var settings
    @State private var resource = LiveResource<[Camera]>()
    @State private var query = ""
    @State private var selected: Camera?
    var body: some View {
        List {
            LoadState(resource: resource) { Task { await resource.load("cameras") } }
            ForEach((resource.data ?? []).filter { query.isEmpty || $0.name.value(settings.language).localizedCaseInsensitiveContains(query) || $0.zone.value(settings.language).localizedCaseInsensitiveContains(query) }) { camera in
                Button { selected = camera } label: {
                    CityRow(title: camera.name.value(settings.language), symbol: "video.fill")
                }.foregroundStyle(.primary)
            }
            SourceNote(meta: resource.meta, error: resource.error)
        }.navigationTitle(settings.text("交通鏡頭", "Traffic cameras"))
            .searchable(text: $query, prompt: settings.text("搜尋鏡頭或地區", "Camera or area"))
            .livePolling(resource, path: "cameras", interval: 21_600)
            .sheet(item: $selected) { camera in CameraPlayerView(camera: camera) }
    }
}

@Observable @MainActor final class CameraPlayback {
    var player: AVPlayer?
    var failed = false
    private var observation: NSKeyValueObservation?
    func open(_ url: URL) {
        close(); failed = false
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch { failed = true; return }
        let item = AVPlayerItem(url: url)
        observation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in self?.failed = item.status == .failed }
        }
        player = AVPlayer(playerItem: item); player?.play()
    }
    func close() {
        player?.pause(); player?.replaceCurrentItem(with: nil); player = nil; observation = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

struct CameraPlayerView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    var camera: Camera
    @State private var playback = CameraPlayback()
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VideoPlayer(player: playback.player).aspectRatio(16 / 9, contentMode: .fit).clipShape(.rect(cornerRadius: 24))
                    if playback.failed {
                        Label(settings.text("官方影像暫時未能播放", "Official stream unavailable"), systemImage: "video.slash").foregroundStyle(.orange)
                        Button(settings.text("重試", "Retry")) { open() }
                    }
                    Text(camera.name.value(settings.language)).font(.title2.bold())
                    Text(camera.location.value(settings.language)).foregroundStyle(.secondary)
                    Text(settings.text("直接播放 DSAT 官方影像，應用唔會錄影或轉播。", "Plays the official DSAT stream directly. The app does not record or rehost it.")).font(.footnote).foregroundStyle(.secondary)
                    TransitMap(pins: [.init(id: camera.id, coordinate: camera.coordinates, title: camera.name.value(settings.language), symbol: "video.fill")], fitID: camera.id).frame(height: 220).clipShape(.rect(cornerRadius: 24))
                }.padding(20)
            }.navigationTitle(settings.text("即時影像", "Camera stream")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(settings.text("完成", "Done")) { dismiss() } } }
        }.onAppear { open() }.onDisappear { playback.close() }
            .onChange(of: phase) { _, phase in if phase == .active { playback.player?.play() } else { playback.player?.pause() } }
    }
    private func open() { if let url = URL(string: camera.streamUrl), url.scheme == "https" { playback.open(url) } else { playback.failed = true } }
}
