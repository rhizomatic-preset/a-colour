import { useEffect, useRef, useState } from "react";

interface CameraPickerProps {
  onColorSelect: (hex: string) => void;
}

export function CameraPicker({ onColorSelect }: CameraPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [tapPoint, setTapPoint] = useState<{ x: number; y: number } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Video play failed:", e));
          };
        }
      } catch (err) {
        console.error("Camera access failed:", err);
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
          });
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(e => console.error("Video play failed:", e));
            };
          }
        } catch (fallbackErr) {
          setError("Could not access camera. Please ensure you have granted permission.");
        }
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const renderFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas) {
        const ctx = canvas.getContext("2d", { alpha: false });

        // Using HAVE_CURRENT_DATA (2) as a minimum requirement
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
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
        }
      }
      requestRef.current = requestAnimationFrame(renderFrame);
    };

    requestRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

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

    const size = 5;
    const half = Math.floor(size / 2);

    try {
      const imageData = ctx.getImageData(
        Math.max(0, sourceX - half),
        Math.max(0, sourceY - half),
        size,
        size
      ).data;

      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
      }

      if (count > 0) {
        const hex = `#${[Math.round(r / count), Math.round(g / count), Math.round(b / count)]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")}`;
        onColorSelect(hex);
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

  return (
    <div className="camera-picker">
      {error ? (
        <div className="camera-error">
          <p>{error}</p>
        </div>
      ) : (
        <div className="camera-stage">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="hidden-video"
          />
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => setTapPoint(null)}
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
      )}
      <p className="hex-description">
        Tap and hold to sample color from live feed.
      </p>
    </div>
  );
}
