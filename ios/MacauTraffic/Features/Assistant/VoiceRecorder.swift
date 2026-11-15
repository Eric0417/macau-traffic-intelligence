import AVFoundation
import Observation

enum VoiceWAV {
    static func encode(_ samples: [Int16]) -> Data {
        let frames = Array(samples.prefix(320_000))
        var data = Data()
        func tag(_ string: String) { data.append(contentsOf: string.utf8) }
        func u16(_ value: UInt16) { data.append(UInt8(value & 255)); data.append(UInt8(value >> 8)) }
        func u32(_ value: UInt32) { for shift in stride(from: 0, through: 24, by: 8) { data.append(UInt8((value >> shift) & 255)) } }
        tag("RIFF"); u32(UInt32(36 + frames.count * 2)); tag("WAVEfmt "); u32(16); u16(1); u16(1)
        u32(16_000); u32(32_000); u16(2); u16(16); tag("data"); u32(UInt32(frames.count * 2))
        for sample in frames { u16(UInt16(bitPattern: sample)) }
        return data
    }
}

@Observable @MainActor final class VoiceRecorder: NSObject, @preconcurrency AVAudioRecorderDelegate {
    var isRecording = false
    var transcribing = false
    var startedAt: Date?
    var transcript = ""
    var error: String?
    private var recorder: AVAudioRecorder?
    private var file: URL?
    private var generation = 0
    private var upload: Task<Envelope<Transcript>, Error>?
    private static var cleanedTemporaryFiles = false
    private struct Transcript: Decodable { var text: String }
    override init() {
        super.init()
        guard !Self.cleanedTemporaryFiles else { return }
        Self.cleanedTemporaryFiles = true
        let files = (try? FileManager.default.contentsOfDirectory(at: FileManager.default.temporaryDirectory, includingPropertiesForKeys: nil)) ?? []
        for url in files where url.lastPathComponent.hasPrefix("macau-voice-") && url.pathExtension == "wav" {
            try? FileManager.default.removeItem(at: url)
        }
    }
    func start() async {
        guard !isRecording && !transcribing else { return }
        generation += 1; let current = generation; error = nil; transcript = ""
        guard await AVAudioApplication.requestRecordPermission() else { error = "Microphone permission is off. You can still type your question."; return }
        guard current == generation else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("macau-voice-\(UUID().uuidString).wav")
            file = url
            let value = try AVAudioRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16_000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsFloatKey: false])
            value.delegate = self; recorder = value
            guard value.record(forDuration: 20) else { throw APIError.invalidResponse }
            startedAt = .now; isRecording = true
        } catch { self.error = error.localizedDescription; cancel() }
    }
    func stopAndTranscribe() async {
        guard isRecording, let url = file else { return }
        let current = generation
        isRecording = false; transcribing = true; recorder?.stop(); recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        defer {
            try? FileManager.default.removeItem(at: url)
            if generation == current { file = nil; transcribing = false; upload = nil }
        }
        do {
            let audio = try AVAudioFile(forReading: url, commonFormat: .pcmFormatInt16, interleaved: false)
            guard audio.processingFormat.sampleRate == 16_000, audio.processingFormat.channelCount == 1,
                  audio.length > 0,
                  let buffer = AVAudioPCMBuffer(pcmFormat: audio.processingFormat, frameCapacity: AVAudioFrameCount(min(audio.length, 320_000))) else { throw APIError.invalidResponse }
            try audio.read(into: buffer)
            guard let channel = buffer.int16ChannelData?[0] else { throw APIError.invalidResponse }
            let samples = Array(UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength)))
            let task = Task<Envelope<Transcript>, Error> {
                try await APIClient.shared.send("assistant/transcribe", method: "POST", body: VoiceWAV.encode(samples), contentType: "audio/wav")
            }
            upload = task
            let response = try await task.value
            if generation == current { transcript = String(response.data.text.prefix(500)) }
        } catch { if generation == current { self.error = error.localizedDescription } }
    }
    func cancel() {
        generation += 1; isRecording = false; transcribing = false
        upload?.cancel(); upload = nil
        recorder?.stop(); recorder = nil
        if let file { try? FileManager.default.removeItem(at: file) }; file = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if flag && isRecording { Task { await stopAndTranscribe() } }
        else if isRecording { error = "Recording could not be completed."; cancel() }
    }
}
