"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type VSplitPaneProps = {
  ratio: number;
  onRatioChange: (ratio: number) => void;
  minTop: number;
  minBottom: number;
  handleSize?: number;
  className?: string;
  collapsed?: boolean;
  collapsedSize?: number;
  children: [ReactNode, ReactNode];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function VSplitPane({
  ratio,
  onRatioChange,
  minTop,
  minBottom,
  handleSize = 8,
  className,
  collapsed = false,
  collapsedSize = 44,
  children,
}: VSplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ratioRef = useRef(ratio);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  const clampRatio = useCallback((value: number, height: number) => {
    if (!height) {
      return value;
    }
    const min = minTop / height;
    const max = 1 - minBottom / height;
    if (min > max) {
      return min;
    }
    return clamp(value, min, max);
  }, [minTop, minBottom]);

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
      const height = container.clientHeight;
      if (!height) {
        return;
      }
      if (collapsed) {
        return;
      }
      const clamped = clampRatio(ratioRef.current, height);
      if (Math.abs(clamped - ratioRef.current) > 0.001) {
        applyRatio(clamped);
        onRatioChange(clamped);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [clampRatio, collapsed, onRatioChange]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    draggingRef.current = true;
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || collapsed) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const nextRatio = (event.clientY - rect.top) / rect.height;
    const clamped = clampRatio(nextRatio, rect.height);
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

  const topHeight = collapsed ? `calc(100% - ${collapsedSize}px)` : undefined;
  const bottomHeight = collapsed
    ? `${collapsedSize}px`
    : `calc(100% - var(--split) - (var(--gutter) * 0.5))`;
  const topSize = collapsed
    ? undefined
    : `calc(var(--split) - (var(--gutter) * 0.5))`;

  return (
    <div
      ref={containerRef}
      className={`group relative flex h-full w-full flex-col overflow-hidden ${className ?? ""}`}
      style={
        {
          "--split": `${ratio * 100}%`,
          "--gutter": `${handleSize}px`,
        } as CSSProperties
      }
    >
      <div
        className="w-full overflow-hidden"
        style={{
          height: topHeight ?? topSize,
          minHeight: collapsed ? undefined : minTop,
        }}
      >
        {children[0]}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        className="relative flex w-full items-center justify-center"
        style={{
          height: collapsed ? 0 : `var(--gutter)`,
          cursor: collapsed ? "default" : "row-resize",
          touchAction: "none",
          pointerEvents: collapsed ? "none" : "auto",
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <div className="absolute inset-0 bg-transparent transition-colors group-hover:bg-zinc-300/60" />
        <div className="pointer-events-none flex h-2 w-12 items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="h-1 w-1 rounded-full bg-zinc-500/70" />
          <span className="h-1 w-1 rounded-full bg-zinc-500/70" />
          <span className="h-1 w-1 rounded-full bg-zinc-500/70" />
          <span className="h-1 w-1 rounded-full bg-zinc-500/70" />
        </div>
      </div>
      <div
        className="w-full overflow-hidden"
        style={{
          height: bottomHeight,
          minHeight: collapsed ? collapsedSize : minBottom,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
}
