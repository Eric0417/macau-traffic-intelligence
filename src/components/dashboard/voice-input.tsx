"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { VOICE_SECONDS } from "@/lib/voice-audio";
import { captureVoice, requestVoiceTranscript } from "./voice-recording";

const copy = {
  "zh-Hant": {
    start: "語音輸入", stop: "停止錄音", cancel: "取消",
    notice: `最多錄 ${VOICE_SECONDS} 秒，錄音結束後會交畀 DeepSeek 轉成文字。`,
    permission: "請允許使用咪高峰。", recording: "錄音中。", transcribing: "正在轉成文字…",
    microphone: "未能使用咪高峰。請檢查瀏覽器權限，或直接輸入。",
    empty: "未辨認到說話，請再試。", limited: "語音輸入太頻密，請等一分鐘再試。",
    unavailable: "暫時未能轉成文字，可以直接輸入。",
  },
  "zh-Hans": {
    start: "语音输入", stop: "停止录音", cancel: "取消",
    notice: `最多录 ${VOICE_SECONDS} 秒，录音结束后会发送给 DeepSeek 转成文字。`,
    permission: "请允许使用麦克风。", recording: "录音中。", transcribing: "正在转成文字…",
    microphone: "无法使用麦克风。请检查浏览器权限，或直接输入。",
    empty: "未识别到语音，请重试。", limited: "语音输入过于频繁，请等一分钟再试。",
    unavailable: "暂时无法转成文字，可以直接输入。",
  },
  en: {
    start: "Voice input", stop: "Stop recording", cancel: "Cancel",
    notice: `Record up to ${VOICE_SECONDS} seconds. Your clip goes to DeepSeek for transcription when recording ends.`,
    permission: "Allow microphone access.", recording: "Recording.", transcribing: "Transcribing…",
    microphone: "Microphone unavailable. Check browser permissions or type your question.",
    empty: "No speech detected. Try again.", limited: "Too many voice requests. Try again in a minute.",
    unavailable: "Transcription is unavailable. You can type your question.",
  },
};

export function VoiceInput({ onTranscript, disabled }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const { locale } = useLanguage();
  const c = copy[locale];
  const noticeId = useId();
  const [phase, setPhase] = useState<"idle" | "requesting" | "recording" | "transcribing">("idle");
  const [error, setError] = useState<"microphone" | "empty" | "limited" | "unavailable" | null>(null);
  const session = useRef<{ abort: AbortController; stop: () => void } | null>(null);

  const cancel = useCallback(() => {
    session.current?.abort.abort();
    session.current = null;
  }, []);
  useEffect(() => {
    function interrupt() {
      if (!session.current) return;
      cancel();
      setPhase("idle");
    }
    function onHidden() {
      if (document.hidden) interrupt();
    }
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", interrupt);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", interrupt);
      cancel();
    };
  }, [cancel]);

  function toggle() {
    if (session.current) {
      if (phase === "recording") {
        setPhase("transcribing");
        session.current.stop();
      }
      return;
    }
    const abort = new AbortController();
    const { signal } = abort;
    setError(null);
    setPhase("requesting");
    const onError = () => {
      if (signal.aborted) return;
      session.current = null;
      setPhase("idle");
      setError("microphone");
    };
    try {
      const stop = captureVoice({
        signal,
        onRecording: () => setPhase("recording"),
        onClip: async clip => {
          setPhase("transcribing");
          try {
            const text = await requestVoiceTranscript(clip, signal);
            if (!signal.aborted) onTranscript(text);
          } catch (failure) {
            const code = failure instanceof Error ? failure.message : "";
            if (!signal.aborted) setError(code === "no_speech" ? "empty" : code === "rate_limited" ? "limited" : "unavailable");
          } finally {
            if (!signal.aborted) {
              session.current = null;
              setPhase("idle");
            }
          }
        },
        onError,
      });
      session.current = { abort, stop };
    } catch {
      abort.abort();
      setPhase("idle");
      setError("microphone");
    }
  }

  const recording = phase === "recording";
  const pending = phase !== "idle";
  const title = recording ? c.stop : c.start;
  return <>
    <button type="button" className="voice-trigger" data-recording={recording} aria-label={title} aria-describedby={noticeId}
      title={title} disabled={disabled || phase === "requesting" || phase === "transcribing"} onClick={toggle}>
      {recording ? <Square size={17} fill="currentColor" aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
    </button>
    <span className="sr-only" id={noticeId}>{c.notice}</span>
    {(pending || error) ? <div className="voice-feedback">
      <span role="status">{error ? c[error] : phase === "requesting" ? `${c.permission} ${c.notice}` : recording ? `${c.recording} ${c.notice}` : c.transcribing}</span>
      {pending ? <button type="button" onClick={() => { cancel(); setPhase("idle"); }}>{c.cancel}</button> : null}
    </div> : null}
  </>;
}
