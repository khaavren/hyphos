"use client";

import { useEffect, useMemo, useRef } from "react";
import { useModelSettings, type SimulationSnapshot } from "../lib/graph/valueBridge";
import { getSimulationRunner } from "../lib/simulation/SimulationRunner";

type TracesPanelProps = {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const plantColors: Record<string, string> = {
  veins: "#0f766e",
  margins: "#0ea5e9",
  chlorophyll: "#22c55e",
  cellWalls: "#f59e0b",
  moss: "#16a34a",
  roots: "#a16207",
  senescence: "#ef4444",
};

const stateColors: Record<string, string> = {
  ALIVE: "#22c55e",
  STRESSED: "#f97316",
  COLLAPSE: "#ef4444",
  RECOVER: "#3b82f6",
  EXTINCTION: "#0f172a",
  REBIRTH: "#a855f7",
};

const dashStyles = [
  [],
  [6, 4],
  [2, 3],
  [8, 4],
];

export default function TracesPanel({
  collapsed = false,
  onToggleCollapsed,
}: TracesPanelProps) {
  const runner = useMemo(() => getSimulationRunner(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorAgnostic = useModelSettings().accessibility.colorAgnostic;

  useEffect(() => {
    if (collapsed) {
      return;
    }
    const interval = window.setInterval(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTraces(
        context,
        rect.width,
        rect.height,
        runner.getHistory(),
        colorAgnostic,
      );
    }, 1000 / 12);

    return () => window.clearInterval(interval);
  }, [runner, colorAgnostic, collapsed]);

  return (
    <div className="flex h-full w-full flex-col rounded-3xl border border-zinc-200 bg-white/90 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        <span>Traces</span>
        <div className="flex items-center gap-2 text-[10px] normal-case text-zinc-400">
          {!collapsed ? <span>Last 600 cycles</span> : null}
          <button
            type="button"
            className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-500"
            onClick={onToggleCollapsed}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      {collapsed ? null : <canvas ref={canvasRef} className="h-full w-full" />}
    </div>
  );
}

const drawTraces = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  history: ReturnType<ReturnType<typeof getSimulationRunner>["getHistory"]>,
  colorAgnostic: boolean,
) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  if (!history.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui";
    ctx.fillText("No trace data yet.", 12, 24);
    return;
  }

  const maxPoints = 600;
  const points = history.slice(-maxPoints);
  const pad = 18;
  const gap = 14;
  const available = height - pad * 2 - gap * 3;
  const channelsHeight = available * 0.4;
  const vitalityHeight = available * 0.18;
  const plantsHeight = available * 0.26;
  const stateHeight = available * 0.16;

  const channelsTop = pad;
  const vitalityTop = channelsTop + channelsHeight + gap;
  const plantsTop = vitalityTop + vitalityHeight + gap;
  const stateTop = plantsTop + plantsHeight + gap;

  drawGrid(ctx, pad, channelsTop, width - pad * 2, channelsHeight);
  drawGrid(ctx, pad, vitalityTop, width - pad * 2, vitalityHeight);
  drawGrid(ctx, pad, plantsTop, width - pad * 2, plantsHeight);

  ctx.fillStyle = "#475569";
  ctx.font = "10px system-ui";
  ctx.fillText("Channels A/B/S/T", pad, channelsTop - 6);
  ctx.fillText("Vitality", pad, vitalityTop - 6);
  ctx.fillText("Top-3 Plant Weights", pad, plantsTop - 6);
  ctx.fillText("State Machine", pad, stateTop - 6);

  const getX = (index: number) =>
    pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);

  drawLine(
    ctx,
    points,
    (snap) => snap.channelsABST.A,
    channelsTop,
    channelsHeight,
    colorAgnostic ? "#111827" : "#38bdf8",
    colorAgnostic ? dashStyles[0] : [],
    getX,
  );
  drawLine(
    ctx,
    points,
    (snap) => snap.channelsABST.B,
    channelsTop,
    channelsHeight,
    colorAgnostic ? "#374151" : "#34d399",
    colorAgnostic ? dashStyles[1] : [],
    getX,
  );
  drawLine(
    ctx,
    points,
    (snap) => snap.channelsABST.S,
    channelsTop,
    channelsHeight,
    colorAgnostic ? "#6b7280" : "#f472b6",
    colorAgnostic ? dashStyles[2] : [],
    getX,
  );
  drawLine(
    ctx,
    points,
    (snap) => snap.channelsABST.T,
    channelsTop,
    channelsHeight,
    colorAgnostic ? "#9ca3af" : "#facc15",
    colorAgnostic ? dashStyles[3] : [],
    getX,
  );

  drawLine(
    ctx,
    points,
    (snap) => snap.uniforms.u_vitality,
    vitalityTop,
    vitalityHeight,
    colorAgnostic ? "#111827" : "#0f172a",
    colorAgnostic ? dashStyles[0] : [],
    getX,
  );

  const latest = points[points.length - 1];
  const activePlants =
    latest?.plantWeightsClampedTop3.filter((entry) => entry.active).slice(0, 3) ??
    [];
  const activeNames = activePlants.length
    ? activePlants.map((entry) => entry.name)
    : ["veins", "moss", "roots"];

  activeNames.forEach((name, index) => {
    const color = colorAgnostic ? "#1f2937" : plantColors[name] ?? "#334155";
    drawLine(
      ctx,
      points,
      (snap) =>
        snap.plantWeightsClampedTop3.find(
          (entry: { name: string; weight: number }) => entry.name === name,
        )?.weight ?? 0,
      plantsTop,
      plantsHeight,
      color,
      colorAgnostic ? dashStyles[index % dashStyles.length] : [],
      getX,
    );
  });

  drawStateBand(ctx, points, stateTop, stateHeight, getX, colorAgnostic);
};

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  const rows = 3;
  for (let i = 0; i <= rows; i += 1) {
    const yPos = y + (height / rows) * i;
    ctx.beginPath();
    ctx.moveTo(x, yPos);
    ctx.lineTo(x + width, yPos);
    ctx.stroke();
  }
  ctx.setLineDash([]);
};

const drawLine = (
  ctx: CanvasRenderingContext2D,
  points: SimulationSnapshot[],
  getter: (snapshot: SimulationSnapshot) => number,
  top: number,
  height: number,
  color: string,
  dash: number[],
  getX: (index: number) => number,
) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach((point, index) => {
    const value = clamp01(getter(point));
    const x = getX(index);
    const y = top + (1 - value) * height;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
};

const drawStateBand = (
  ctx: CanvasRenderingContext2D,
  points: SimulationSnapshot[],
  top: number,
  height: number,
  getX: (index: number) => number,
  colorAgnostic: boolean,
) => {
  if (!points.length) {
    return;
  }
  let startIndex = 0;
  let currentState = points[0].stateMachine.state;

  const flush = (endIndex: number) => {
    const x0 = getX(startIndex);
    const x1 = getX(endIndex);
    const color = colorAgnostic ? "#9ca3af" : stateColors[currentState] ?? "#64748b";
    ctx.fillStyle = color;
    ctx.fillRect(x0, top, x1 - x0 + 1, height);
  };

  for (let i = 1; i < points.length; i += 1) {
    const state = points[i].stateMachine.state;
    if (state !== currentState) {
      flush(i);
      startIndex = i;
      currentState = state;
    }
  }
  flush(points.length - 1);

  ctx.fillStyle = "#0f172a";
  ctx.font = "10px system-ui";
  ctx.fillText(currentState, getX(points.length - 1) - 48, top + height - 4);
};
