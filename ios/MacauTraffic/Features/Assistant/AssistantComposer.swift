import SwiftUI

struct AssistantComposer: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dynamicTypeSize) private var typeSize
    @Bindable var state: AssistantState
    var voice: VoiceRecorder
    var typing: FocusState<Bool>.Binding
    var submit: () -> Void
    private var canSend: Bool { !state.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !state.busy && !voice.isStarting && !voice.isRecording && !voice.transcribing }
    var body: some View {
        VStack(spacing: 8) {
            if let error = voice.error { Text(error).font(.caption).foregroundStyle(.orange) }
            Group {
                if voice.isRecording { VoiceInputView(voice: voice) }
                else if voice.transcribing {
                    HStack(spacing: 14) {
                        ProgressView()
                        Text(settings.text("轉成文字…", "Transcribing…")).font(.subheadline)
                        Spacer()
                        Button { voice.cancel() } label: { Image(systemName: "xmark").frame(width: 44, height: 44).contentShape(Circle()) }
                            .accessibilityLabel(settings.text("取消轉寫", "Cancel transcription"))
                    }.padding(.horizontal, 18).padding(.vertical, 8)
                } else {
                    HStack(alignment: .bottom, spacing: 6) {
                        TextField("", text: $state.draft, prompt: Text(settings.text("問出行問題…", "Ask about your trip…")).foregroundColor(Color(.secondaryLabel)), axis: .vertical)
                            .tint(.primary)
                            .lineLimit(1...(typeSize.isAccessibilitySize ? 3 : 5)).focused(typing).padding(.leading, 14).padding(.vertical, 12)
                            .onChange(of: state.draft) { _, value in if value.count > 500 { state.draft = String(value.prefix(500)) } }
                            .accessibilityIdentifier("assistant-input")
                        Button { typing.wrappedValue = false; Task { await voice.start() } } label: {
                            Group {
                                if voice.isStarting { ProgressView() }
                                else { Image(systemName: "mic").font(.system(size: 20, weight: .medium)) }
                            }.foregroundStyle(.primary).frame(width: 44, height: 44).contentShape(Circle())
                        }.disabled(state.busy || voice.isStarting).accessibilityLabel(settings.text("DeepSeek 語音輸入", "DeepSeek voice input"))
                        Button {
                            if state.busy { state.cancel() } else { submit() }
                        } label: {
                            Image(systemName: state.busy ? "stop.fill" : "arrow.up")
                                .font(.system(size: state.busy ? 14 : 19, weight: .semibold))
                                .foregroundStyle(canSend || state.busy ? Color(.systemBackground) : Color(.tertiaryLabel))
                                .frame(width: 44, height: 44).contentShape(Circle())
                                .background(canSend || state.busy ? Color(.label) : Color(.tertiarySystemFill), in: Circle())
                        }.disabled(!canSend && !state.busy)
                            .accessibilityLabel(settings.text(state.busy ? "停止查詢" : "傳送問題", state.busy ? "Stop request" : "Send question"))
                            .accessibilityValue(canSend ? "Ready" : state.busy ? "Waiting" : "Empty")
                            .accessibilityIdentifier("assistant-send")
                    }.padding(6)
                }
            }
            .buttonStyle(.plain)
            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 28))
            .overlay { RoundedRectangle(cornerRadius: 28).strokeBorder(.primary.opacity(0.08), lineWidth: 1).allowsHitTesting(false) }
            Text(settings.text("最近對話會傳送畀 DeepSeek", "Recent messages are sent to DeepSeek"))
                .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 6).frame(maxWidth: 760)
            .frame(maxWidth: .infinity).background(Color(.systemBackground))
    }
}
