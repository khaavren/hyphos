"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SimulationSnapshot } from "../lib/graph/valueBridge";
import { useModelSettings } from "../lib/graph/valueBridge";
import { getSimulationRunner } from "../lib/simulation/SimulationRunner";
import type { ScenarioId } from "../lib/simulation/scenarios";
import CycleScrubber from "./CycleScrubber";
import Symbiote3DView from "./Symbiote3DView";

const DEFAULT_MAX_CYCLE = 20000;
const DEFAULT_SEED = "42";
const DEBOUNCE_MS = 80;
const COMPUTING_DELAY_MS = 120;

export default function SymbiotePanel() {
  const runner = useMemo(() => getSimulationRunner(), []);
  const settings = useModelSettings();
  const [cycle, setCycle] = useState(0);
  const [maxCycle, setMaxCycle] = useState(DEFAULT_MAX_CYCLE);
  const [seedInput, setSeedInput] = useState(DEFAULT_SEED);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(() => {
    return runner.getState().scenarioId;
  });
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const requestIdRef = useRef(0);

  const resolvedSeed = seedInput.trim() || DEFAULT_SEED;

  useEffect(() => {
    setCycle((prev) => Math.min(prev, maxCycle));
  }, [maxCycle]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const controller = new AbortController();
    const requestId = (requestIdRef.current += 1);
    let computingTimer: number | null = null;

    const debounceId = window.setTimeout(() => {
      computingTimer = window.setTimeout(() => {
        if (requestId === requestIdRef.current) {
          setIsComputing(true);
        }
      }, COMPUTING_DELAY_MS);

      runner
        .getSnapshotAtCycle(cycle, {
          seed: resolvedSeed,
          scenarioId,
          biome: settings.biome,
          accessibility: settings.accessibility,
          signal: controller.signal,
          onProgress: (snap) => {
            if (requestId === requestIdRef.current) {
              setSnapshot(snap);
            }
          },
        })
        .then((snap) => {
          if (requestId === requestIdRef.current) {
            setSnapshot(snap);
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.message === "aborted") {
            return;
          }
        })
        .finally(() => {
          if (computingTimer) {
            window.clearTimeout(computingTimer);
          }
          if (requestId === requestIdRef.current) {
            setIsComputing(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(debounceId);
      if (computingTimer) {
        window.clearTimeout(computingTimer);
      }
    };
  }, [
    cycle,
    resolvedSeed,
    scenarioId,
    settings.biome,
    settings.accessibility,
    settings.sensors,
    settings.sensorOverrideMask,
    runner,
  ]);

  const handleCycleChange = (value: number) => {
    const clamped = Math.min(Math.max(0, value), maxCycle);
    setCycle(clamped);
  };

  const handleMaxCycleChange = (value: number) => {
    const clamped = Math.min(Math.max(0, value), DEFAULT_MAX_CYCLE);
    setMaxCycle(clamped);
    setCycle((prev) => Math.min(prev, clamped));
  };

  const handleResetFounder = () => {
    setSeedInput(DEFAULT_SEED);
    setCycle(0);
  };

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="min-h-[240px] flex-1">
        <Symbiote3DView
          snapshot={snapshot}
          cycle={cycle}
          maxCycle={maxCycle}
          seed={resolvedSeed}
          reducedMotion={settings.accessibility.reducedMotion}
          colorAgnostic={settings.accessibility.colorAgnostic}
          isComputing={isComputing}
        />
      </div>
      <CycleScrubber
        cycle={cycle}
        maxCycle={maxCycle}
        seed={seedInput}
        scenarioId={scenarioId}
        onCycleChange={handleCycleChange}
        onMaxCycleChange={handleMaxCycleChange}
        onSeedChange={setSeedInput}
        onScenarioChange={setScenarioId}
        onResetFounder={handleResetFounder}
      />
    </div>
  );
}
