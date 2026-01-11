"use client";

import { useEffect, useMemo, useState } from "react";
import { SENSOR_KEYS, SENSOR_LABELS } from "../lib/graph/sensorMeta";
import {
  clearSensorOverrides,
  setSensorValue,
  subscribeToSnapshots,
  useModelSettings,
  type SimulationSnapshot,
} from "../lib/graph/valueBridge";
import { getSimulationRunner } from "../lib/simulation/SimulationRunner";
import { scenarios, type ScenarioId } from "../lib/simulation/scenarios";

const speedOptions = [1, 5, 20];

export default function SimulationControls() {
  const runner = useMemo(() => getSimulationRunner(), []);
  const settings = useModelSettings();
  const [runnerState, setRunnerState] = useState(() => runner.getState());
  const [seedInput, setSeedInput] = useState(runnerState.seed);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRunnerState(runner.getState());
    }, 1000 / 12);
    return () => window.clearInterval(interval);
  }, [runner]);

  useEffect(() => {
    setSeedInput(runnerState.seed);
  }, [runnerState.seed]);

  useEffect(() => {
    const unsubscribe = subscribeToSnapshots((snap) => {
      setSnapshot(snap);
    }, 12);
    return unsubscribe;
  }, []);

  const isRunning = runnerState.status === "running";
  const remainingLabel =
    runnerState.cyclesRemaining === null
      ? "∞"
      : runnerState.cyclesRemaining.toString();
  const progress =
    runnerState.cyclesRemaining === null || runnerState.totalCycles <= 0
      ? 0
      : (runnerState.totalCycles - runnerState.cyclesRemaining) /
        Math.max(1, runnerState.totalCycles);

  const applySeed = () => {
    runner.setSeed(seedInput);
    setRunnerState(runner.getState());
  };

  return (
    <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white/90 p-4 text-xs shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Simulation Controls
          </div>
          <div className="text-sm font-semibold text-zinc-900">
            Cycle {runnerState.cycleIndex}
          </div>
        </div>
        <div className="text-right text-[11px] text-zinc-500">
          <div>Remaining: {remainingLabel}</div>
          <div>
            Total:{" "}
            {runnerState.totalCycles > 0 ? runnerState.totalCycles : "∞"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold"
          onClick={() => (isRunning ? runner.pause() : runner.run())}
        >
          {isRunning ? "Pause" : "Run"}
        </button>
        <button
          type="button"
          className="rounded-full border border-zinc-200 px-3 py-1 text-[11px]"
          onClick={() => runner.pause()}
        >
          Stop
        </button>
        <button
          type="button"
          className="rounded-full border border-zinc-200 px-3 py-1 text-[11px]"
          onClick={() => {
            runner.reset();
            setRunnerState(runner.getState());
          }}
        >
          Reset
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Progress</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-zinc-900"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Cycles (N)
          </span>
          <input
            type="number"
            min={0}
            step={1}
            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs"
            value={runnerState.totalCycles}
            onChange={(event) =>
              runner.setTotalCycles(Number(event.target.value))
            }
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Cycle dt (ms)
          </span>
          <input
            type="number"
            min={16}
            step={10}
            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs"
            value={runnerState.dtMs}
            onChange={(event) => runner.setDtMs(Number(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Speed
          </span>
          <select
            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs"
            value={runnerState.speed}
            onChange={(event) => runner.setSpeed(Number(event.target.value))}
          >
            {speedOptions.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Scenario
          </span>
          <select
            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs"
            value={runnerState.scenarioId}
            onChange={(event) =>
              runner.setScenario(event.target.value as ScenarioId)
            }
          >
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Random Seed
          </span>
          <input
            type="text"
            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs"
            value={seedInput}
            onChange={(event) => setSeedInput(event.target.value)}
            onBlur={applySeed}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applySeed();
              }
            }}
          />
        </label>
      </div>

      <details className="rounded-2xl border border-zinc-200 bg-white/80 px-3 py-2">
        <summary className="flex cursor-pointer items-center justify-between text-[11px] font-semibold text-zinc-700">
          <span>Sensor Overrides</span>
          <button
            type="button"
            className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-normal text-zinc-500"
            onClick={(event) => {
              event.preventDefault();
              clearSensorOverrides();
            }}
          >
            Clear
          </button>
        </summary>
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
          {SENSOR_KEYS.map((key) => {
            const override = settings.sensorOverrideMask[key];
            const value = override
              ? settings.sensors[key]
              : snapshot?.sensorsRaw[key] ?? settings.sensors[key];
            return (
              <label key={key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span>
                    {SENSOR_LABELS[key]}
                    {override ? " *" : ""}
                  </span>
                  <span className="tabular-nums text-zinc-500">
                    {value.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={value}
                  onChange={(event) =>
                    setSensorValue(key, Number(event.target.value))
                  }
                />
              </label>
            );
          })}
          <div className="text-[10px] text-zinc-500">
            * overrides scenario values until cleared.
          </div>
        </div>
      </details>
    </div>
  );
}
