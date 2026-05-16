import { useEffect, useRef, useState } from "react";
import type { SampleSource } from "@/components/kernel-preview";
import { sampleAverageColor } from "@/lib/sampling";
import type { SampleKernel } from "@/lib/settings";

interface CameraPickerProps {
  onColorSelect: (hex: string) => void;
  onSampleSource?: (source: SampleSource) => void;
  sampleKernel: SampleKernel;
}

interface CameraError {
  title: string;
  hint: string;
}

function describeCameraError(err: unknown): CameraError {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return {
        title: "Camera blocked",
        hint: "Allow camera access in your browser's settings, then try again.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        title: "No camera found",
        hint: "This device doesn't seem to have a camera available.",
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        title: "Camera in use",
        hint: "Another app is using the camera. Close it and try again.",
      };
    case "SecurityError":
      return {
        title: "Camera needs HTTPS",
        hint: "Open this page over a secure connection.",
      };
    default:
      return {
        title: "Camera failed",
        hint: "Something went wrong starting the camera. Try again, or pick a colour using a different mode.",
      };
  }
}

export function CameraPicker({ onColorSelect, onSampleSource, sampleKernel }: CameraPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [tapPoint, setTapPoint] = useState<{ x: number; y: number } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Surgical pinch-zoom guard: native non-passive touch listeners on the canvas
  // preventDefault on 2+ finger gestures so iOS Safari can't grab a pinch and
  // zoom the whole page. The rest of the page stays zoomable.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function blockMultiTouch(event: TouchEvent) {
      if (event.touches.length > 1) event.preventDefault();
    }
    canvas.addEventListener("touchstart", blockMultiTouch, { passive: false });
    canvas.addEventListener("touchmove", blockMultiTouch, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", blockMultiTouch);
      canvas.removeEventListener("touchmove", blockMultiTouch);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryKey is intentionally a trigger-only dep to re-run on retry; reading it inside isn't meaningful.
  useEffect(() => {
    async function startCamera() {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch((e) => console.error("Video play failed:", e));
          };
        }
      } catch (err) {
        console.error("Camera access failed:", err);
        setCameraError(describeCameraError(err));
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [retryKey]);

  // Apply hardware zoom if supported
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      const capabilities = track.getCapabilities ? track.getCapabilities() : null;
      if (capabilities && "zoom" in capabilities) {
        track
          .applyConstraints({ advanced: [{ zoom: zoom } as unknown as MediaTrackConstraintSet] })
          .catch((e) => console.error("Hardware zoom failed:", e));
      }
    }
  }, [zoom]);

  // Handle desktop zoom
  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.min(Math.max(1, prev + delta), 3));
  };

  // Handle pinch zoom
  const handleTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      event.preventDefault(); // Stop page zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);

      if (lastTouchDistance > 0) {
        const delta = (distance - lastTouchDistance) * 0.01;
        setZoom((prev) => Math.min(Math.max(1, prev + delta), 3));
      }
      setLastTouchDistance(distance);
    }
  };

  useEffect(() => {
    const renderFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas) {
        const ctx = canvas.getContext("2d", { alpha: false });

        if (ctx && video.readyState >= 2) {
          const { videoWidth, videoHeight } = video;

          if (videoWidth > 0 && videoHeight > 0) {
            if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
              canvas.width = videoWidth;
              canvas.height = videoHeight;
            }

            const track = streamRef.current?.getVideoTracks()[0];
            const settings = track?.getSettings();
            const isUser = settings?.facingMode === "user";

            ctx.save();
            if (isUser) {
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
            }

            // Digital zoom
            const sWidth = canvas.width / zoom;
            const sHeight = canvas.height / zoom;
            const sx = (canvas.width - sWidth) / 2;
            const sy = (canvas.height - sHeight) / 2;

            ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
        }
      }
      requestRef.current = requestAnimationFrame(renderFrame);
    };

    requestRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(requestRef.current);
  }, [zoom]);

  const sampleColor = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const sourceX = x * scaleX;
    const sourceY = y * scaleY;

    try {
      const hex = sampleAverageColor(ctx, sourceX, sourceY, sampleKernel);
      onColorSelect(hex);

      if (onSampleSource) {
        const half = 7; // 15×15 sample window around the pixel
        const left = Math.max(0, Math.min(canvas.width - half * 2 - 1, Math.floor(sourceX) - half));
        const top = Math.max(0, Math.min(canvas.height - half * 2 - 1, Math.floor(sourceY) - half));
        const region = ctx.getImageData(left, top, half * 2 + 1, half * 2 + 1);
        onSampleSource({
          imageData: region,
          centerX: Math.floor(sourceX) - left,
          centerY: Math.floor(sourceY) - top,
        });
      }
    } catch (e) {
      console.error("Sampling error:", e);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setTapPoint({ x, y });
    sampleColor(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tapPoint) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setTapPoint({ x, y });
      sampleColor(x, y);
    }
  };

  const handlePointerUp = () => {
    setTapPoint(null);
  };

  if (cameraError) {
    return (
      <div className="camera-picker">
        <div className="camera-fallback" role="alert">
          <p className="camera-fallback-title">{cameraError.title}</p>
          <p className="camera-fallback-hint">{cameraError.hint}</p>
          <button
            type="button"
            className="camera-retry-btn"
            onClick={() => setRetryKey((key) => key + 1)}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-picker">
      <div className="camera-stage">
        <video ref={videoRef} autoPlay playsInline muted className="hidden-video" />
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setTapPoint(null)}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => setLastTouchDistance(0)}
          className="camera-canvas"
        />
        {tapPoint && (
          <span
            className="sample-dot"
            style={{ left: tapPoint.x, top: tapPoint.y }}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="hex-description">Tap and hold to sample colour from live feed.</p>
    </div>
  );
}
