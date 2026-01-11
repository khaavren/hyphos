"use client";

import type { ScenarioId } from "../lib/simulation/scenarios";
import { scenarios } from "../lib/simulation/scenarios";

type CycleScrubberProps = {
  cycle: number;
  maxCycle: number;
  seed: string;
  scenarioId: ScenarioId;
  onCycleChange: (cycle: number) => void;
  onMaxCycleChange: (maxCycle: number) => void;
  onSeedChange: (seed: string) => void;
  onScenarioChange: (scenarioId: ScenarioId) => void;
  onResetFounder: () => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function CycleScrubber({
  cycle,
  maxCycle,
  seed,
  scenarioId,
  onCycleChange,
  onMaxCycleChange,
  onSeedChange,
  onScenarioChange,
  onResetFounder,
}: CycleScrubberProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-4 text-xs shadow-lg backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        Cycle Scrubber
      </div>
      <div className="flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            Cycle
          </span>
          <input
            type="number"
            min={0}
            max={maxCycle}
            step={1}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            value={cycle}
            onChange={(event) =>
              onCycleChange(
                clamp(Number(event.target.value) || 0, 0, maxCycle),
              )
            }
          />
        </label>
        <label className="flex w-32 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            Max
          </span>
          <input
            type="number"
            min={0}
            max={20000}
            step={100}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            value={maxCycle}
            onChange={(event) =>
              onMaxCycleChange(
                clamp(Number(event.target.value) || 0, 0, 20000),
              )
            }
          />
        </label>
      </div>
      <input
        type="range"
        min={0}
        max={maxCycle}
        step={1}
        value={cycle}
        onChange={(event) => onCycleChange(Number(event.target.value))}
      />
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            Seed
          </span>
          <input
            type="number"
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            value={seed}
            onChange={(event) => onSeedChange(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            Scenario
          </span>
          <select
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            value={scenarioId}
            onChange={(event) =>
              onScenarioChange(event.target.value as ScenarioId)
            }
          >
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="rounded-full border border-zinc-200 px-3 py-1 text-[11px]"
        onClick={onResetFounder}
      >
        Reset to Founder
      </button>
    </div>
  );
}
