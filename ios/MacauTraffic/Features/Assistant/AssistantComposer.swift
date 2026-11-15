import SwiftUI

struct AssistantComposer: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dynamicTypeSize) private var typeSize
    @Bindable var state: AssistantState
    var voice: VoiceRecorder
    var typing: FocusState<Bool>.Binding
    var submit: () -> Void
    private var canSend: Bool { state.draft.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && !state.busy && !voice.isStarting && !voice.isRecording && !voice.transcribing }
    var body: some View {
        VStack(spacing: 8) {
            if let error = voice.error { Text(error).font(.caption).foregroundStyle(.orange) }
            Group {
                if voice.isRecording { VoiceInputView(voice: voice) }
                else if voice.transcribing {
                    HStack(spacing: 14) {
                        ProgressView().tint(.white)
                        Text(settings.text("轉成文字…", "Transcribing…")).font(.subheadline)
                        Spacer()
                        Button { voice.cancel() } label: { Image(systemName: "xmark").frame(width: 44, height: 44).contentShape(Circle()) }
                            .accessibilityLabel(settings.text("取消轉寫", "Cancel transcription"))
                    }.foregroundStyle(.white).padding(.horizontal, 18).padding(.vertical, 8)
                } else {
                    HStack(alignment: .bottom, spacing: 6) {
                        TextField("", text: $state.draft, prompt: Text(settings.text("講個目的地…", "Where to?")).foregroundColor(.white.opacity(0.48)), axis: .vertical)
                            .foregroundStyle(.white).tint(.white)
                            .lineLimit(1...(typeSize.isAccessibilitySize ? 3 : 5)).focused(typing).padding(.leading, 14).padding(.vertical, 12)
                            .onChange(of: state.draft) { _, value in if value.count > 500 { state.draft = String(value.prefix(500)) } }
                            .accessibilityIdentifier("assistant-input")
                        Button { typing.wrappedValue = false; Task { await voice.start() } } label: {
                            Group {
                                if voice.isStarting { ProgressView().tint(.white) }
                                else { Image(systemName: "mic").font(.system(size: 20, weight: .medium)) }
                            }.foregroundStyle(.white.opacity(0.85)).frame(width: 44, height: 44).contentShape(Circle())
                        }.disabled(state.busy || voice.isStarting).accessibilityLabel(settings.text("DeepSeek 語音輸入", "DeepSeek voice input"))
                        Button {
                            if state.busy { state.cancel() } else { submit() }
                        } label: {
                            Image(systemName: state.busy ? "stop.fill" : "arrow.up")
                                .font(.system(size: state.busy ? 14 : 19, weight: .semibold))
                                .foregroundStyle(canSend || state.busy ? Color.black : Color.white.opacity(0.35))
                                .frame(width: 44, height: 44).contentShape(Circle())
                                .background(canSend || state.busy ? Color.white : Color.white.opacity(0.1), in: Circle())
                        }.disabled(!canSend && !state.busy)
                            .accessibilityLabel(settings.text(state.busy ? "停止查詢" : "傳送問題", state.busy ? "Stop request" : "Send question"))
                            .accessibilityValue(canSend ? "Ready" : state.busy ? "Waiting" : "Empty")
                            .accessibilityIdentifier("assistant-send")
                    }.padding(8)
                }
            }
            .buttonStyle(.plain)
            .background(TransitStyle.ink, in: .rect(cornerRadius: 30))
            .overlay { RoundedRectangle(cornerRadius: 30).strokeBorder(.white.opacity(0.08), lineWidth: 1).allowsHitTesting(false) }
            if !typeSize.isAccessibilitySize { Text(settings.text("DeepSeek · 回答請核實", "DeepSeek · Check answers")).font(.caption2).foregroundStyle(.secondary) }
        }.padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 6).frame(maxWidth: 760)
            .background(.bar)
    }
}
