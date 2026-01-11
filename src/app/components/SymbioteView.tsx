"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SimulationSnapshot } from "../lib/graph/valueBridge";

type SymbioteViewProps = {
  snapshot: SimulationSnapshot | null;
  cycle: number;
  seed: string;
  isComputing?: boolean;
};

type ColonyCircle = {
  x: number;
  y: number;
  r: number;
  alpha: number;
};

type ColonyState = {
  circles: ColonyCircle[];
};

const TWO_PI = Math.PI * 2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hashSeed = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const hash1 = (x: number, seed: number) => {
  let h = x * 374761393 + seed * 1442695041;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

const valueNoise1D = (x: number, seed: number) => {
  const x0 = Math.floor(x);
  const x1 = x0 + 1;
  const t = smoothstep(0, 1, x - x0);
  const n0 = hash1(x0, seed) / 4294967295;
  const n1 = hash1(x1, seed) / 4294967295;
  return lerp(n0, n1, t);
};

const fbm1D = (x: number, seed: number) => {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let i = 0; i < 3; i += 1) {
    value += amplitude * valueNoise1D(x * frequency, seed + i * 17);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
};

const buildBlobPath = (
  centerX: number,
  centerY: number,
  baseRadius: number,
  noiseAmp: number,
  pointCount: number,
  seedA: number,
  seedB: number,
  mix: number,
  cycle: number,
) => {
  const path = new Path2D();
  const phase = cycle * 0.01;
  for (let i = 0; i <= pointCount; i += 1) {
    const angle = (i / pointCount) * TWO_PI;
    const x = angle / TWO_PI;
    const noiseA = fbm1D(x * 3 + phase, seedA);
    const noiseB = fbm1D(x * 3 + phase + 0.15, seedB);
    const noise = lerp(noiseA, noiseB, mix);
    const radius = baseRadius + (noise - 0.5) * 2 * noiseAmp;
    const px = centerX + Math.cos(angle) * radius;
    const py = centerY + Math.sin(angle) * radius;
    if (i === 0) {
      path.moveTo(px, py);
    } else {
      path.lineTo(px, py);
    }
  }
  path.closePath();
  return path;
};

const generateColonyState = (
  seed: number,
  centerX: number,
  centerY: number,
  baseRadius: number,
  count: number,
  radiusBase: number,
  alphaBase: number,
) => {
  const rng = mulberry32(seed);
  const clusterCount = 2 + Math.floor(rng() * 3);
  const clusterCenters: { x: number; y: number }[] = [];

  for (let i = 0; i < clusterCount; i += 1) {
    const angle = rng() * TWO_PI;
    const dist = baseRadius * (0.15 + rng() * 0.45);
    clusterCenters.push({
      x: centerX + Math.cos(angle) * dist,
      y: centerY + Math.sin(angle) * dist * 0.9,
    });
  }

  const circles: ColonyCircle[] = [];
  for (let i = 0; i < count; i += 1) {
    const useCluster = rng() > 0.2;
    const clusterIndex = Math.floor(rng() * clusterCount);
    const base = useCluster
      ? clusterCenters[clusterIndex]
      : {
          x: centerX + (rng() - 0.5) * baseRadius * 1.1,
          y: centerY + (rng() - 0.5) * baseRadius * 1.1,
        };
    const offsetAngle = rng() * TWO_PI;
    const offsetRadius = baseRadius * (0.05 + rng() * 0.25);
    let x = base.x + Math.cos(offsetAngle) * offsetRadius;
    let y = base.y + Math.sin(offsetAngle) * offsetRadius * 0.8;
    const dx = x - centerX;
    const dy = y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > baseRadius * 0.85) {
      const scale = (baseRadius * 0.85) / Math.max(1, dist);
      x = centerX + dx * scale;
      y = centerY + dy * scale;
    }
    const radius = radiusBase * (0.45 + rng() * 0.9);
    const alpha = alphaBase * (0.6 + rng() * 0.8);
    circles.push({ x, y, r: radius, alpha });
  }

  return { circles };
};

const interpolateStates = (
  a: ColonyState,
  b: ColonyState,
  mix: number,
  cycle: number,
  seed: number,
) => {
  const count = Math.max(a.circles.length, b.circles.length);
  const circles: ColonyCircle[] = [];
  for (let i = 0; i < count; i += 1) {
    const ca = a.circles[i] ?? { x: a.circles[0]?.x ?? 0, y: a.circles[0]?.y ?? 0, r: 0, alpha: 0 };
    const cb = b.circles[i] ?? { x: b.circles[0]?.x ?? 0, y: b.circles[0]?.y ?? 0, r: 0, alpha: 0 };
    const driftX = Math.sin(cycle * 0.02 + i * 1.7 + seed * 0.001) * 1.6;
    const driftY = Math.cos(cycle * 0.018 + i * 2.1 + seed * 0.0015) * 1.6;
    circles.push({
      x: lerp(ca.x, cb.x, mix) + driftX,
      y: lerp(ca.y, cb.y, mix) + driftY,
      r: lerp(ca.r, cb.r, mix),
      alpha: lerp(ca.alpha, cb.alpha, mix),
    });
  }
  return circles;
};

const drawTriLattice = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spacing: number,
  alpha: number,
) => {
  const maxLen = Math.max(width, height) * 1.6;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.lineWidth = 1;

  angles.forEach((angle) => {
    ctx.save();
    ctx.rotate(angle);
    for (let x = -maxLen; x <= maxLen; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, -maxLen);
      ctx.lineTo(x, maxLen);
      ctx.stroke();
    }
    ctx.restore();
  });

  ctx.restore();
};

const drawColonies = (ctx: CanvasRenderingContext2D, circles: ColonyCircle[]) => {
  circles.forEach((circle) => {
    if (circle.r <= 1 || circle.alpha <= 0.01) {
      return;
    }
    const gradient = ctx.createRadialGradient(
      circle.x,
      circle.y,
      circle.r * 0.1,
      circle.x,
      circle.y,
      circle.r,
    );
    const alpha = clamp(circle.alpha, 0.08, 0.5);
    gradient.addColorStop(0, `rgba(50, 155, 70, ${alpha})`);
    gradient.addColorStop(1, "rgba(50, 155, 70, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.r, 0, TWO_PI);
    ctx.fill();
  });
};

const drawConnections = (
  ctx: CanvasRenderingContext2D,
  circles: ColonyCircle[],
  threshold: number,
) => {
  ctx.strokeStyle = "rgba(40, 100, 40, 0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i < circles.length; i += 1) {
    if (i % 3 !== 0) {
      continue;
    }
    let closestIndex = -1;
    let closestDistance = threshold;
    for (let j = 0; j < circles.length; j += 1) {
      if (i === j) {
        continue;
      }
      const dx = circles[i].x - circles[j].x;
      const dy = circles[i].y - circles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestIndex = j;
      }
    }
    if (closestIndex >= 0) {
      ctx.beginPath();
      ctx.moveTo(circles[i].x, circles[i].y);
      ctx.lineTo(circles[closestIndex].x, circles[closestIndex].y);
      ctx.stroke();
    }
  }
};

export default function SymbioteView({
  snapshot,
  cycle,
  seed,
  isComputing = false,
}: SymbioteViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const seeded = useMemo(() => hashSeed(seed), [seed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSymbiote(ctx, rect.width, rect.height, snapshot, cycle, seeded);
  }, [snapshot, cycle, seeded]);

  return (
    <div className="h-full w-full rounded-3xl border border-zinc-200 bg-white/90 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        <span>Symbiote</span>
        <span className="flex items-center gap-2">
          {isComputing ? (
            <span className="text-[10px] normal-case text-zinc-400">
              computing...
            </span>
          ) : null}
          <span>Cycle {cycle}</span>
        </span>
      </div>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

const drawSymbiote = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: SimulationSnapshot | null,
  cycle: number,
  seed: number,
) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f6f5f2";
  ctx.fillRect(0, 0, width, height);

  const centerX = width * 0.5;
  const centerY = height * 0.54;
  const minDim = Math.min(width, height);
  const baseRadius = clamp(minDim * 0.36, 130, 240);

  const biotic = snapshot
    ? clamp01(
        snapshot.channelsABST.B * 0.55 +
          snapshot.plantWeightsRaw.moss * 0.2 +
          snapshot.uniforms.u_lichenCoverage * 0.25,
      )
    : 0.55;
  const stress = snapshot
    ? clamp01(
        (snapshot.stateMachine.stress ?? 0) * 0.4 +
          snapshot.plantWeightsRaw.cellWalls * 0.35 +
          snapshot.plantWeightsRaw.senescence * 0.25,
      )
    : 0.3;
  const vitality = snapshot ? clamp01(snapshot.uniforms.u_vitality) : 0.6;

  const cycleBucket = Math.floor(cycle / 50);
  const mix = (cycle % 50) / 50;
  const seedA = seed ^ (cycleBucket * 1664525 + 1013904223);
  const seedB = seed ^ ((cycleBucket + 1) * 1664525 + 1013904223);

  const noiseAmp = clamp(baseRadius * 0.06, 6, 14);
  const pointCount = Math.round(clamp(baseRadius * 0.55, 80, 140));
  const blobPath = buildBlobPath(
    centerX,
    centerY,
    baseRadius,
    noiseAmp,
    pointCount,
    seedA,
    seedB,
    mix,
    cycle,
  );

  ctx.save();
  ctx.clip(blobPath);

  const baseFillR = 214 + biotic * 6;
  const baseFillG = 222 + biotic * 10;
  const baseFillB = 212 - biotic * 6;
  ctx.fillStyle = `rgb(${Math.round(baseFillR)}, ${Math.round(
    baseFillG,
  )}, ${Math.round(baseFillB)})`;
  ctx.fillRect(0, 0, width, height);

  const latticeAlpha = clamp(0.035 + stress * 0.04, 0.03, 0.09);
  drawTriLattice(ctx, width, height, clamp(baseRadius * 0.12, 22, 32), latticeAlpha);

  const colonyCount = Math.round(lerp(18, 40, biotic));
  const colonyRadius = lerp(baseRadius * 0.08, baseRadius * 0.22, biotic);
  const alphaBase = lerp(0.2, 0.45, biotic);

  const stateA = generateColonyState(
    seedA ^ 0x5bd1e995,
    centerX,
    centerY,
    baseRadius,
    colonyCount,
    colonyRadius,
    alphaBase,
  );
  const stateB = generateColonyState(
    seedB ^ 0x85ebca6b,
    centerX,
    centerY,
    baseRadius,
    colonyCount,
    colonyRadius,
    alphaBase,
  );
  const circles = interpolateStates(stateA, stateB, mix, cycle, seed);

  drawColonies(ctx, circles);
  drawConnections(ctx, circles, baseRadius * 0.35);

  ctx.restore();

  const outlineAlpha = clamp(0.35 + (1 - vitality) * 0.35, 0.3, 0.7);
  ctx.strokeStyle = `rgba(60, 60, 60, ${outlineAlpha})`;
  ctx.lineWidth = 1.2;
  ctx.stroke(blobPath);
};
