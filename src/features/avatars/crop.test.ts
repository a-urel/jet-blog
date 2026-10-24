import { describe, expect, it } from "vitest";

import {
  avatarOutputSize,
  clampCrop,
  clampZoom,
  cropEdge,
  cropRect,
  downscaledSize,
  initialCrop,
  maxCropZoom,
  maxWorkingEdge,
  minCropZoom,
  outputEdge,
  panCrop,
  sourcePixelsPerViewportPixel,
  zoomCrop,
} from "./crop";

const landscape = { width: 1200, height: 800 };
const portrait = { width: 600, height: 900 };

describe("avatar crop zoom", () => {
  it("keeps the zoom within range", () => {
    expect(clampZoom(0.2)).toBe(minCropZoom);
    expect(clampZoom(99)).toBe(maxCropZoom);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(Number.NaN)).toBe(minCropZoom);
  });

  it("rounds repeated steps to hundredths", () => {
    let zoom = 1;
    for (let step = 0; step < 6; step += 1) zoom = clampZoom(zoom + 0.1);
    expect(clampZoom(zoom - 0.1)).toBe(1.5);
  });

  it("derives the square edge from the shorter image edge", () => {
    expect(cropEdge(landscape, 1)).toBe(800);
    expect(cropEdge(landscape, 2)).toBe(400);
    expect(cropEdge(portrait, 1)).toBe(600);
    expect(cropEdge(portrait, 10)).toBe(600 / maxCropZoom);
  });
});

describe("avatar crop rectangle", () => {
  it("starts with the largest centered square", () => {
    expect(cropRect(landscape, initialCrop(landscape))).toEqual({ x: 200, y: 0, size: 800 });
    expect(cropRect(portrait, initialCrop(portrait))).toEqual({ x: 0, y: 150, size: 600 });
  });

  it("pans within the image and stops at its edges", () => {
    const start = initialCrop(landscape);
    expect(cropRect(landscape, panCrop(landscape, start, 100, 50))).toEqual({
      x: 300,
      y: 0,
      size: 800,
    });
    expect(cropRect(landscape, panCrop(landscape, start, 5000, 0)).x).toBe(400);
    expect(cropRect(landscape, panCrop(landscape, start, -5000, 0)).x).toBe(0);
  });

  it("zooms around the current center and re-clamps when zooming out", () => {
    const zoomed = zoomCrop(landscape, initialCrop(landscape), 2);
    expect(cropRect(landscape, zoomed)).toEqual({ x: 400, y: 200, size: 400 });

    const corner = panCrop(landscape, zoomed, -10_000, -10_000);
    expect(cropRect(landscape, corner)).toEqual({ x: 0, y: 0, size: 400 });

    const zoomedOut = zoomCrop(landscape, corner, 1);
    expect(cropRect(landscape, zoomedOut)).toEqual({ x: 0, y: 0, size: 800 });
  });

  it("never leaves the image, even for invalid input", () => {
    const state = clampCrop(landscape, { centerX: Number.NaN, centerY: -50, zoom: 3 });
    const rect = cropRect(landscape, state);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBe(0);
    expect(rect.x + rect.size).toBeLessThanOrEqual(landscape.width);
    expect(rect.y + rect.size).toBeLessThanOrEqual(landscape.height);
  });

  it("converts screen drags into source pixels", () => {
    expect(sourcePixelsPerViewportPixel(landscape, 1, 320)).toBe(2.5);
    expect(sourcePixelsPerViewportPixel(landscape, 2, 320)).toBe(1.25);
    expect(sourcePixelsPerViewportPixel(landscape, 1, 0)).toBe(0);
  });
});

describe("avatar crop sizing", () => {
  it("downscales the working copy to the longest-edge limit", () => {
    expect(downscaledSize({ width: 8000, height: 6000 })).toEqual({
      width: maxWorkingEdge,
      height: 1536,
    });
    expect(downscaledSize({ width: 3000, height: 12000 })).toEqual({
      width: 512,
      height: maxWorkingEdge,
    });
    expect(downscaledSize({ width: 100_000, height: 10 })).toEqual({
      width: maxWorkingEdge,
      height: 1,
    });
  });

  it("does not upscale small images", () => {
    expect(downscaledSize({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
  });

  it("exports at the fixed size without upscaling small crops", () => {
    expect(outputEdge(1800)).toBe(avatarOutputSize);
    expect(outputEdge(512)).toBe(512);
    expect(outputEdge(300.7)).toBe(300);
    expect(outputEdge(0.2)).toBe(1);
  });
});
