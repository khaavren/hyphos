"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type SplitPaneProps = {
  ratio: number;
  onRatioChange: (ratio: number) => void;
  minLeft: number;
  minRight: number;
  handleSize?: number;
  className?: string;
  children: [ReactNode, ReactNode];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function SplitPane({
  ratio,
  onRatioChange,
  minLeft,
  minRight,
  handleSize = 8,
  className,
  children,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ratioRef = useRef(ratio);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  const clampRatio = (value: number, width: number) => {
    if (!width) {
      return value;
    }
    const min = minLeft / width;
    const max = 1 - minRight / width;
    if (min > max) {
      return min;
    }
    return clamp(value, min, max);
  };

  const applyRatio = (value: number) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    ratioRef.current = value;
    container.style.setProperty("--split", `${value * 100}%`);
  };

  const scheduleRatio = (value: number) => {
    pendingRef.current = value;
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current !== null) {
        applyRatio(pendingRef.current);
      }
    });
  };

  useEffect(() => {
    applyRatio(ratio);
  }, [ratio]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const clamped = clampRatio(ratioRef.current, width);
      if (Math.abs(clamped - ratioRef.current) > 0.001) {
        applyRatio(clamped);
        onRatioChange(clamped);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [onRatioChange]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    draggingRef.current = true;
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const nextRatio = (event.clientX - rect.left) / rect.width;
    const clamped = clampRatio(nextRatio, rect.width);
    scheduleRatio(clamped);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    (event.currentTarget as HTMLDivElement).releasePointerCapture(
      event.pointerId,
    );
    if (pendingRef.current !== null) {
      applyRatio(pendingRef.current);
      pendingRef.current = null;
    }
    onRatioChange(ratioRef.current);
  };

  return (
    <div
      ref={containerRef}
      className={`group relative flex h-full w-full overflow-hidden ${className ?? ""}`}
      style={
        {
          "--split": `${ratio * 100}%`,
          "--gutter": `${handleSize}px`,
        } as CSSProperties
      }
    >
      <div
        className="h-full overflow-hidden"
        style={{
          width: `calc(var(--split) - (var(--gutter) * 0.5))`,
          minWidth: minLeft,
        }}
      >
        {children[0]}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        className="relative flex h-full items-center justify-center"
        style={{
          width: `var(--gutter)`,
          cursor: "col-resize",
          touchAction: "none",
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <div className="absolute inset-0 bg-transparent transition-colors group-hover:bg-zinc-300/60" />
        <div className="pointer-events-none flex h-10 w-2 flex-col items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="h-1 w-1 rounded-full bg-zinc-500/70" />
          <span className="h-1 w-1 rounded-full bg-zinc-500/70" />
          <span className="h-1 w-1 rounded-full bg-zinc-500/70" />
        </div>
      </div>
      <div
        className="h-full overflow-hidden"
        style={{
          width: `calc(100% - var(--split) - (var(--gutter) * 0.5))`,
          minWidth: minRight,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
}
