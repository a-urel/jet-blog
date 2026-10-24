"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { FormAlert } from "@/features/auth/components/form-alert";
import {
  cropEdge,
  cropRect,
  initialCrop,
  maxCropZoom,
  minCropZoom,
  panCrop,
  sourcePixelsPerViewportPixel,
  zoomCrop,
  type CropState,
} from "../crop";
import { CropSourceFailure, exportCrop, type CropSource } from "../crop-image";

type AvatarCropDialogProps = {
  // The decoded image to crop; the dialog is open while this is set.
  source: CropSource | null;
  onCancel: () => void;
  onSave: (file: File) => void;
  // Receives focus when the dialog closes. The dialog opens from a file
  // picker, not a DialogTrigger, so Radix may have nothing to return to.
  returnFocusRef: RefObject<HTMLElement | null>;
};

const zoomStep = 0.1;
// Arrow keys move the picture by this share of the crop square (Shift: more).
const panShare = 0.05;
const largePanShare = 0.2;

// Square crop with a circular preview. Drag (or arrow keys) moves the picture,
// the slider, the mouse wheel, or +/- zooms. There are no animations besides
// the dialog's own, which reduced motion turns off.
export function AvatarCropDialog({ source, ...props }: AvatarCropDialogProps) {
  return (
    <Dialog
      open={source !== null}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      {source ? <CropDialogContent source={source} {...props} /> : null}
    </Dialog>
  );
}

function CropDialogContent({
  source,
  onCancel,
  onSave,
  returnFocusRef,
}: AvatarCropDialogProps & { source: CropSource }) {
  const t = useTranslations("avatars.crop");
  const [crop, setCrop] = useState<CropState>(() => initialCrop(source));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // State, not a ref: the dialog portal mounts its children after this
  // component's first effects run, so the effects below must re-run once the
  // crop area exists.
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState(0);

  // The crop area is fluid; track its rendered edge for drawing and dragging.
  useEffect(() => {
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => setViewport(entry.contentRect.width));
    observer.observe(area);
    return () => observer.disconnect();
  }, [area]);

  // Draws the crop square into the canvas at device resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || viewport === 0) return;

    const pixels = Math.round(viewport * window.devicePixelRatio);
    canvas.width = pixels;
    canvas.height = pixels;
    const rect = cropRect(source, crop);
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, pixels, pixels);
    context.drawImage(source.canvas, rect.x, rect.y, rect.size, rect.size, 0, 0, pixels, pixels);
  }, [source, crop, viewport]);

  // React registers wheel listeners as passive, so preventDefault needs a
  // native listener.
  useEffect(() => {
    if (!area) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setCrop((current) => zoomCrop(source, current, current.zoom * Math.exp(-event.deltaY / 500)));
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [area, source]);

  const panByViewportPixels = (dx: number, dy: number) => {
    setCrop((current) => {
      const ratio = sourcePixelsPerViewportPixel(source, current.zoom, viewport);
      // Moving the picture right moves the crop square left over the source.
      return panCrop(source, current, -dx * ratio, -dy * ratio);
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = drag.current;
    if (!last || last.pointerId !== event.pointerId) return;
    drag.current = { ...last, x: event.clientX, y: event.clientY };
    panByViewportPixels(event.clientX - last.x, event.clientY - last.y);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = cropEdge(source, crop.zoom) * (event.shiftKey ? largePanShare : panShare);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCrop((current) => panCrop(source, current, move[0], move[1]));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setCrop((current) => zoomCrop(source, current, current.zoom + zoomStep));
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setCrop((current) => zoomCrop(source, current, current.zoom - zoomStep));
    }
  };

  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      onSave(await exportCrop(source, cropRect(source, crop)));
    } catch (error) {
      if (!(error instanceof CropSourceFailure)) console.error(error);
      setFailed(true);
      setSaving(false);
    }
  };

  const zoomPercent = Math.round(crop.zoom * 100);

  return (
    <DialogContent
      className="motion-reduce:animate-none sm:max-w-md"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocusRef.current?.focus();
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        if (event.target instanceof HTMLElement) {
          event.target.querySelector<HTMLElement>("[data-slot=avatar-crop-area]")?.focus();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("instructions")}</DialogDescription>
      </DialogHeader>

      <div
        ref={setArea}
        data-slot="avatar-crop-area"
        role="group"
        tabIndex={0}
        aria-label={t("area")}
        className="relative mx-auto aspect-square w-full max-w-80 cursor-grab touch-none overflow-hidden rounded-lg bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="size-full" />
        {/* Dims the corners outside the circle that avatars display. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_100vmax_rgb(0_0_0/0.55)] ring-2 ring-white/80"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={crop.zoom <= minCropZoom}
          onClick={() => setCrop((current) => zoomCrop(source, current, current.zoom - zoomStep))}
        >
          <ZoomOut aria-hidden="true" />
          <span className="sr-only">{t("zoomOut")}</span>
        </Button>
        <Slider
          min={minCropZoom}
          max={maxCropZoom}
          step={0.01}
          value={[crop.zoom]}
          onValueChange={([zoom]) => setCrop((current) => zoomCrop(source, current, zoom))}
          aria-label={t("zoom")}
          aria-valuetext={t("zoomValue", { percent: zoomPercent })}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={crop.zoom >= maxCropZoom}
          onClick={() => setCrop((current) => zoomCrop(source, current, current.zoom + zoomStep))}
        >
          <ZoomIn aria-hidden="true" />
          <span className="sr-only">{t("zoomIn")}</span>
        </Button>
      </div>

      {failed ? <FormAlert tone="error">{t("exportFailed")}</FormAlert> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
