"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Camera } from "@/lib/types";
import { localized } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";

interface CameraViewerProps {
  camera: Camera | null;
  onClose: () => void;
}

export function CameraViewer({ camera, onClose }: CameraViewerProps) {
  const { locale, t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (camera && !dialog.open) dialog.showModal();
    if (!camera && dialog.open) dialog.close();
  }, [camera]);

  useEffect(() => {
    const activeCamera = camera;
    const video = videoRef.current;
    if (!activeCamera || !video) return;

    setError(false);
    let disposed = false;
    let destroy: (() => void) | undefined;

    async function startPlayback() {
      if (!activeCamera || !video) return;
      const Hls = (await import("hls.js")).default;
      if (disposed) return;

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = activeCamera.streamUrl;
        await video.play().catch(() => {});
        return;
      }

      if (!Hls.isSupported()) {
        setError(true);
        return;
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 2,
        maxBufferLength: 8,
      });
      hls.loadSource(activeCamera.streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(true);
      });
      destroy = () => hls.destroy();
    }

    void startPlayback();
    return () => {
      disposed = true;
      destroy?.();
      video.removeAttribute("src");
      video.load();
    };
  }, [camera]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(960px,calc(100vw-32px))] overflow-hidden rounded-lg border border-black/15 bg-[#111814] p-0 text-white shadow-2xl backdrop:bg-black/65"
    >
      {camera ? (
        <>
          <header className="flex min-h-14 items-center gap-3 border-b border-white/10 px-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold">{localized(camera.name, locale)}</h2>
              <p className="truncate text-xs text-white/55">
                {localized(camera.zone, locale)} · {localized(camera.subzone, locale)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-10 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              aria-label={t("close")}
            >
              <X aria-hidden="true" size={20} />
            </button>
          </header>
          <div className="relative aspect-video bg-black">
            <video
              ref={videoRef}
              className="size-full object-contain"
              controls
              muted
              playsInline
              aria-label={localized(camera.name, locale)}
            />
            {error ? (
              <div className="absolute inset-0 grid place-items-center bg-black/80 px-8 text-center text-sm text-white/75">
                {t("unavailable")}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </dialog>
  );
}
