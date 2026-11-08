import createGlobe, { type Arc, type Marker } from "cobe";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface GlobeLabel {
  id: string;
  name: string;
  value: string;
}

interface CobeGlobeProps {
  markers: Marker[];
  arcs?: Arc[];
  labels?: GlobeLabel[];
  className?: string;
  speed?: number;
  initialPhi?: number;
  initialTheta?: number;
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Globe({
  markers,
  arcs = [],
  labels = [],
  className,
  speed = 0.00045,
  initialPhi = 0,
  initialTheta = 0.16,
}: CobeGlobeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [supported] = useState(supportsWebGL);

  useEffect(() => {
    if (!supported) return;

    const root = rootRef.current;
    const mount = mountRef.current;
    if (!root || !mount) return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    mount.appendChild(canvas);

    const readSize = () => {
      const rect = root.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(rect.width) || 320),
        height: Math.max(1, Math.round(rect.height) || 320),
      };
    };

    const initial = readSize();
    /* Phones get a cheaper globe: half the samples and a lower pixel ratio. */
    const compact = initial.width < 680;
    let width = initial.width;
    let height = initial.height;
    let phi = initialPhi;
    let theta = initialTheta;
    let interacting = false;
    let lastX = 0;
    let lastY = 0;
    let spin = 0;
    let dirty = true;
    let running = false;
    let frame = 0;
    let lastTime = performance.now();

    const globe = createGlobe(canvas, {
      width,
      height,
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2),
      phi,
      theta,
      dark: 0.72,
      diffuse: 1.35,
      mapSamples: compact ? 9000 : 18000,
      mapBrightness: 6.4,
      mapBaseBrightness: 0.06,
      baseColor: [0.19, 0.16, 0.13],
      markerColor: [1, 0.49, 0.23],
      glowColor: [0.95, 0.42, 0.2],
      markers,
      arcs,
      arcColor: [0.98, 0.47, 0.22],
      arcWidth: 0.55,
      arcHeight: 0.18,
      markerElevation: 0.025,
      opacity: 0.98,
      offset: [0, 0],
      scale: 1.04,
    });

    const motionOff = () => {
      const root = document.documentElement;
      if (root.classList.contains("motion-on")) return false;
      return root.classList.contains("motion-off") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    };

    const tick = (now: number) => {
      const delta = Math.min(now - lastTime, 64);
      lastTime = now;

      if (!interacting && !motionOff()) {
        phi += (speed * delta) / 16.6667;
        if (Math.abs(spin) > 0.00001) {
          phi += spin;
          spin *= 0.93;
        }
        dirty = true;
      }

      if (dirty) {
        globe.update({ phi, theta });
        dirty = false;
      }

      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      interacting = true;
      lastX = event.clientX;
      lastY = event.clientY;
      spin = 0;
      root.classList.add("is-dragging");
      root.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!interacting) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (!dx && !dy) return;

      phi += dx * 0.006;
      theta = Math.max(-0.42, Math.min(0.42, theta + dy * 0.0025));
      spin = dx * 0.0012;
      dirty = true;
      globe.update({ phi, theta });
    };

    const endDrag = (event: PointerEvent) => {
      if (!interacting) return;
      interacting = false;
      root.classList.remove("is-dragging");
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.max(1, Math.round(entry.contentRect.width));
      const nextHeight = Math.max(1, Math.round(entry.contentRect.height));
      if (Math.abs(nextWidth - width) < 1 && Math.abs(nextHeight - height) < 1) return;
      width = nextWidth;
      height = nextHeight;
      globe.update({ width, height });
    });

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) start();
        else stop();
      },
      { threshold: 0.05 }
    );

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", endDrag);
    root.addEventListener("pointercancel", endDrag);
    resizeObserver.observe(root);
    intersectionObserver.observe(root);

    return () => {
      stop();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", endDrag);
      root.removeEventListener("pointercancel", endDrag);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      globe.destroy();
      mount.replaceChildren();
    };
  }, [supported, markers, arcs, speed, initialPhi, initialTheta]);

  if (!supported) {
    return <div className={cn("cobe-globe is-fallback h-full w-full", className)} aria-hidden="true" />;
  }

  const labelCss = labels
    .map(
      (label) =>
        `.cobe-label-${label.id}{position-anchor:--cobe-${label.id};opacity:var(--cobe-visible-${label.id},0);filter:blur(calc((1 - var(--cobe-visible-${label.id},0)) * 5px));}`
    )
    .join("\n");

  return (
    <div ref={rootRef} className={cn("cobe-globe relative h-full w-full", className)} aria-hidden="true">
      <style>{labelCss}</style>
      <div ref={mountRef} className="cobe-canvas-mount" />
      {labels.map((label) => (
        <span key={label.id} className={`cobe-label cobe-label-${label.id}`}>
          <i />
          <span>{label.name}</span>
          <strong>{label.value}</strong>
        </span>
      ))}
    </div>
  );
}
