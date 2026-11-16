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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var voice: VoiceRecorder
    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { frame in
            let samples = voice.levels
            let reference = reduceMotion ? samples.last?.date ?? frame.date : frame.date
            Canvas { context, size in
                var baseline = Path()
                baseline.move(to: .init(x: 0, y: size.height / 2))
                baseline.addLine(to: .init(x: size.width, y: size.height / 2))
                context.stroke(baseline, with: .color(.white.opacity(0.2)), lineWidth: 1)
                var bars = Path()
                for sample in samples {
                    // The time axis advances on each display frame, even between meter reads.
                    let x = size.width - 2 - max(0, reference.timeIntervalSince(sample.date)) * 80
                    guard x > -2 else { continue }
                    let height = max(2, CGFloat(sample.level) * size.height)
                    bars.addRoundedRect(in: CGRect(x: x, y: (size.height - height) / 2, width: 2, height: height), cornerSize: CGSize(width: 1, height: 1))
                }
                context.fill(bars, with: .color(.white))
            }
        }
        .clipped()
        .accessibilityElement()
        .accessibilityLabel(settings.text("錄音聲量", "Recording level"))
        .accessibilityValue("\(Int((voice.levels.last?.level ?? 0) * 100))%")
        .accessibilityIdentifier("voice-waveform")
    }
}
