import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GalleryImage } from "../core/schema";
import { Picture } from "./Picture";

/**
 * Accepts both entity image forms and guarantees accessible text for every
 * frame. Bare URLs keep working, so documents written before captions existed
 * render exactly as they did.
 */
export function normalizeGalleryImages(
  images: (string | GalleryImage)[] | undefined,
  fallbackAlt: string,
): GalleryImage[] {
  return (images ?? []).map((entry, index) =>
    typeof entry === "string"
      ? { src: entry, alt: `${fallbackAlt} — image ${index + 1}` }
      : entry,
  );
}

export interface InlineGalleryProps {
  images: GalleryImage[];
  /** Accessible name for the group; frames carry their own alt text. */
  label?: string;
}

/**
 * One frame at a time with its own caption. Arrows and a counter are the only
 * navigation: no autoplay, and the region keeps a fixed shape so the text below
 * it cannot jump while frames change.
 */
export function InlineGallery({ images, label }: InlineGalleryProps) {
  const [index, setIndex] = useState(0);
  // A stable signature: parents rebuild the array on every render, and keying
  // the reset on identity would clear the frame the reader just chose.
  const signature = images.map((image) => image.src).join("\n");
  useEffect(() => setIndex(0), [signature]);
  if (images.length === 0) return null;
  const current = Math.min(index, images.length - 1);
  const frame = images[current]!;
  const move = (step: number) =>
    setIndex(Math.min(images.length - 1, Math.max(0, current + step)));
  return (
    <figure className="ru-gallery" aria-label={label}>
      <div className="ru-gallery-frame">
        <Picture
          key={`${current}:${frame.src}`}
          src={frame.src}
          alt={frame.alt}
          className="ru-gallery-photo"
        />
      </div>
      <figcaption className="ru-gallery-caption">
        <span>{frame.caption ?? frame.alt}</span>
      </figcaption>
      {images.length > 1 && (
        <div
          className="ru-gallery-controls"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            }
          }}
        >
          <button
            type="button"
            aria-label="Previous image"
            disabled={current === 0}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <output aria-live="polite">
            {current + 1} / {images.length}
          </output>
          <button
            type="button"
            aria-label="Next image"
            disabled={current === images.length - 1}
            onClick={() => move(1)}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </figure>
  );
}
