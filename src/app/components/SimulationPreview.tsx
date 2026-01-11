"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { PackedTexture, Uniforms } from "../lib/renderers/IRenderer";
import { getProceduralTextures } from "../lib/renderers/proceduralTextures";
import { getSimulationRunner } from "../lib/simulation/SimulationRunner";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export default function SimulationPreview() {
  const runner = useMemo(() => getSimulationRunner(), []);
  const textures = useMemo(() => getProceduralTextures(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
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
      drawPreview(ctx, rect.width, rect.height, runner.getLatestSnapshot(), textures, offscreenRef);
    }, 1000 / 12);

    return () => window.clearInterval(interval);
  }, [runner, textures]);

  return (
    <div className="h-full w-full rounded-3xl border border-zinc-200 bg-white/90 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        Preview Field
      </div>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

const drawPreview = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: { uniforms: Uniforms } | null,
  textures: PackedTexture[],
  offscreenRef: MutableRefObject<HTMLCanvasElement | null>,
) => {
  ctx.clearRect(0, 0, width, height);
  if (!snapshot) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui";
    ctx.fillText("Waiting for simulation...", 12, 24);
    return;
  }

  const noiseTex = textures.find((tex) => tex.name === "noise");
  const plantTex = textures.find((tex) => tex.name === "plants");
  if (!noiseTex || !plantTex) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui";
    ctx.fillText("Textures missing.", 12, 24);
    return;
  }

  const gridWidth = 180;
  const gridHeight = Math.max(80, Math.round((gridWidth * height) / width));
  const offscreen = offscreenRef.current ?? document.createElement("canvas");
  offscreen.width = gridWidth;
  offscreen.height = gridHeight;
  offscreenRef.current = offscreen;

  const offCtx = offscreen.getContext("2d");
  if (!offCtx) {
    return;
  }

  const img = offCtx.createImageData(gridWidth, gridHeight);
  const data = img.data;
  const uniforms = snapshot.uniforms;

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const u = x / (gridWidth - 1);
      const v = y / (gridHeight - 1);
      const noise = sampleRGBA(noiseTex, u * 3.0, v * 3.0);
      const plants = sampleRGBA(plantTex, u * 2.0, v * 2.0);

      const baseHeight =
        noise[0] * 0.45 + noise[1] * 0.25 + noise[2] * 0.3;
      const plantHeight = plants[3] * 0.5;
      const vein = plants[0] * uniforms.u_veinGrowth * 0.4;
      const mycelium = plants[1] * uniforms.u_myceliumDensity * 0.3;
      const lichen = plants[2] * uniforms.u_lichenCoverage * 0.25;
      const heightField = baseHeight + plantHeight + vein + mycelium + lichen;

      const dx = u - 0.5;
      const dy = v - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pulsePhase =
        dist * 8 + uniforms.u_time * uniforms.u_pulseSpeed * 2;
      const pulse =
        Math.max(0, Math.sin(pulsePhase * uniforms.u_pulseCount)) *
        uniforms.u_pulseEnergy *
        0.6;

      let value = clamp01(heightField + pulse) * (0.7 + uniforms.u_vitality * 0.4);
      const grain =
        (noise[3] - 0.5) *
        uniforms.u_grainStrength *
        2;

      let r = value + uniforms.u_tempShift * 0.9 + grain;
      let g = value + uniforms.u_greenBias * 0.9 + grain;
      let b = value + uniforms.u_blueBias * 0.9 + grain;

      const avg = (r + g + b) / 3;
      r = avg + (r - avg) * uniforms.u_saturation;
      g = avg + (g - avg) * uniforms.u_saturation;
      b = avg + (b - avg) * uniforms.u_saturation;

      r = (r - 0.5) * uniforms.u_contrast + 0.5;
      g = (g - 0.5) * uniforms.u_contrast + 0.5;
      b = (b - 0.5) * uniforms.u_contrast + 0.5;

      const fractureVignette =
        smoothstep(0.25, 0.85, dist) * uniforms.u_fractureOn;
      r = r * (1 - fractureVignette * 0.35) + fractureVignette * 0.08;
      g = g * (1 - fractureVignette * 0.3);
      b = b * (1 - fractureVignette * 0.25);

      const idx = (y * gridWidth + x) * 4;
      data[idx] = Math.round(clamp01(r) * 255);
      data[idx + 1] = Math.round(clamp01(g) * 255);
      data[idx + 2] = Math.round(clamp01(b) * 255);
      data[idx + 3] = 255;
    }
  }

  offCtx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, 0, 0, width, height);
};

const sampleRGBA = (texture: PackedTexture, u: number, v: number) => {
  const wrap = (value: number) => ((value % 1) + 1) % 1;
  const uu = wrap(u);
  const vv = wrap(v);
  const x = Math.floor(uu * (texture.width - 1));
  const y = Math.floor(vv * (texture.height - 1));
  const idx = (y * texture.width + x) * 4;
  const data = texture.data;
  return [
    data[idx] / 255,
    data[idx + 1] / 255,
    data[idx + 2] / 255,
    data[idx + 3] / 255,
  ];
};
