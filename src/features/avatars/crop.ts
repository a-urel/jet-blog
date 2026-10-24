// Pure math for the client-side avatar crop dialog. The crop is a square in
// source-image pixels, described by its center and a zoom factor: at zoom 1 the
// square's edge equals the image's shorter edge (the largest square that fits),
// and zoom z shrinks it to shorterEdge / z. Keeping the state in source pixels
// makes it independent of how large the crop area is drawn on screen.

// Longest edge of the decoded working copy; larger images are downscaled once
// before cropping so panning and the final draw stay fast.
export const maxWorkingEdge = 2048;
// Edge of the exported square. Smaller crops are exported at their own size
// instead of being upscaled.
export const avatarOutputSize = 512;
// Source files above this size are not decoded in the browser.
export const maxCropSourceBytes = 25 * 1024 * 1024;

export const minCropZoom = 1;
export const maxCropZoom = 4;

export type CropState = { centerX: number; centerY: number; zoom: number };

export type CropRect = { x: number; y: number; size: number };

export type Size = { width: number; height: number };

// Rounded to hundredths so repeated keyboard steps do not accumulate floating
// point noise (1.6000000000000005) in the slider value.
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return minCropZoom;
  return Math.min(maxCropZoom, Math.max(minCropZoom, Math.round(zoom * 100) / 100));
}

// Edge of the crop square in source pixels.
export function cropEdge(image: Size, zoom: number): number {
  return Math.min(image.width, image.height) / clampZoom(zoom);
}

// Keeps the zoom in range and the square fully inside the image.
export function clampCrop(image: Size, state: CropState): CropState {
  const zoom = clampZoom(state.zoom);
  const half = cropEdge(image, zoom) / 2;
  const clamp = (value: number, max: number) =>
    Math.min(max - half, Math.max(half, Number.isFinite(value) ? value : max / 2));

  return {
    centerX: clamp(state.centerX, image.width),
    centerY: clamp(state.centerY, image.height),
    zoom,
  };
}

// The largest centered square, matching the previous center-crop behavior.
export function initialCrop(image: Size): CropState {
  return { centerX: image.width / 2, centerY: image.height / 2, zoom: minCropZoom };
}

// Moves the square by a distance in source pixels.
export function panCrop(image: Size, state: CropState, dx: number, dy: number): CropState {
  return clampCrop(image, { ...state, centerX: state.centerX + dx, centerY: state.centerY + dy });
}

// Changes the zoom around the current center.
export function zoomCrop(image: Size, state: CropState, zoom: number): CropState {
  return clampCrop(image, { ...state, zoom });
}

export function cropRect(image: Size, state: CropState): CropRect {
  const clamped = clampCrop(image, state);
  const size = cropEdge(image, clamped.zoom);
  return { x: clamped.centerX - size / 2, y: clamped.centerY - size / 2, size };
}

// Source pixels per screen pixel when the crop square is drawn `viewport`
// pixels wide; a pointer drag of d screen pixels pans by d * this value.
export function sourcePixelsPerViewportPixel(image: Size, zoom: number, viewport: number): number {
  return viewport > 0 ? cropEdge(image, zoom) / viewport : 0;
}

// Size of the working copy: the same aspect ratio with the longest edge at
// most `maxEdge`, never upscaled, and at least 1 pixel per edge.
export function downscaledSize(image: Size, maxEdge = maxWorkingEdge): Size {
  const longest = Math.max(image.width, image.height);
  if (longest <= maxEdge) return { width: image.width, height: image.height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}

// Edge of the exported image for a crop square of `edge` source pixels.
export function outputEdge(edge: number, max = avatarOutputSize): number {
  return Math.max(1, Math.min(max, Math.floor(edge)));
}
