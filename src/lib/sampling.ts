/**
 * Sample an N×N block centred on (x, y), average the pixels, return a hex.
 * Boundary clipping: if the kernel runs past the canvas edge, the truncated
 * area is averaged (rather than padded), so corner samples are still useful.
 */
export function sampleAverageColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kernel: number,
): string {
  const half = Math.floor(kernel / 2);
  const left = Math.max(0, Math.floor(x) - half);
  const top = Math.max(0, Math.floor(y) - half);
  const data = ctx.getImageData(left, top, kernel, kernel).data;

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }

  if (count === 0) return "#000000";

  return `#${[Math.round(r / count), Math.round(g / count), Math.round(b / count)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}
