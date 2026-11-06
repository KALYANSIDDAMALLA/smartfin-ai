/** Pure crop geometry for the avatar cropper. V = side of the square crop viewport in CSS px. */
export const OUTPUT_SIZE = 256;
export const MAX_ZOOM = 4;

/** Scale at which the image just covers the viewport (zoom = 1). */
export const baseScale = (w: number, h: number, V: number) => Math.max(V / w, V / h);

/** Keeps the image covering the viewport: top-left offset must satisfy V - displayed <= offset <= 0. */
export function clampOffset(x: number, y: number, dw: number, dh: number, V: number) {
  return { x: Math.min(0, Math.max(V - dw, x)), y: Math.min(0, Math.max(V - dh, y)) };
}

/** Offset after changing scale so the point at the viewport centre stays at the centre. */
export function rezoomOffset(x: number, y: number, oldScale: number, newScale: number, w: number, h: number, V: number) {
  const cx = (V / 2 - x) / oldScale, cy = (V / 2 - y) / oldScale;
  return clampOffset(V / 2 - cx * newScale, V / 2 - cy * newScale, w * newScale, h * newScale, V);
}

/** Source rectangle (in natural image pixels) that the viewport currently shows. */
export function sourceRect(x: number, y: number, scale: number, V: number) {
  return { sx: -x / scale, sy: -y / scale, size: V / scale };
}
