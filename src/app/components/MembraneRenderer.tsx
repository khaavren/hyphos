"use client";

import { useEffect, useRef, useState } from "react";
import type { BackendPreference, IRenderer } from "../lib/renderers/IRenderer";
import type { BackendInfo } from "../lib/graph/valueBridge";
import {
  getModelSettings,
  pushSnapshot,
  setAccessibility,
  setBackendInfo,
} from "../lib/graph/valueBridge";
import { getProceduralTextures } from "../lib/renderers/proceduralTextures";
import { selectRenderer } from "../lib/renderers/selectRenderer";
import { Simulation } from "../lib/simulation/Simulation";

type BackendLabel = "WebGPU" | "WebGL2";

const preferenceLabels: Record<BackendPreference, string> = {
  auto: "Auto",
  webgpu: "Force WebGPU",
  webgl2: "Force WebGL2",
};

export default function MembraneRenderer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<IRenderer | null>(null);
  const simulationRef = useRef<Simulation | null>(null);
  const rafRef = useRef<number | null>(null);
  const cycleIndexRef = useRef(0);
  const backendInfoRef = useRef<BackendInfo>({
    backend: "WebGL2",
    warning: null,
  });
  const resourcesRef = useRef({
    textures: getProceduralTextures(),
  });

  const [preference, setPreference] = useState<BackendPreference>("auto");
  const [backend, setBackend] = useState<BackendLabel>("WebGL2");
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => {
      setAccessibility({ reducedMotion: media.matches });
    };
    handleChange();
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") {
      return;
    }

    const simulation = simulationRef.current ?? new Simulation();
    simulationRef.current = simulation;

    const stopLoop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const startLoop = (renderer: IRenderer) => {
      let lastTime = performance.now();
      const frame = (now: number) => {
        if (cancelled) {
          return;
        }
        const delta = (now - lastTime) / 1000;
        lastTime = now;
        const settings = getModelSettings();
        const cycleIndex = cycleIndexRef.current + 1;
        cycleIndexRef.current = cycleIndex;
        const uniforms = simulation.update(delta, {
          sensorsRaw: settings.sensors,
          biome: settings.biome,
          accessibility: settings.accessibility,
          cycleIndex,
        });
        const snapshot = simulation.getSnapshot();
        if (snapshot) {
          pushSnapshot(snapshot);
        }
        renderer.render(uniforms);
        rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    };

    const handleResize = (renderer: IRenderer) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(rect.width, rect.height, dpr);
    };

    const init = async () => {
      stopLoop();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setError(null);

      let selection = await selectRenderer(preference);
      let renderer = selection.renderer;
      let actualBackend: BackendLabel =
        selection.backend === "webgpu" ? "WebGPU" : "WebGL2";
      let fallbackWarning = selection.warning ?? null;

      try {
        await renderer.init(canvas, resourcesRef.current);
      } catch (err) {
        if (selection.backend !== "webgl2") {
          selection = await selectRenderer("webgl2");
          renderer = selection.renderer;
          actualBackend = "WebGL2";
          fallbackWarning =
            fallbackWarning ?? "WebGPU init failed. Falling back to WebGL2.";
          await renderer.init(canvas, resourcesRef.current);
        } else {
          setError("WebGL2 init failed.");
          return;
        }
      }

      if (cancelled) {
        renderer.dispose();
        return;
      }

      rendererRef.current = renderer;
      setBackend(actualBackend);
      setWarning(fallbackWarning);
      backendInfoRef.current = {
        backend: actualBackend,
        warning: fallbackWarning,
      };
      setBackendInfo(backendInfoRef.current);
      handleResize(renderer);
      const resizeHandler = () => handleResize(renderer);
      window.addEventListener("resize", resizeHandler);
      startLoop(renderer);

      return () => {
        window.removeEventListener("resize", resizeHandler);
      };
    };

    let cleanupResize: (() => void) | null = null;
    void init().then((cleanup) => {
      cleanupResize = cleanup ?? null;
    });

    return () => {
      cancelled = true;
      stopLoop();
      cleanupResize?.();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [preference]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Membrane simulation canvas"
      />
      <div className="pointer-events-none absolute left-4 top-4 flex max-w-xs flex-col gap-2 rounded-2xl bg-white/85 px-4 py-3 text-xs text-zinc-900 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
            Backend
          </span>
          <span className="text-xs font-semibold">{backend}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
            Renderer
          </span>
          <div className="pointer-events-auto">
            <select
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
              value={preference}
              onChange={(event) =>
                setPreference(event.target.value as BackendPreference)
              }
              aria-label="Renderer preference"
            >
              {(
                Object.keys(preferenceLabels) as BackendPreference[]
              ).map((option) => (
                <option key={option} value={option}>
                  {preferenceLabels[option]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {warning ? (
          <div className="text-[11px] text-amber-700">{warning}</div>
        ) : null}
        {error ? (
          <div className="text-[11px] text-red-700">{error}</div>
        ) : null}
      </div>
    </div>
  );
}
