import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import "./primitives.css";

const focusable =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Position against the visible viewport, including the area above a mobile keyboard. */
function useViewportPlacement(
  open: boolean,
  anchor: React.RefObject<HTMLElement>,
  panel: React.RefObject<HTMLElement>,
  preferAbove = false,
) {
  useLayoutEffect(() => {
    const element = panel.current;
    const target = anchor.current;
    if (!open || !element || !target) return;
    const viewport = window.visualViewport;
    const place = () => {
      element.style.transform = "";
      element.style.maxHeight = "";
      const bounds = target.getBoundingClientRect();
      const margin = 8;
      const left = (viewport?.offsetLeft ?? 0) + margin;
      const top = (viewport?.offsetTop ?? 0) + margin;
      const right = left + (viewport?.width ?? window.innerWidth) - margin * 2;
      const bottom =
        top + (viewport?.height ?? window.innerHeight) - margin * 2;
      const rect = element.getBoundingClientRect();
      const gap = preferAbove ? 0 : 6;
      const above = Math.max(0, bounds.top - top - gap);
      const below = Math.max(0, bottom - bounds.bottom - gap);
      const useAbove = preferAbove
        ? above >= rect.height || above > below
        : below < rect.height && above > below;
      element.style.maxHeight = `${Math.min(rect.height, useAbove ? above : below)}px`;
      const sized = element.getBoundingClientRect();
      // For a tooltip the stylesheet already subtracts half its width, so
      // sized.left is its current visual edge. Clamp that edge and translate
      // by the difference. Popover panels have no base transform.
      const x = Math.max(left, Math.min(sized.left, right - sized.width));
      const y = Math.max(
        top,
        useAbove ? bounds.top - gap - sized.height : bounds.bottom + gap,
      );
      element.style.transform = `${preferAbove ? "translateX(-50%) " : ""}translate(${x - sized.left}px, ${y - sized.top}px)`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    observer?.observe(element);
    observer?.observe(target);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      observer?.disconnect();
    };
  }, [open, anchor, panel, preferAbove]);
}

export interface PopoverProps {
  label: string;
  children: ReactNode;
}
/** Non-modal disclosure. Content may contain controls; no model/network callbacks. */
export function Popover({ label, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useViewportPlacement(open, trigger, panel);
  useEffect(() => {
    if (!open) return;
    (
      panel.current?.querySelector<HTMLElement>(focusable) ?? panel.current
    )?.focus();
    const close = () => {
      setOpen(false);
      trigger.current?.focus();
    };
    const pointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        container.current?.contains(document.activeElement)
      ) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <span
      className="ru-primitive-popover"
      ref={container}
      onBlur={(event) => {
        if (
          open &&
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <button
        className="ru-primitive-trigger"
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && (
        <div
          className="ru-primitive-popover-panel"
          id={id}
          ref={panel}
          tabIndex={-1}
          role="region"
          aria-label={label}
        >
          {children}
        </div>
      )}
    </span>
  );
}

export interface TooltipProps {
  text: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
}
/** Supply a single focusable child (normally a button). Tooltip content is text only. */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  useViewportPlacement(open, anchor, panel, true);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDismissed(true);
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  const describedBy =
    [children.props["aria-describedby"], open ? id : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <span
      className="ru-primitive-tooltip"
      ref={anchor}
      onMouseEnter={() => {
        setHovered(true);
        if (!focused) setDismissed(false);
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (!focused) setDismissed(false);
      }}
      onFocus={() => {
        setFocused(true);
        if (!hovered) setDismissed(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setFocused(false);
          if (!hovered) setDismissed(false);
        }
      }}
    >
      {React.cloneElement(children, { "aria-describedby": describedBy })}
      {open && (
        <span
          className="ru-primitive-tooltip-text"
          role="tooltip"
          id={id}
          ref={panel}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export interface ImageLightboxProps {
  src: string[];
  alt: string;
  label?: string;
  initialIndex?: number;
  /** Optional per-image captions; legacy callers pass URLs only. */
  captions?: (string | undefined)[];
}
/** Caller validates image URLs. Native modal dialog provides background inertness. */
export function ImageLightbox({
  src,
  alt,
  label = "Open gallery",
  initialIndex = 0,
  captions,
}: ImageLightboxProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const current = Math.min(index, Math.max(0, src.length - 1));
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    setFailed(false);
  }, [current, src[current]]);
  useEffect(() => {
    if (!open || src.length < 2) return;
    for (const step of [1, -1]) {
      const near = new Image();
      near.src = src[(current + step + src.length) % src.length]!;
    }
  }, [open, current, src]);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current!;
    node.showModal();
    closeButton.current?.focus();
    return () => {
      node.close();
      trigger.current?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!src.length && open) setOpen(false);
  }, [src.length, open]);
  return (
    <span className="ru-primitive-gallery">
      <button
        className="ru-primitive-trigger"
        type="button"
        ref={trigger}
        disabled={!src.length}
        aria-haspopup="dialog"
        onClick={() => {
          setIndex(
            Number.isFinite(initialIndex)
              ? Math.min(Math.max(0, Math.trunc(initialIndex)), src.length - 1)
              : 0,
          );
          setFailed(false);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <dialog
          className="ru-primitive-lightbox"
          ref={dialog}
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < bounds.left ||
                event.clientX > bounds.right ||
                event.clientY < bounds.top ||
                event.clientY > bounds.bottom
              )
                close();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
              return;
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setIndex((current + 1) % src.length);
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setIndex((current - 1 + src.length) % src.length);
            }
            if (event.key === "Home") {
              event.preventDefault();
              setIndex(0);
            }
            if (event.key === "End") {
              event.preventDefault();
              setIndex(src.length - 1);
            }
            if (event.key === "Tab") {
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(focusable),
              );
              const first = controls[0],
                last = controls[controls.length - 1];
              if (
                event.shiftKey &&
                (document.activeElement === first ||
                  !event.currentTarget.contains(document.activeElement))
              ) {
                event.preventDefault();
                last?.focus();
              } else if (
                !event.shiftKey &&
                (document.activeElement === last ||
                  !event.currentTarget.contains(document.activeElement))
              ) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <div className="ru-primitive-lightbox-header">
            <h2 id={titleId}>{alt}</h2>
            <button type="button" ref={closeButton} onClick={close}>
              Close gallery
            </button>
          </div>
          <div className="ru-primitive-lightbox-image">
            {failed ? (
              <p role="status">Image unavailable</p>
            ) : (
              <img
                src={src[current]}
                alt={alt}
                onError={() => setFailed(true)}
              />
            )}
          </div>
          {captions?.[current] && (
            <p className="ru-primitive-lightbox-caption">{captions[current]}</p>
          )}
          <div className="ru-primitive-lightbox-controls">
            {src.length > 1 && (
              <button
                type="button"
                aria-label="Previous image"
                onClick={() =>
                  setIndex((current - 1 + src.length) % src.length)
                }
              >
                ←
              </button>
            )}
            <span role="status" aria-live="polite">
              {current + 1} / {src.length}
            </span>
            {src.length > 1 && (
              <button
                type="button"
                aria-label="Next image"
                onClick={() => setIndex((current + 1) % src.length)}
              >
                →
              </button>
            )}
          </div>
        </dialog>
      )}
    </span>
  );
}
