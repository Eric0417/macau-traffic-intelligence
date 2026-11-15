import SwiftUI

struct VoiceInputView: View {
    @Environment(AppSettings.self) private var settings
    var voice: VoiceRecorder
    var body: some View {
        HStack(spacing: 14) {
            Button { voice.cancel() } label: { Image(systemName: "xmark").font(.body.weight(.semibold)).frame(width: 44, height: 44).contentShape(Circle()) }
                .accessibilityLabel(settings.text("取消錄音", "Cancel recording"))
            VStack(spacing: 5) {
                VoiceWaveform(voice: voice).frame(height: 38)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let seconds = min(20, max(0, Int(context.date.timeIntervalSince(voice.startedAt ?? context.date))))
                    Text(String(format: "0:%02d / 0:20", seconds)).font(.caption2.monospacedDigit()).foregroundStyle(.white.opacity(0.6))
                }
            }
            Button { Task { await voice.stopAndTranscribe() } } label: {
                Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(.black).frame(width: 44, height: 44).contentShape(Circle()).background(.white, in: Circle())
            }.accessibilityLabel(settings.text("停止並轉寫", "Stop and transcribe"))
        }.foregroundStyle(.white).buttonStyle(.plain).padding(10)
    }
}

private struct VoiceWaveform: View {
    @Environment(AppSettings.self) private var settings
    var voice: VoiceRecorder
    var body: some View {
        Canvas { context, size in
            let count = max(1, Int(size.width / 4))
            let samples = Array(voice.levels.suffix(count))
            var baseline = Path()
            baseline.move(to: .init(x: 0, y: size.height / 2))
            baseline.addLine(to: .init(x: size.width, y: size.height / 2))
            context.stroke(baseline, with: .color(.white.opacity(0.2)), lineWidth: 1)
            for (index, level) in samples.enumerated() {
                let x = size.width - CGFloat(samples.count - index) * 4 + 2
                let height = max(2, CGFloat(level) * size.height)
                let rect = CGRect(x: x, y: (size.height - height) / 2, width: 2, height: height)
                context.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(.white))
            }
        }
        .accessibilityElement()
        .accessibilityLabel(settings.text("錄音聲量", "Recording level"))
        .accessibilityValue("\(Int((voice.levels.last ?? 0) * 100))%")
        .accessibilityIdentifier("voice-waveform")
    }
}
