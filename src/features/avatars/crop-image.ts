import { downscaledSize, maxCropSourceBytes, outputEdge, type CropRect } from "./crop";

// Browser-only helpers for the avatar crop dialog: decode a chosen file into a
// downscaled working canvas, then export the cropped square as a new file. The
// exported file goes through the same Server Action and server validation as
// any other upload, so nothing here is a security boundary.

export type CropSource = { canvas: HTMLCanvasElement; width: number; height: number };

// Message keys under avatars.crop.
export type CropSourceError = "sourceTooLarge" | "decodeFailed" | "exportFailed";

export class CropSourceFailure extends Error {
  constructor(readonly reason: CropSourceError) {
    super(reason);
  }
}

// Decodes through an <img>, which applies EXIF orientation (image-orientation:
// from-image is the default), and draws it into a canvas whose longest edge is
// at most maxWorkingEdge. Animated GIFs keep only their first frame.
export async function loadCropSource(file: File): Promise<CropSource> {
  if (file.size > maxCropSourceBytes) throw new CropSourceFailure("sourceTooLarge");

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();

    const size = downscaledSize({ width: image.naturalWidth, height: image.naturalHeight });
    if (size.width < 1 || size.height < 1) throw new CropSourceFailure("decodeFailed");

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new CropSourceFailure("decodeFailed");

    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size.width, size.height);
    return { canvas, ...size };
  } catch (error) {
    if (error instanceof CropSourceFailure) throw error;
    throw new CropSourceFailure("decodeFailed");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Renders the crop square at the output size and encodes it as WebP, or as
// JPEG on browsers that cannot encode WebP (toBlob then falls back to PNG).
// JPEG has no alpha channel, so transparent areas become white instead of
// black.
export async function exportCrop(source: CropSource, rect: CropRect): Promise<File> {
  const edge = outputEdge(rect.size);
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext("2d");
  if (!context) throw new CropSourceFailure("exportFailed");

  const draw = () => {
    context.imageSmoothingQuality = "high";
    context.drawImage(source.canvas, rect.x, rect.y, rect.size, rect.size, 0, 0, edge, edge);
  };

  draw();
  const webp = await toBlob(canvas, "image/webp", 0.9);
  if (webp?.type === "image/webp") {
    return new File([webp], "avatar.webp", { type: "image/webp" });
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, edge, edge);
  draw();
  const jpeg = await toBlob(canvas, "image/jpeg", 0.9);
  if (!jpeg) throw new CropSourceFailure("exportFailed");
  return new File([jpeg], "avatar.jpg", { type: "image/jpeg" });
}
