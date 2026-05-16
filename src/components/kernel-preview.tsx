import { useEffect, useMemo, useRef } from "react";
import type { SampleKernel } from "@/lib/settings";

export type SampleSource = {
  imageData: ImageData;
  centerX: number;
  centerY: number;
};

interface KernelPreviewProps {
  source: SampleSource | null;
  kernel: SampleKernel;
}

function averageRegion(
  imageData: ImageData,
  centerX: number,
  centerY: number,
  kernel: number,
): string {
  const half = Math.floor(kernel / 2);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = centerY - half; y <= centerY + half; y += 1) {
    for (let x = centerX - half; x <= centerX + half; x += 1) {
      if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) continue;
      const idx = (y * imageData.width + x) * 4;
      r += imageData.data[idx];
      g += imageData.data[idx + 1];
      b += imageData.data[idx + 2];
      count += 1;
    }
  }
  if (count === 0) return "#000000";
  return `#${[Math.round(r / count), Math.round(g / count), Math.round(b / count)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function KernelPreview({ source, kernel }: KernelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultHex = useMemo(
    () => (source ? averageRegion(source.imageData, source.centerX, source.centerY, kernel) : null),
    [source, kernel],
  );

  useEffect(() => {
    if (!source) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { imageData, centerX, centerY } = source;
    const scale = 14;
    canvas.width = imageData.width * scale;
    canvas.height = imageData.height * scale;

    // putImageData ignores transforms — render via an intermediate canvas, then scale-draw.
    const off = document.createElement("canvas");
    off.width = imageData.width;
    off.height = imageData.height;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

    // Overlay current kernel box (centred on the sampled pixel).
    const half = Math.floor(kernel / 2);
    const boxX = (centerX - half) * scale;
    const boxY = (centerY - half) * scale;
    const boxSize = kernel * scale;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeRect(boxX, boxY, boxSize, boxSize);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeRect(boxX + 1, boxY + 1, boxSize - 2, boxSize - 2);
  }, [source, kernel]);

  if (!source || !resultHex) {
    return (
      <p className="setting-empty">
        No sample yet — tap on an image or the camera feed to capture one. Then come back here to
        see how kernel size changes the result.
      </p>
    );
  }

  return (
    <div className="kernel-preview">
      <canvas
        ref={canvasRef}
        className="kernel-canvas"
        aria-label="Sampled pixel region with current kernel highlighted"
      />
      <span className="kernel-result">
        <span
          className="kernel-result-swatch"
          style={{ backgroundColor: resultHex }}
          aria-hidden="true"
        />
        <span className="kernel-result-hex">{resultHex.toUpperCase()}</span>
      </span>
    </div>
  );
}
