import { encodeVoiceWav, VOICE_SAMPLE_RATE, VOICE_SECONDS } from "@/lib/voice-audio";

type AudioClip = { samples: Float32Array<ArrayBuffer>; sampleRate: number };

export function captureVoice({ signal, onRecording, onClip, onError }: {
  signal: AbortSignal;
  onRecording: () => void;
  onClip: (clip: AudioClip) => void;
  onError: (error: unknown) => void;
}): () => void {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
    throw new Error("microphone_unavailable");
  }
  const context = new AudioContext();
  let stream: MediaStream | undefined;
  let recorder: AudioWorkletNode | undefined;
  let timer: number | undefined;
  let closed = false;
  let stopping = false;

  function close() {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    signal.removeEventListener("abort", close);
    stream?.getTracks().forEach(track => track.stop());
    recorder?.port.close();
    void context.close().catch(() => {});
  }

  function fail(error: unknown) {
    if (closed) return;
    close();
    onError(error);
  }

  function stop() {
    if (closed || stopping || !recorder) return;
    stopping = true;
    window.clearTimeout(timer);
    recorder.port.postMessage("stop");
    timer = window.setTimeout(() => fail(new Error("microphone_unavailable")), 1_500);
  }

  signal.addEventListener("abort", close, { once: true });
  void Promise.all([
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } }).then(media => {
      if (closed) media.getTracks().forEach(track => track.stop());
      else stream = media;
      return media;
    }),
    context.resume(),
    context.audioWorklet.addModule("/voice-capture.js"),
  ]).then(([media]) => {
    if (closed) return;
    recorder = new AudioWorkletNode(context, "voice-capture", {
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: { seconds: VOICE_SECONDS },
    });
    recorder.onprocessorerror = () => fail(new Error("microphone_unavailable"));
    recorder.port.onmessage = ({ data }: MessageEvent<Float32Array<ArrayBuffer>>) => {
      if (closed) return;
      close();
      onClip({ samples: data, sampleRate: context.sampleRate });
    };
    context.createMediaStreamSource(media).connect(recorder);
    // The worklet leaves its output silent. Connecting it drives sample capture.
    recorder.connect(context.destination);
    media.getAudioTracks()[0]?.addEventListener("ended", stop, { once: true });
    timer = window.setTimeout(stop, VOICE_SECONDS * 1000);
    onRecording();
  }).catch(fail);

  return stop;
}

export async function requestVoiceTranscript(clip: AudioClip, signal: AbortSignal): Promise<string> {
  if (!clip.samples.length) throw new Error("no_speech");
  let samples = clip.samples;
  if (clip.sampleRate !== VOICE_SAMPLE_RATE) {
    const frames = Math.max(1, Math.floor(samples.length * VOICE_SAMPLE_RATE / clip.sampleRate));
    const context = new OfflineAudioContext(1, frames, VOICE_SAMPLE_RATE);
    const buffer = context.createBuffer(1, samples.length, clip.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    samples = (await context.startRendering()).getChannelData(0);
  }
  const response = await fetch("/api/v1/assistant/transcribe", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: encodeVoiceWav(samples),
    signal,
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok || typeof body.data?.text !== "string") throw new Error(body.error ?? "transcription_unavailable");
  return body.data.text;
}
