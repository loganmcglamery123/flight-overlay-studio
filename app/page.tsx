"use client";

import {
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Maximize2,
  Mountain,
  Move,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sticker,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { parseIgc, type FlightAnalysis } from "@/lib/flight";
import {
  createDefaultSettings,
  renderComposite,
  STAT_OPTIONS,
  statElementId,
  type MediaFit,
  type OverlayElementFrame,
  type OverlayElementId,
  type OverlaySettings,
  type OverlayStyle,
  type SportIcon,
  type StatKey,
  type TrackOrientation,
  type UnitSystem,
} from "@/lib/render-overlay";

type MediaKind = "image" | "video";

type MediaState = {
  file: File;
  kind: MediaKind;
  url: string;
  width: number;
  height: number;
  duration: number;
};

type ToolbarUploadProps = {
  id: string;
  label: string;
  accept: string;
  loadedLabel: string | null;
  icon: React.ReactNode;
  onFile: (file: File) => void;
};

function ToolbarUpload({ id, label, accept, loadedLabel, icon, onFile }: ToolbarUploadProps) {
  return (
    <label className={`toolbar-upload ${loadedLabel ? "toolbar-upload--loaded" : ""}`} htmlFor={id}>
      <input
        id={id}
        className="sr-only"
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
      <span className="toolbar-upload__icon">{loadedLabel ? <Check aria-hidden="true" /> : icon}</span>
      <span className="toolbar-upload__text">
        <strong>{label}</strong>
        <small>{loadedLabel ?? "Choose file"}</small>
      </span>
      <Upload className="toolbar-upload__action" aria-hidden="true" />
    </label>
  );
}

type ColorFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function ColorField({ id, label, value, onChange }: ColorFieldProps) {
  return (
    <div className="compact-color-field">
      <Label htmlFor={id}>{label}</Label>
      <div>
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <span>{value.toUpperCase()}</span>
      </div>
    </div>
  );
}

type RangeFieldProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function RangeField({ id, label, value, min, max, step, display, disabled, onChange }: RangeFieldProps) {
  return (
    <div className="compact-range-field">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <span>{display}</span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0])}
      />
    </div>
  );
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function safeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "flight-overlay";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not create the export file."));
    }, type, quality);
  });
}

function waitForSeek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.02) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video could not be prepared for export."));
    }, 8_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video could not be read by this browser."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = time;
  });
}

function bestMp4RecorderType() {
  const candidates = [
    "video/mp4",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function statKeyFromElement(id: OverlayElementId | null): StatKey | null {
  if (!id?.startsWith("stat:")) return null;
  return id.slice(5) as StatKey;
}

function elementLabel(id: OverlayElementId | null) {
  if (!id) return "Canvas settings";
  if (id === "track") return "Track outline";
  if (id === "elevation") return "Altitude graph";
  if (id === "sportIcon") return "Flight-sport mark";
  if (id === "title") return "Flight title";
  const key = statKeyFromElement(id);
  return STAT_OPTIONS.find((option) => option.key === key)?.label ?? "Statistic";
}

function frameMinimum(id: OverlayElementId) {
  if (id === "track") return { width: 0.2, height: 0.16 };
  if (id === "elevation") return { width: 0.24, height: 0.09 };
  if (id === "sportIcon") return { width: 0.045, height: 0.045 };
  if (id === "title") return { width: 0.18, height: 0.05 };
  return { width: 0.14, height: 0.055 };
}

function constrainFrame(frame: OverlayElementFrame, id: OverlayElementId): OverlayElementFrame {
  const minimum = frameMinimum(id);
  const width = Math.min(1, Math.max(minimum.width, frame.width));
  const height = Math.min(1, Math.max(minimum.height, frame.height));
  return {
    x: Math.min(1 - width, Math.max(0, frame.x)),
    y: Math.min(1 - height, Math.max(0, frame.y)),
    width,
    height,
  };
}

const STAT_SLOTS: OverlayElementFrame[] = [
  { x: 0.04, y: 0.72, width: 0.4, height: 0.085 },
  { x: 0.56, y: 0.72, width: 0.4, height: 0.085 },
  { x: 0.04, y: 0.82, width: 0.4, height: 0.085 },
  { x: 0.56, y: 0.82, width: 0.4, height: 0.085 },
  { x: 0.04, y: 0.62, width: 0.4, height: 0.085 },
  { x: 0.56, y: 0.62, width: 0.4, height: 0.085 },
  { x: 0.04, y: 0.52, width: 0.4, height: 0.085 },
  { x: 0.56, y: 0.52, width: 0.4, height: 0.085 },
  { x: 0.3, y: 0.82, width: 0.4, height: 0.085 },
];

type ActiveInteraction = {
  id: OverlayElementId;
  mode: "move" | "resize" | "rotate";
  startX: number;
  startY: number;
  startFrame: OverlayElementFrame;
  panelWidth: number;
  panelHeight: number;
  centerX: number;
  centerY: number;
};

export default function Home() {
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(null);
  const [igcName, setIgcName] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [settings, setSettings] = useState<OverlaySettings>(() => createDefaultSettings());
  const [selectedElement, setSelectedElement] = useState<OverlayElementId | null>("track");
  const [elementsOpen, setElementsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [stageDisplay, setStageDisplay] = useState({ width: 0, height: 0 });

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const panelOverlayRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const interactionRef = useRef<ActiveInteraction | null>(null);
  const exportRef = useRef<{ cancelled: boolean; recorder: MediaRecorder | null }>({
    cancelled: false,
    recorder: null,
  });

  const previewSize = useMemo(() => {
    if (!media?.width || !media.height) return { width: 1_200, height: 675 };
    const aspect = media.width / media.height;
    if (aspect >= 1) return { width: 1_200, height: Math.max(420, Math.round(1_200 / aspect)) };
    return { width: Math.max(520, Math.round(1_000 * aspect)), height: 1_000 };
  }, [media?.height, media?.width]);

  const updateSettings = <Key extends keyof OverlaySettings>(key: Key, value: OverlaySettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateElementFrame = (id: OverlayElementId, next: Partial<OverlayElementFrame>) => {
    setSettings((current) => {
      const frame = constrainFrame({ ...current.elementFrames[id], ...next }, id);
      return {
        ...current,
        elementFrames: { ...current.elementFrames, [id]: frame },
      };
    });
  };

  const currentMediaElement = () => {
    if (!mediaReady || !media) return null;
    return media.kind === "image" ? imageRef.current : videoRef.current;
  };

  const drawPreview = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    if (canvas.width !== previewSize.width || canvas.height !== previewSize.height) {
      canvas.width = previewSize.width;
      canvas.height = previewSize.height;
    }
    renderComposite(canvas, currentMediaElement(), analysis, settings);
  };

  const drawPreviewRef = useRef(drawPreview);

  useEffect(() => {
    drawPreviewRef.current = drawPreview;
  });

  useEffect(() => {
    drawPreview();
    // drawPreview deliberately reads the latest refs and state in this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, mediaReady, previewSize.height, previewSize.width, settings]);

  useEffect(() => {
    const viewport = stageViewportRef.current;
    if (!viewport) return;
    const resize = () => {
      const width = Math.max(1, viewport.clientWidth - 16);
      const height = Math.max(1, viewport.clientHeight - 16);
      const aspect = previewSize.width / previewSize.height;
      const fitted = width / height > aspect
        ? { width: height * aspect, height }
        : { width, height: width / aspect };
      setStageDisplay({
        width: Math.max(1, Math.floor(fitted.width)),
        height: Math.max(1, Math.floor(fitted.height)),
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    return () => observer.disconnect();
  }, [previewSize.height, previewSize.width]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = interactionRef.current;
      if (!active) return;
      event.preventDefault();

      if (active.mode === "rotate") {
        const raw = (Math.atan2(event.clientY - active.centerY, event.clientX - active.centerX) * 180) / Math.PI + 90;
        const rotation = ((raw + 540) % 360) - 180;
        setSettings((current) => ({
          ...current,
          trackOrientation: "custom",
          trackRotation: rotation,
        }));
        return;
      }

      const deltaX = (event.clientX - active.startX) / active.panelWidth;
      const deltaY = (event.clientY - active.startY) / active.panelHeight;
      const candidate = active.mode === "move"
        ? { ...active.startFrame, x: active.startFrame.x + deltaX, y: active.startFrame.y + deltaY }
        : { ...active.startFrame, width: active.startFrame.width + deltaX, height: active.startFrame.height + deltaY };
      const frame = constrainFrame(candidate, active.id);
      setSettings((current) => ({
        ...current,
        elementFrames: { ...current.elementFrames, [active.id]: frame },
      }));
    };
    const end = () => {
      interactionRef.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    };
  }, []);

  const beginInteraction = (
    event: React.PointerEvent<HTMLElement>,
    id: OverlayElementId,
    mode: ActiveInteraction["mode"],
  ) => {
    const panel = panelOverlayRef.current;
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedElement(id);
    const panelBounds = panel.getBoundingClientRect();
    const element = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-element-id]");
    const elementBounds = element?.getBoundingClientRect();
    interactionRef.current = {
      id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startFrame: { ...settings.elementFrames[id] },
      panelWidth: Math.max(1, panelBounds.width),
      panelHeight: Math.max(1, panelBounds.height),
      centerX: elementBounds ? elementBounds.left + elementBounds.width / 2 : event.clientX,
      centerY: elementBounds ? elementBounds.top + elementBounds.height / 2 : event.clientY,
    };
  };

  const startPreviewAnimation = () => {
    setVideoPlaying(true);
    if (exportRef.current.recorder) return;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    const tick = () => {
      const video = videoRef.current;
      drawPreviewRef.current();
      if (video && !video.paused && !video.ended) {
        setVideoProgress(video.currentTime);
        animationRef.current = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
      }
    };
    tick();
  };

  const stopPreviewAnimation = () => {
    setVideoPlaying(false);
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    drawPreviewRef.current();
  };

  const handleIgc = async (file: File) => {
    setError(null);
    setMessage(null);
    setParsing(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const parsed = parseIgc(await file.text());
      setAnalysis(parsed);
      setIgcName(file.name);
      setMessage(
        `Loaded ${parsed.points.length.toLocaleString("en-US")} fixes${parsed.ignoredFixes ? `; ignored ${parsed.ignoredFixes} invalid fixes` : ""}.`,
      );
    } catch (caught) {
      setAnalysis(null);
      setIgcName(null);
      setError(caught instanceof Error ? caught.message : "The IGC file could not be read.");
    } finally {
      setParsing(false);
    }
  };

  const handleMedia = (file: File) => {
    setError(null);
    setMessage(null);
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Choose an image or video supported by your browser.");
      return;
    }

    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    const url = URL.createObjectURL(file);
    mediaUrlRef.current = url;
    setMediaReady(false);
    imageRef.current = null;
    const kind: MediaKind = file.type.startsWith("video/") ? "video" : "image";
    setMedia({ file, kind, url, width: 0, height: 0, duration: 0 });
    setVideoProgress(0);
    setVideoPlaying(false);

    if (kind === "image") {
      const image = new window.Image();
      image.onload = () => {
        imageRef.current = image;
        setMedia((current) => current?.url === url
          ? { ...current, width: image.naturalWidth, height: image.naturalHeight }
          : current);
        setMediaReady(true);
        setMessage(`Loaded ${image.naturalWidth} × ${image.naturalHeight} image.`);
      };
      image.onerror = () => {
        setError("That image format could not be decoded by this browser.");
        setMediaReady(false);
      };
      image.src = url;
    }
  };

  const toggleStat = (key: StatKey, checked: boolean) => {
    setSettings((current) => {
      if (!checked) {
        return { ...current, enabledStats: current.enabledStats.filter((item) => item !== key) };
      }
      if (current.enabledStats.includes(key)) return current;
      const usedFrames = current.enabledStats.map((item) => current.elementFrames[statElementId(item)]);
      const slot = STAT_SLOTS.find((candidate) => !usedFrames.some((frame) => (
        Math.abs(frame.x - candidate.x) < 0.04 && Math.abs(frame.y - candidate.y) < 0.04
      ))) ?? STAT_SLOTS.at(-1)!;
      return {
        ...current,
        enabledStats: [...current.enabledStats, key],
        elementFrames: {
          ...current.elementFrames,
          [statElementId(key)]: { ...slot },
        },
      };
    });
  };

  const removeElement = (id: OverlayElementId) => {
    if (id === "track") updateSettings("showTrack", false);
    else if (id === "elevation") updateSettings("showElevation", false);
    else if (id === "sportIcon") updateSettings("sportIcon", "none");
    else if (id === "title") updateSettings("title", "");
    else {
      const key = statKeyFromElement(id);
      if (key) toggleStat(key, false);
    }
    setSelectedElement(null);
  };

  const restoreElement = (id: "track" | "elevation" | "sportIcon" | "title", checked: boolean) => {
    if (id === "track") updateSettings("showTrack", checked);
    else if (id === "elevation") updateSettings("showElevation", checked);
    else if (id === "sportIcon") updateSettings("sportIcon", checked ? "paraglider" : "none");
    else updateSettings("title", checked ? (settings.title || "My flight") : "");
  };

  const visibleElements = useMemo<OverlayElementId[]>(() => {
    const items: OverlayElementId[] = [];
    if (settings.title.trim()) items.push("title");
    if (settings.showTrack) items.push("track");
    if (settings.showElevation) items.push("elevation");
    settings.enabledStats.forEach((key) => items.push(statElementId(key)));
    if (settings.sportIcon !== "none") items.push("sportIcon");
    return items;
  }, [settings.enabledStats, settings.showElevation, settings.showTrack, settings.sportIcon, settings.title]);

  const toggleVideoPlayback = async () => {
    const video = videoRef.current;
    if (!video || !mediaReady) return;
    setError(null);
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setError("This browser blocked video playback. Tap the preview and try again.");
      }
    } else {
      video.pause();
    }
  };

  const exportImage = async () => {
    if (!analysis || !media || media.kind !== "image" || !imageRef.current) return;
    setError(null);
    setMessage(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = media.width;
      canvas.height = media.height;
      renderComposite(canvas, imageRef.current, analysis, settings);
      const blob = await canvasToBlob(canvas, "image/jpeg", 1);
      downloadBlob(blob, `${safeName(settings.title || media.file.name)}-overlay.jpg`);
      setMessage("Downloaded a full-resolution, maximum-quality JPEG.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The photo could not be exported.");
    }
  };

  const exportSticker = async () => {
    if (!analysis || !media || !media.width || !media.height) return;
    setError(null);
    setMessage(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = media.width;
      canvas.height = media.height;
      renderComposite(canvas, null, analysis, settings, true);
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, `${safeName(settings.title || media.file.name)}-sticker.png`);
      setMessage("Downloaded a transparent PNG at the source dimensions.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The transparent sticker could not be exported.");
    }
  };

  const cancelVideoExport = () => {
    exportRef.current.cancelled = true;
    videoRef.current?.pause();
    if (exportRef.current.recorder?.state === "recording") exportRef.current.recorder.stop();
  };

  const exportVideo = async () => {
    const video = videoRef.current as (HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    }) | null;
    if (!analysis || !media || media.kind !== "video" || !video) return;
    if (!("MediaRecorder" in window) || !(HTMLCanvasElement.prototype as HTMLCanvasElement & { captureStream?: unknown }).captureStream) {
      setError("Video export is not supported here. Use a current Chrome or Edge browser.");
      return;
    }
    const mp4MimeType = bestMp4RecorderType();
    if (!mp4MimeType) {
      setError("This browser cannot record MP4 video. Try the latest Chrome, Edge, or Safari.");
      return;
    }

    setError(null);
    setMessage(null);
    setExporting(true);
    setExportProgress(0);
    exportRef.current = { cancelled: false, recorder: null };
    const previousTime = video.currentTime;
    const wasPaused = video.paused;
    const previousMuted = video.muted;
    let outputStream: MediaStream | null = null;
    let recordingResult: Promise<Blob> | null = null;

    try {
      video.pause();
      await waitForSeek(video, 0);
      const canvas = document.createElement("canvas");
      canvas.width = media.width;
      canvas.height = media.height;
      const activeOutputStream = canvas.captureStream(30);
      outputStream = activeOutputStream;

      if (includeAudio) {
        const capture = video.captureStream ?? video.mozCaptureStream;
        if (capture) {
          const sourceStream = capture.call(video);
          sourceStream.getAudioTracks().forEach((track) => activeOutputStream.addTrack(track));
        }
      }

      const recorder = new MediaRecorder(activeOutputStream, {
        mimeType: mp4MimeType,
        videoBitsPerSecond: media.width >= 2_560 ? 18_000_000 : media.width >= 1_920 ? 10_000_000 : 6_000_000,
      });
      exportRef.current.recorder = recorder;
      const chunks: BlobPart[] = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });

      recordingResult = new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener("error", () => reject(new Error("The browser stopped the video recording.")), { once: true });
        recorder.addEventListener("stop", () => {
          if (exportRef.current.cancelled) {
            reject(new Error("Video export cancelled."));
            return;
          }
          resolve(new Blob(chunks, { type: recorder.mimeType || "video/mp4" }));
        }, { once: true });
      });

      const paint = () => {
        renderComposite(canvas, video, analysis, settings);
        setExportProgress(video.duration ? Math.min(1, video.currentTime / video.duration) : 0);
        if (!video.ended && !exportRef.current.cancelled) requestAnimationFrame(paint);
      };

      video.muted = true;
      recorder.start(1_000);
      video.addEventListener("ended", () => {
        if (recorder.state === "recording") recorder.stop();
      }, { once: true });
      await video.play();
      paint();
      const blob = await recordingResult;
      downloadBlob(blob, `${safeName(settings.title || media.file.name)}-overlay.mp4`);
      setMessage(
        includeAudio && activeOutputStream.getAudioTracks().length === 0
          ? "Video downloaded without audio because the browser did not expose its audio track."
          : "Video overlay downloaded as MP4.",
      );
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "The video could not be exported.";
      if (text !== "Video export cancelled.") setError(text);
      else setMessage(text);
    } finally {
      if (exportRef.current.recorder?.state === "recording") {
        exportRef.current.cancelled = true;
        exportRef.current.recorder.stop();
      }
      if (recordingResult) await recordingResult.catch(() => undefined);
      outputStream?.getTracks().forEach((track) => track.stop());
      exportRef.current.recorder = null;
      setExporting(false);
      setExportProgress(0);
      video.muted = previousMuted;
      if (Number.isFinite(previousTime)) {
        try {
          await waitForSeek(video, previousTime);
        } catch {
          // The export is already complete; failure to restore the preview position is non-fatal.
        }
      }
      if (!wasPaused && !exportRef.current.cancelled) void video.play();
      else video.pause();
      drawPreviewRef.current();
    }
  };

  const resetLayout = () => {
    const defaults = createDefaultSettings();
    setSettings((current) => ({ ...defaults, units: current.units, fit: current.fit }));
    setSelectedElement("track");
    setElementsOpen(false);
  };

  const reset = () => {
    if (exporting) cancelVideoExport();
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    mediaUrlRef.current = null;
    imageRef.current = null;
    videoRef.current = null;
    setAnalysis(null);
    setIgcName(null);
    setMedia(null);
    setMediaReady(false);
    setSettings(createDefaultSettings());
    setSelectedElement("track");
    setElementsOpen(false);
    setError(null);
    setMessage(null);
    setVideoProgress(0);
    setVideoPlaying(false);
  };

  const selectedFrame = selectedElement ? settings.elementFrames[selectedElement] : null;
  const selectedStat = statKeyFromElement(selectedElement);
  const readyToExport = Boolean(analysis && mediaReady && media);
  const panelLeft = (1 - settings.panelWidth) / 2;
  const panelTop = (1 - settings.panelHeight) / 2;

  return (
    <main className="studio-app">
      {media?.kind === "video" && (
        <video
          ref={videoRef}
          src={media.url}
          preload="auto"
          playsInline
          className="source-video"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setMedia((current) => current?.url === media.url
              ? {
                  ...current,
                  width: video.videoWidth,
                  height: video.videoHeight,
                  duration: video.duration,
                }
              : current);
            setMediaReady(true);
            setMessage(`Loaded ${video.videoWidth} × ${video.videoHeight} video · ${formatDuration(video.duration)}.`);
            drawPreviewRef.current();
          }}
          onError={() => {
            setMediaReady(false);
            setError("That video codec could not be decoded by this browser.");
          }}
          onPlay={startPreviewAnimation}
          onPause={stopPreviewAnimation}
          onEnded={stopPreviewAnimation}
        />
      )}

      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true"><Mountain /></span>
            <div>
              <p className="brand-name">Flight Overlay</p>
              <p className="brand-subtitle">Drag-to-edit studio</p>
            </div>
          </div>
          <div className="header-actions">
            <span className="privacy-pill"><ShieldCheck aria-hidden="true" /> Local processing</span>
            {(analysis || media) && (
              <Button variant="ghost" size="sm" onClick={reset}><RotateCcw aria-hidden="true" /> Start over</Button>
            )}
          </div>
        </div>
      </header>

      <div className="studio-main">
        <div className="action-toolbar" aria-label="Files and export controls">
          <div className="action-toolbar__files">
            <ToolbarUpload
              id="igc-upload"
              label="IGC track"
              accept=".igc,text/plain,application/octet-stream"
              loadedLabel={igcName}
              icon={parsing ? <LoaderCircle className="animate-spin" /> : <FileText />}
              onFile={handleIgc}
            />
            <ToolbarUpload
              id="media-upload"
              label="Photo or video"
              accept="image/*,video/*"
              loadedLabel={media?.file.name ?? null}
              icon={media?.kind === "video" ? <Video /> : <ImageIcon />}
              onFile={handleMedia}
            />
          </div>

          <div className="action-toolbar__editing">
            <Button
              variant={elementsOpen ? "secondary" : "outline"}
              size="sm"
              onClick={() => setElementsOpen((open) => !open)}
              aria-expanded={elementsOpen}
            >
              <Layers3 aria-hidden="true" /> Elements
            </Button>
            <Button variant="outline" size="sm" onClick={resetLayout}>
              <RotateCcw aria-hidden="true" /> Reset layout
            </Button>
          </div>

          <div className="action-toolbar__export">
            {exporting ? (
              <Button variant="outline" size="sm" onClick={cancelVideoExport}><X aria-hidden="true" /> Cancel</Button>
            ) : (
              <>
                <Button variant="outline" size="sm" disabled={!readyToExport} onClick={exportSticker}>
                  <Sticker aria-hidden="true" /> <span>Sticker PNG</span>
                </Button>
                <Button
                  size="sm"
                  disabled={!readyToExport}
                  onClick={media?.kind === "video" ? exportVideo : exportImage}
                >
                  <Download aria-hidden="true" /> <span>{media?.kind === "video" ? "MP4" : "JPG"}</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {exporting && (
          <div className="export-progress" aria-label={`Video export ${Math.round(exportProgress * 100)} percent complete`}>
            <span style={{ width: `${Math.max(2, exportProgress * 100)}%` }} />
          </div>
        )}

        <section className="stage-viewport" ref={stageViewportRef} aria-label="Overlay editor canvas">
          {(error || message) && (
            <div className={`floating-status ${error ? "floating-status--error" : ""}`} role={error ? "alert" : "status"}>
              {error ? <X aria-hidden="true" /> : <Check aria-hidden="true" />}
              <span>{error ?? message}</span>
            </div>
          )}

          {elementsOpen && (
            <div className="elements-tray" aria-label="Visible overlay elements">
              <div className="elements-tray__heading">
                <div>
                  <strong>Overlay elements</strong>
                  <span>Tap an item on the image to edit it.</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setElementsOpen(false)} aria-label="Close elements"><X /></Button>
              </div>
              <div className="elements-tray__grid">
                {[
                  ["track", "Track outline", settings.showTrack],
                  ["elevation", "Altitude graph", settings.showElevation],
                  ["sportIcon", "Flight-sport mark", settings.sportIcon !== "none"],
                  ["title", "Flight title", Boolean(settings.title.trim())],
                ].map(([id, label, checked]) => (
                  <label className="element-toggle" key={id as string}>
                    <Checkbox
                      checked={checked as boolean}
                      onCheckedChange={(value) => restoreElement(id as "track" | "elevation" | "sportIcon" | "title", value === true)}
                    />
                    <span>{label as string}</span>
                  </label>
                ))}
                {STAT_OPTIONS.map((option) => (
                  <label className="element-toggle" key={option.key}>
                    <Checkbox
                      checked={settings.enabledStats.includes(option.key)}
                      onCheckedChange={(value) => toggleStat(option.key, value === true)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div
            className="canvas-stage"
            style={{
              width: stageDisplay.width ? `${stageDisplay.width}px` : undefined,
              height: stageDisplay.height ? `${stageDisplay.height}px` : undefined,
              aspectRatio: `${previewSize.width} / ${previewSize.height}`,
            }}
          >
            <canvas
              ref={previewCanvasRef}
              width={previewSize.width}
              height={previewSize.height}
              aria-label="Preview of the flight data overlay"
            />

            {analysis && (
              <div className="canvas-interaction-layer" aria-label="Move and resize overlay elements">
                <div
                  ref={panelOverlayRef}
                  className={`canvas-panel-boundary ${selectedElement ? "canvas-panel-boundary--editing" : ""}`}
                  style={{
                    left: `${panelLeft * 100}%`,
                    top: `${panelTop * 100}%`,
                    width: `${settings.panelWidth * 100}%`,
                    height: `${settings.panelHeight * 100}%`,
                  }}
                  onPointerDown={(event) => {
                    if (event.currentTarget === event.target) setSelectedElement(null);
                  }}
                >
                  {visibleElements.map((id) => {
                    const frame = settings.elementFrames[id];
                    const selected = selectedElement === id;
                    return (
                      <div
                        key={id}
                        data-element-id={id}
                        className={`canvas-element ${selected ? "canvas-element--selected" : ""}`}
                        style={{
                          left: `${frame.x * 100}%`,
                          top: `${frame.y * 100}%`,
                          width: `${frame.width * 100}%`,
                          height: `${frame.height * 100}%`,
                        }}
                        role="group"
                        tabIndex={0}
                        aria-label={`${elementLabel(id)}. Drag to move.`}
                        onPointerDown={(event) => beginInteraction(event, id, "move")}
                        onKeyDown={(event) => {
                          const step = event.shiftKey ? 0.02 : 0.005;
                          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                            event.preventDefault();
                            updateElementFrame(id, {
                              x: frame.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                              y: frame.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
                            });
                          } else if (event.key === "Delete" || event.key === "Backspace") {
                            event.preventDefault();
                            removeElement(id);
                          }
                        }}
                      >
                        {selected && (
                          <>
                            <span className="canvas-element__name"><Move aria-hidden="true" /> {elementLabel(id)}</span>
                            <button
                              type="button"
                              className="element-handle element-handle--remove"
                              aria-label={`Remove ${elementLabel(id)}`}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeElement(id);
                              }}
                            >
                              <X />
                            </button>
                            {id === "track" && (
                              <button
                                type="button"
                                className="element-handle element-handle--rotate"
                                aria-label="Rotate track"
                                onPointerDown={(event) => beginInteraction(event, id, "rotate")}
                              >
                                <RotateCw />
                              </button>
                            )}
                            <button
                              type="button"
                              className="element-handle element-handle--resize"
                              aria-label={`Resize ${elementLabel(id)}`}
                              onPointerDown={(event) => beginInteraction(event, id, "resize")}
                            >
                              <Maximize2 />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {!analysis && <p className="canvas-tip">Add an IGC track and media above to begin.</p>}
          {analysis && <p className="canvas-tip">Tap an overlay item, then drag, resize, rotate, or remove it.</p>}

          {media?.kind === "video" && mediaReady && (
            <div className="video-controls video-controls--floating">
              <Button variant="outline" size="icon" onClick={toggleVideoPlayback} disabled={exporting} aria-label={videoPlaying ? "Pause video" : "Play video"}>
                {videoPlaying ? <Pause /> : <Play />}
              </Button>
              <input
                type="range"
                min={0}
                max={media.duration || 0}
                step={0.05}
                value={videoProgress}
                disabled={exporting}
                aria-label="Video position"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (videoRef.current) videoRef.current.currentTime = value;
                  setVideoProgress(value);
                  drawPreviewRef.current();
                }}
              />
              <span>{formatDuration(videoProgress)} / {formatDuration(media.duration)}</span>
            </div>
          )}
        </section>

        <section className="inspector-dock" aria-label="Selected element settings">
          <div className="inspector-heading">
            <span className="inspector-heading__icon">{selectedElement ? <Move /> : <Layers3 />}</span>
            <div>
              <strong>{elementLabel(selectedElement)}</strong>
              <span>{selectedElement ? "Drag it directly on the image" : "Centered overlay area"}</span>
            </div>
          </div>

          <div className="inspector-scroll">
            {selectedFrame && (
              <>
                <RangeField
                  id="element-width"
                  label="Width"
                  min={frameMinimum(selectedElement!).width}
                  max={1 - selectedFrame.x}
                  step={0.01}
                  value={selectedFrame.width}
                  display={`${Math.round(selectedFrame.width * 100)}%`}
                  onChange={(value) => updateElementFrame(selectedElement!, { width: value })}
                />
                <RangeField
                  id="element-height"
                  label="Height"
                  min={frameMinimum(selectedElement!).height}
                  max={1 - selectedFrame.y}
                  step={0.01}
                  value={selectedFrame.height}
                  display={`${Math.round(selectedFrame.height * 100)}%`}
                  onChange={(value) => updateElementFrame(selectedElement!, { height: value })}
                />
              </>
            )}

            {selectedElement === "track" && (
              <>
                <ColorField id="track-color" label="Track color" value={settings.trackColor} onChange={(value) => updateSettings("trackColor", value)} />
                <RangeField
                  id="track-line-width"
                  label="Line width"
                  min={1}
                  max={10}
                  step={0.5}
                  value={settings.trackLineWidth}
                  display={`${settings.trackLineWidth.toFixed(1)} px`}
                  onChange={(value) => updateSettings("trackLineWidth", value)}
                />
                <div className="compact-field">
                  <Label htmlFor="track-orientation">Orientation</Label>
                  <Select value={settings.trackOrientation} onValueChange={(value) => updateSettings("trackOrientation", value as TrackOrientation)}>
                    <SelectTrigger id="track-orientation"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="north-up">North up</SelectItem>
                      <SelectItem value="best-fit">Best fit</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <RangeField
                  id="track-rotation"
                  label="Rotation"
                  min={-180}
                  max={180}
                  step={1}
                  value={settings.trackRotation}
                  display={`${Math.round(settings.trackRotation)}°`}
                  disabled={settings.trackOrientation !== "custom"}
                  onChange={(value) => updateSettings("trackRotation", value)}
                />
                <label className="compact-switch">
                  <span>Compass</span>
                  <Switch checked={settings.showCompass} onCheckedChange={(checked) => updateSettings("showCompass", checked)} />
                </label>
              </>
            )}

            {selectedElement === "elevation" && (
              <>
                <ColorField id="elevation-color" label="Graph color" value={settings.elevationColor} onChange={(value) => updateSettings("elevationColor", value)} />
                <RangeField
                  id="elevation-line-width"
                  label="Line width"
                  min={1}
                  max={10}
                  step={0.5}
                  value={settings.elevationLineWidth}
                  display={`${settings.elevationLineWidth.toFixed(1)} px`}
                  onChange={(value) => updateSettings("elevationLineWidth", value)}
                />
                {[
                  ["Start", "showStartAltitude", settings.showStartAltitude],
                  ["Maximum", "showMaxAltitude", settings.showMaxAltitude],
                  ["Landing", "showLandingAltitude", settings.showLandingAltitude],
                ].map(([label, key, checked]) => (
                  <label className="compact-check" key={key as string}>
                    <Checkbox
                      checked={checked as boolean}
                      onCheckedChange={(value) => updateSettings(
                        key as "showStartAltitude" | "showMaxAltitude" | "showLandingAltitude",
                        value === true,
                      )}
                    />
                    <span>{label as string}</span>
                  </label>
                ))}
              </>
            )}

            {selectedElement === "sportIcon" && (
              <>
                <div className="compact-field">
                  <Label htmlFor="sport-icon">Mark</Label>
                  <Select value={settings.sportIcon} onValueChange={(value) => updateSettings("sportIcon", value as SportIcon)}>
                    <SelectTrigger id="sport-icon"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paraglider">Paraglider</SelectItem>
                      <SelectItem value="hang-glider">Hang glider</SelectItem>
                      <SelectItem value="sailplane">Sailplane</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ColorField id="accent-color-icon" label="Mark color" value={settings.accentColor} onChange={(value) => updateSettings("accentColor", value)} />
              </>
            )}

            {selectedElement === "title" && (
              <>
                <div className="compact-field compact-field--wide">
                  <Label htmlFor="flight-title">Title</Label>
                  <Input id="flight-title" value={settings.title} maxLength={54} onChange={(event) => updateSettings("title", event.target.value)} />
                </div>
                <ColorField id="title-color" label="Text color" value={settings.textColor} onChange={(value) => updateSettings("textColor", value)} />
              </>
            )}

            {selectedStat && (
              <>
                <div className="compact-field">
                  <Label htmlFor="stat-units">Units</Label>
                  <Select value={settings.units} onValueChange={(value) => updateSettings("units", value as UnitSystem)}>
                    <SelectTrigger id="stat-units"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metric">Metric</SelectItem>
                      <SelectItem value="imperial">Imperial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ColorField id="stat-color" label="Text color" value={settings.textColor} onChange={(value) => updateSettings("textColor", value)} />
              </>
            )}

            {!selectedElement && (
              <>
                <div className="compact-field">
                  <Label htmlFor="global-units">Units</Label>
                  <Select value={settings.units} onValueChange={(value) => updateSettings("units", value as UnitSystem)}>
                    <SelectTrigger id="global-units"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metric">Metric</SelectItem>
                      <SelectItem value="imperial">Imperial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="compact-field">
                  <Label htmlFor="panel-style">Panel</Label>
                  <Select value={settings.style} onValueChange={(value) => updateSettings("style", value as OverlayStyle)}>
                    <SelectTrigger id="panel-style"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">No panel</SelectItem>
                      <SelectItem value="glass">Dark glass</SelectItem>
                      <SelectItem value="light">Light glass</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="compact-field">
                  <Label htmlFor="media-fit">Media fit</Label>
                  <Select value={settings.fit} onValueChange={(value) => updateSettings("fit", value as MediaFit)}>
                    <SelectTrigger id="media-fit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cover">Fill frame</SelectItem>
                      <SelectItem value="contain">Show all</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <RangeField
                  id="panel-width"
                  label="Panel width"
                  min={0.4}
                  max={0.98}
                  step={0.01}
                  value={settings.panelWidth}
                  display={`${Math.round(settings.panelWidth * 100)}%`}
                  onChange={(value) => updateSettings("panelWidth", value)}
                />
                <RangeField
                  id="panel-height"
                  label="Panel height"
                  min={0.4}
                  max={0.98}
                  step={0.01}
                  value={settings.panelHeight}
                  display={`${Math.round(settings.panelHeight * 100)}%`}
                  onChange={(value) => updateSettings("panelHeight", value)}
                />
                <RangeField
                  id="panel-opacity"
                  label="Opacity"
                  min={0.2}
                  max={0.95}
                  step={0.05}
                  value={settings.panelOpacity}
                  display={`${Math.round(settings.panelOpacity * 100)}%`}
                  disabled={settings.style === "minimal"}
                  onChange={(value) => updateSettings("panelOpacity", value)}
                />
                <ColorField id="global-text-color" label="Text color" value={settings.textColor} onChange={(value) => updateSettings("textColor", value)} />
                {media?.kind === "video" && (
                  <label className="compact-switch">
                    <span>Include audio</span>
                    <Switch checked={includeAudio} onCheckedChange={setIncludeAudio} />
                  </label>
                )}
              </>
            )}
          </div>

          {selectedElement && (
            <Button className="inspector-remove" variant="ghost" size="sm" onClick={() => removeElement(selectedElement)}>
              <X aria-hidden="true" /> Remove
            </Button>
          )}
        </section>
      </div>
    </main>
  );
}
