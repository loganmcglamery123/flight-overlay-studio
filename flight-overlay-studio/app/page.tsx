"use client";

import {
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
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
  DEFAULT_SETTINGS,
  renderComposite,
  STAT_OPTIONS,
  type MediaFit,
  type OverlayPosition,
  type OverlaySettings,
  type OverlayStyle,
  type StatKey,
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

type UploadCardProps = {
  id: string;
  title: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  loadedLabel: string | null;
  onFile: (file: File) => void;
};

function UploadCard({ id, title, hint, accept, icon, loadedLabel, onFile }: UploadCardProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      htmlFor={id}
      className={`upload-card ${dragging ? "upload-card--dragging" : ""} ${loadedLabel ? "upload-card--loaded" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
      <span className="upload-card__icon">{loadedLabel ? <Check aria-hidden="true" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.95rem] font-semibold text-foreground">{title}</span>
        <span className="mt-1 block truncate text-sm text-muted-foreground">
          {loadedLabel ?? hint}
        </span>
      </span>
      <Upload className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </label>
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

function bestRecorderType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export default function Home() {
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(null);
  const [igcName, setIgcName] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [settings, setSettings] = useState<OverlaySettings>(DEFAULT_SETTINGS);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [includeAudio, setIncludeAudio] = useState(true);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
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
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    };
  }, []);

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
      setSettings((current) => ({
        ...current,
        title: current.title || file.name.replace(/\.igc$/i, "").replace(/[_-]+/g, " "),
      }));
      setMessage(
        `Loaded ${parsed.points.length.toLocaleString("en-US")} fixes${parsed.ignoredFixes ? `; ignored ${parsed.ignoredFixes} invalid or implausible fixes` : ""}.`,
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
      setError("Choose an image or video file supported by your browser.");
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
    setSettings((current) => ({
      ...current,
      enabledStats: checked
        ? [...current.enabledStats, key]
        : current.enabledStats.filter((item) => item !== key),
    }));
  };

  const toggleVideoPlayback = async () => {
    const video = videoRef.current;
    if (!video || !mediaReady) return;
    setError(null);
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setError("This browser blocked video playback. Click the preview and try again.");
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
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, `${safeName(settings.title || media.file.name)}-overlay.png`);
      setMessage("Photo overlay downloaded at the original image resolution.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The photo could not be exported.");
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
        mimeType: bestRecorderType(),
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
          resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
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
      downloadBlob(blob, `${safeName(settings.title || media.file.name)}-overlay.webm`);
      setMessage(
        includeAudio && activeOutputStream.getAudioTracks().length === 0
          ? "Video downloaded without audio because this browser did not expose the source audio track."
          : "Video overlay downloaded as WebM.",
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
    setSettings(DEFAULT_SETTINGS);
    setError(null);
    setMessage(null);
    setVideoProgress(0);
    setVideoPlaying(false);
  };

  const readyToExport = Boolean(analysis && mediaReady && media);
  return (
    <main className="min-h-screen bg-background text-foreground">
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
            setMessage(
              `Loaded ${video.videoWidth} × ${video.videoHeight} video · ${formatDuration(video.duration)}.`,
            );
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
        <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true">
              <Mountain />
            </span>
            <div>
              <p className="brand-name">Flight Overlay</p>
              <p className="hidden text-xs text-muted-foreground sm:block">IGC studio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="privacy-pill">
              <ShieldCheck aria-hidden="true" /> Local processing
            </span>
            {(analysis || media) && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw aria-hidden="true" /> Reset
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[410px_minmax(0,1fr)] lg:px-8">
        <aside className="editor-panel" aria-label="Overlay editor">
          <section className="editor-section">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h1>Add your flight</h1>
                <p>Choose an IGC track and the media it should sit on.</p>
              </div>
            </div>

            <div className="space-y-3">
              <UploadCard
                id="igc-upload"
                title="IGC flight log"
                hint={parsing ? "Calculating flight statistics…" : "Drop .igc here or browse"}
                accept=".igc,text/plain,application/octet-stream"
                icon={parsing ? <LoaderCircle className="animate-spin" /> : <FileText />}
                loadedLabel={igcName}
                onFile={handleIgc}
              />
              <UploadCard
                id="media-upload"
                title="Photo or video"
                hint="JPG, PNG, WebP, MP4 or WebM"
                accept="image/*,video/*"
                icon={media?.kind === "video" ? <Video /> : <ImageIcon />}
                loadedLabel={media?.file.name ?? null}
                onFile={handleMedia}
              />
            </div>

            {(error || message) && (
              <div className={`status-message ${error ? "status-message--error" : ""}`} role={error ? "alert" : "status"}>
                {error ? <X aria-hidden="true" /> : <Check aria-hidden="true" />}
                <span>{error ?? message}</span>
              </div>
            )}
          </section>

          <section className="editor-section">
            <div className="section-heading">
              <span>02</span>
              <div>
                <h2>Choose the data</h2>
                <p>Turn individual overlay elements on or off.</p>
              </div>
            </div>

            <div className="switch-row">
              <Label htmlFor="track-switch">Track outline</Label>
              <Switch
                id="track-switch"
                checked={settings.showTrack}
                onCheckedChange={(checked) => updateSettings("showTrack", checked)}
              />
            </div>
            <div className="switch-row">
              <Label htmlFor="elevation-switch">Elevation graph</Label>
              <Switch
                id="elevation-switch"
                checked={settings.showElevation}
                onCheckedChange={(checked) => updateSettings("showElevation", checked)}
              />
            </div>

            <div className="stats-grid" role="group" aria-label="Statistics shown">
              {STAT_OPTIONS.map((option) => {
                const id = `stat-${option.key}`;
                const checked = settings.enabledStats.includes(option.key);
                return (
                  <div className="stat-choice" key={option.key}>
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) => toggleStat(option.key, value === true)}
                    />
                    <Label htmlFor={id}>{option.label}</Label>
                  </div>
                );
              })}
            </div>
            <p className="fine-print">
              The optimized distances are useful estimates. They are not official competition or record scoring.
            </p>
          </section>

          <section className="editor-section">
            <div className="section-heading">
              <span>03</span>
              <div>
                <h2>Style the overlay</h2>
                <p>Adjust the layout, units, color and size.</p>
              </div>
            </div>

            <div className="field-stack">
              <Label htmlFor="flight-title">Flight title</Label>
              <Input
                id="flight-title"
                value={settings.title}
                maxLength={54}
                placeholder="Evening ridge flight"
                onChange={(event) => updateSettings("title", event.target.value)}
              />
            </div>

            <div className="two-column-fields">
              <div className="field-stack">
                <Label htmlFor="units-select">Units</Label>
                <Select value={settings.units} onValueChange={(value) => updateSettings("units", value as UnitSystem)}>
                  <SelectTrigger id="units-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Metric</SelectItem>
                    <SelectItem value="imperial">Imperial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="field-stack">
                <Label htmlFor="position-select">Position</Label>
                <Select value={settings.position} onValueChange={(value) => updateSettings("position", value as OverlayPosition)}>
                  <SelectTrigger id="position-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top-left">Top left</SelectItem>
                    <SelectItem value="top-right">Top right</SelectItem>
                    <SelectItem value="bottom-left">Bottom left</SelectItem>
                    <SelectItem value="bottom-right">Bottom right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="field-stack">
                <Label htmlFor="style-select">Panel</Label>
                <Select value={settings.style} onValueChange={(value) => updateSettings("style", value as OverlayStyle)}>
                  <SelectTrigger id="style-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="glass">Dark glass</SelectItem>
                    <SelectItem value="light">Light glass</SelectItem>
                    <SelectItem value="minimal">No panel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="field-stack">
                <Label htmlFor="fit-select">Media fit</Label>
                <Select value={settings.fit} onValueChange={(value) => updateSettings("fit", value as MediaFit)}>
                  <SelectTrigger id="fit-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Fill frame</SelectItem>
                    <SelectItem value="contain">Show all</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="two-column-fields">
              <div className="color-field">
                <Label htmlFor="accent-color">Accent</Label>
                <div>
                  <input
                    id="accent-color"
                    type="color"
                    value={settings.accentColor}
                    onChange={(event) => updateSettings("accentColor", event.target.value)}
                  />
                  <span>{settings.accentColor.toUpperCase()}</span>
                </div>
              </div>
              <div className="color-field">
                <Label htmlFor="text-color">Text</Label>
                <div>
                  <input
                    id="text-color"
                    type="color"
                    value={settings.textColor}
                    onChange={(event) => updateSettings("textColor", event.target.value)}
                  />
                  <span>{settings.textColor.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <div className="slider-field">
              <div>
                <Label htmlFor="overlay-scale">Overlay size</Label>
                <span>{Math.round(settings.scale * 100)}%</span>
              </div>
              <Slider
                id="overlay-scale"
                min={0.7}
                max={1.35}
                step={0.05}
                value={[settings.scale]}
                onValueChange={(value) => updateSettings("scale", value[0])}
              />
            </div>
            <div className="slider-field">
              <div>
                <Label htmlFor="panel-opacity">Panel opacity</Label>
                <span>{Math.round(settings.panelOpacity * 100)}%</span>
              </div>
              <Slider
                id="panel-opacity"
                min={0.2}
                max={0.95}
                step={0.05}
                value={[settings.panelOpacity]}
                disabled={settings.style === "minimal"}
                onValueChange={(value) => updateSettings("panelOpacity", value[0])}
              />
            </div>

            {media?.kind === "video" && (
              <div className="switch-row switch-row--inset">
                <div>
                  <Label htmlFor="audio-switch">Include original audio</Label>
                  <p>When the browser exposes an audio track.</p>
                </div>
                <Switch id="audio-switch" checked={includeAudio} onCheckedChange={setIncludeAudio} />
              </div>
            )}
          </section>
        </aside>

        <section className="preview-column" aria-label="Overlay preview">
          <div className="preview-toolbar">
            <div>
              <p className="preview-kicker"><SlidersHorizontal aria-hidden="true" /> Live preview</p>
              <p className="preview-meta">
                {analysis
                  ? `${analysis.points.length.toLocaleString("en-US")} fixes · ${formatDuration(analysis.stats.duration)}`
                  : "Add an IGC file to calculate flight data"}
              </p>
            </div>
            <span className={`readiness ${readyToExport ? "readiness--ready" : ""}`}>
              {readyToExport ? "Ready to export" : `${analysis ? 1 : 0}/2 files ready`}
            </span>
          </div>

          <div className="canvas-stage" style={{ aspectRatio: `${previewSize.width} / ${previewSize.height}` }}>
            <canvas
              ref={previewCanvasRef}
              width={previewSize.width}
              height={previewSize.height}
              aria-label="Preview of the flight data overlay"
            />
          </div>

          {media?.kind === "video" && mediaReady && (
            <div className="video-controls">
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

          <div className="export-bar">
            <div>
              <h2>{media?.kind === "video" ? "Export video" : "Export photo"}</h2>
              <p>
                {media?.kind === "video"
                  ? "WebM export runs in real time and stays on this device."
                  : "PNG export uses the original photo resolution."}
              </p>
              {exporting && (
                <div className="export-progress" aria-label={`Video export ${Math.round(exportProgress * 100)} percent complete`}>
                  <span style={{ width: `${Math.max(2, exportProgress * 100)}%` }} />
                </div>
              )}
            </div>
            {exporting ? (
              <Button variant="outline" onClick={cancelVideoExport}>
                <X /> Cancel export
              </Button>
            ) : (
              <Button
                className="export-button"
                disabled={!readyToExport}
                onClick={media?.kind === "video" ? exportVideo : exportImage}
              >
                <Download aria-hidden="true" />
                {media?.kind === "video" ? "Download WebM" : "Download PNG"}
              </Button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
