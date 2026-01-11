import {
  defaultSensors,
  getModelSettings,
  pushSnapshot,
  type Accessibility,
  type Biome,
  type SensorKey,
  type Sensors,
  type SimulationSnapshot,
} from "../graph/valueBridge";
import {
  Simulation,
  type SimulationInput,
  type SimulationInternalState,
} from "./Simulation";
import { getScenarioById, type ScenarioId } from "./scenarios";

export type RunnerStatus = "running" | "paused";

export type RunnerState = {
  status: RunnerStatus;
  cycleIndex: number;
  totalCycles: number;
  cyclesRemaining: number | null;
  dtMs: number;
  speed: number;
  seed: string;
  scenarioId: ScenarioId;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const hashSeed = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

type SeededRng = {
  next: () => number;
  getState: () => number;
  setState: (state: number) => void;
};

const createRng = (seed: number): SeededRng => {
  let t = seed >>> 0;
  return {
    next: () => {
      t += 0x6d2b79f5;
      let r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => t,
    setState: (state: number) => {
      t = state >>> 0;
    },
  };
};

type ScrubCheckpoint = {
  cycle: number;
  simState: SimulationInternalState;
  simRngState: number;
  scenarioRngState: number;
  snapshot: SimulationSnapshot;
};

type ScrubSession = {
  key: string;
  seed: string;
  scenarioId: ScenarioId;
  dtMs: number;
  biome: Biome;
  accessibility: Accessibility;
  simulation: Simulation;
  simRng: SeededRng;
  scenarioRng: SeededRng;
  checkpoints: Map<number, ScrubCheckpoint>;
};

const sensorKeys = Object.keys(defaultSensors) as SensorKey[];

export class SimulationRunner {
  private simulation: Simulation;
  private simRng: SeededRng;
  private scenarioRng: SeededRng;
  private history: SimulationSnapshot[] = [];
  private rafId: number | null = null;
  private lastFrame = 0;
  private accumulatorMs = 0;
  private maxHistory = 2000;
  private scrubSessions = new Map<string, ScrubSession>();
  private checkpointInterval = 500;
  private state: RunnerState = {
    status: "paused",
    cycleIndex: 0,
    totalCycles: 600,
    cyclesRemaining: 0,
    dtMs: 100,
    speed: 1,
    seed: "symbiosis-001",
    scenarioId: "forest-day",
  };

  constructor() {
    this.simRng = createRng(1);
    this.scenarioRng = createRng(2);
    this.simulation = new Simulation(this.simRng.next);
    this.resetSimulation();
  }

  getState(): RunnerState {
    return { ...this.state };
  }

  getHistory() {
    return this.history;
  }

  getLatestSnapshot() {
    return this.history[this.history.length - 1] ?? null;
  }

  setTotalCycles(count: number) {
    this.state.totalCycles = Math.max(0, Math.round(count));
    if (this.state.cyclesRemaining !== null) {
      this.state.cyclesRemaining = Math.min(
        this.state.cyclesRemaining,
        this.state.totalCycles,
      );
    }
  }

  setDtMs(dtMs: number) {
    this.state.dtMs = clamp(Math.round(dtMs), 16, 1000);
  }

  setSpeed(multiplier: number) {
    this.state.speed = clamp(multiplier, 1, 40);
  }

  setSeed(seed: string) {
    this.state.seed = seed.trim() || "symbiosis-001";
    this.resetSimulation();
  }

  setScenario(scenarioId: ScenarioId) {
    this.state.scenarioId = scenarioId;
    this.resetSimulation();
  }

  run() {
    if (this.state.status === "running") {
      return;
    }
    if (this.state.cyclesRemaining === 0 || this.state.cyclesRemaining === null) {
      this.state.cyclesRemaining =
        this.state.totalCycles > 0 ? this.state.totalCycles : null;
    }
    this.state.status = "running";
    this.lastFrame = 0;
    this.accumulatorMs = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  runContinuous() {
    this.state.cyclesRemaining = null;
    this.state.status = "running";
    this.lastFrame = 0;
    this.accumulatorMs = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause() {
    if (this.state.status === "paused") {
      return;
    }
    this.state.status = "paused";
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastFrame = 0;
    this.accumulatorMs = 0;
  }

  step() {
    if (this.state.status === "running") {
      this.pause();
    }
    this.stepOnce();
  }

  reset() {
    this.pause();
    this.resetSimulation();
  }

  private resetSimulation() {
    const seed = hashSeed(this.state.seed);
    this.simRng = createRng(seed ^ 0x9e3779b9);
    this.scenarioRng = createRng(seed ^ 0x85ebca6b);
    this.simulation = new Simulation(this.simRng.next);
    this.state.cycleIndex = 0;
    this.state.cyclesRemaining = 0;
    this.history = [];
    this.primeSnapshot();
  }

  private primeSnapshot() {
    const settings = getModelSettings();
    const input = this.buildInput(0, settings);
    this.simulation.update(0, input);
    const snapshot = this.simulation.getSnapshot();
    if (snapshot) {
      this.pushSnapshot(snapshot);
    }
  }

  private buildInput(cycleIndex: number, settings: ReturnType<typeof getModelSettings>) {
    const t = (cycleIndex * this.state.dtMs) / 1000;
    const scenario = getScenarioById(this.state.scenarioId);
    const generated = scenario.generate({
      t,
      cycleIndex,
      rng: this.scenarioRng.next,
      baseSensors: defaultSensors,
    });
    const sensorsRaw = this.applyOverrides(generated, settings);
    const input: SimulationInput = {
      sensorsRaw,
      biome: settings.biome,
      accessibility: settings.accessibility,
      cycleIndex,
    };
    return input;
  }

  private applyOverrides(generated: Sensors, settings: ReturnType<typeof getModelSettings>) {
    const sensorsRaw = { ...generated };
    sensorKeys.forEach((key) => {
      if (settings.sensorOverrideMask[key]) {
        sensorsRaw[key] = settings.sensors[key];
      }
    });
    return sensorsRaw;
  }

  private stepOnce() {
    const settings = getModelSettings();
    const nextIndex = this.state.cycleIndex + 1;
    const input = this.buildInput(nextIndex, settings);
    const deltaSeconds = this.state.dtMs / 1000;
    this.simulation.update(deltaSeconds, input);
    const snapshot = this.simulation.getSnapshot();
    if (snapshot) {
      this.pushSnapshot(snapshot);
    }
    this.state.cycleIndex = nextIndex;
    if (this.state.cyclesRemaining !== null && this.state.cyclesRemaining > 0) {
      this.state.cyclesRemaining = Math.max(0, this.state.cyclesRemaining - 1);
    }
  }

  private pushSnapshot(snapshot: SimulationSnapshot) {
    pushSnapshot(snapshot);
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
  }

  private tick = (now: number) => {
    if (this.state.status !== "running") {
      return;
    }
    if (!this.lastFrame) {
      this.lastFrame = now;
    }
    const elapsed = now - this.lastFrame;
    this.lastFrame = now;
    this.accumulatorMs += elapsed;
    const stepMs = this.state.dtMs / Math.max(1, this.state.speed);
    const maxSteps = 240;
    let steps = 0;
    while (this.accumulatorMs >= stepMs && steps < maxSteps) {
      if (this.state.cyclesRemaining !== null && this.state.cyclesRemaining <= 0) {
        this.pause();
        return;
      }
      this.stepOnce();
      this.accumulatorMs -= stepMs;
      steps += 1;
    }
    if (this.state.cyclesRemaining !== null && this.state.cyclesRemaining <= 0) {
      this.pause();
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  async getSnapshotAtCycle(
    targetCycle: number,
    options?: {
      seed?: string;
      scenarioId?: ScenarioId;
      dtMs?: number;
      biome?: Biome;
      accessibility?: Accessibility;
      signal?: AbortSignal;
      onProgress?: (snapshot: SimulationSnapshot) => void;
    },
  ): Promise<SimulationSnapshot> {
    const settings = getModelSettings();
    const seed = options?.seed ?? this.state.seed;
    const scenarioId = options?.scenarioId ?? this.state.scenarioId;
    const dtMs = options?.dtMs ?? this.state.dtMs;
    const biome = options?.biome ?? settings.biome;
    const accessibility = options?.accessibility ?? settings.accessibility;
    const clampedCycle = Math.max(0, Math.round(targetCycle));
    const session = this.getScrubSession({
      seed,
      scenarioId,
      dtMs,
      biome,
      accessibility,
    });

    const checkpoint = this.findNearestCheckpoint(session, clampedCycle);
    this.restoreCheckpoint(session, checkpoint);

    if (checkpoint.cycle === clampedCycle) {
      return checkpoint.snapshot;
    }

    const stepTarget = clampedCycle;
    let currentCycle = checkpoint.cycle;
    let lastSnapshot = checkpoint.snapshot;
    const stepSeconds = dtMs / 1000;
    const maxStepsPerChunk = 200;

    const shouldYield = () =>
      typeof window !== "undefined" && typeof requestAnimationFrame === "function";
    const nextFrame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

    while (currentCycle < stepTarget) {
      if (options?.signal?.aborted) {
        throw new Error("aborted");
      }
      const chunkEnd = Math.min(stepTarget, currentCycle + maxStepsPerChunk);
      for (let cycle = currentCycle + 1; cycle <= chunkEnd; cycle += 1) {
        const input = this.buildInputForSession(
          session,
          cycle,
          dtMs,
          biome,
          accessibility,
        );
        session.simulation.update(stepSeconds, input);
        const snapshot = session.simulation.getSnapshot();
        if (snapshot) {
          lastSnapshot = snapshot;
        }
        if (cycle % this.checkpointInterval === 0 && snapshot) {
          this.saveCheckpoint(session, cycle, snapshot);
        }
      }
      currentCycle = chunkEnd;
      if (lastSnapshot) {
        options?.onProgress?.(lastSnapshot);
      }
      if (currentCycle < stepTarget && shouldYield()) {
        await nextFrame();
      }
    }

    if (!lastSnapshot) {
      throw new Error("Snapshot unavailable.");
    }

    if (currentCycle % this.checkpointInterval === 0) {
      this.saveCheckpoint(session, currentCycle, lastSnapshot);
    }

    return lastSnapshot;
  }

  private getScrubSession(config: {
    seed: string;
    scenarioId: ScenarioId;
    dtMs: number;
    biome: Biome;
    accessibility: Accessibility;
  }) {
    const key = [
      config.seed,
      config.scenarioId,
      config.dtMs,
      config.biome,
      config.accessibility.reducedMotion ? "rm" : "nom",
      config.accessibility.colorAgnostic ? "ca" : "col",
      config.accessibility.photosensitivitySafe ? "ps" : "np",
    ].join("|");

    const existing = this.scrubSessions.get(key);
    if (existing) {
      return existing;
    }

    const seedHash = hashSeed(config.seed);
    const simRng = createRng(seedHash ^ 0x9e3779b9);
    const scenarioRng = createRng(seedHash ^ 0x85ebca6b);
    const simulation = new Simulation(simRng.next);

    const session: ScrubSession = {
      key,
      seed: config.seed,
      scenarioId: config.scenarioId,
      dtMs: config.dtMs,
      biome: config.biome,
      accessibility: config.accessibility,
      simulation,
      simRng,
      scenarioRng,
      checkpoints: new Map(),
    };

    const input = this.buildInputForSession(
      session,
      0,
      config.dtMs,
      config.biome,
      config.accessibility,
    );
    simulation.update(0, input);
    const snapshot = simulation.getSnapshot();
    if (snapshot) {
      this.saveCheckpoint(session, 0, snapshot);
    }

    this.scrubSessions.set(key, session);
    return session;
  }

  private buildInputForSession(
    session: ScrubSession,
    cycleIndex: number,
    dtMs: number,
    biome: Biome,
    accessibility: Accessibility,
  ): SimulationInput {
    const t = (cycleIndex * dtMs) / 1000;
    const scenario = getScenarioById(session.scenarioId);
    const generated = scenario.generate({
      t,
      cycleIndex,
      rng: session.scenarioRng.next,
      baseSensors: defaultSensors,
    });
    const settings = getModelSettings();
    const sensorsRaw = this.applyOverrides(generated, settings);
    return {
      sensorsRaw,
      biome,
      accessibility,
      cycleIndex,
    };
  }

  private saveCheckpoint(
    session: ScrubSession,
    cycle: number,
    snapshot: SimulationSnapshot,
  ) {
    session.checkpoints.set(cycle, {
      cycle,
      snapshot,
      simState: session.simulation.getState(),
      simRngState: session.simRng.getState(),
      scenarioRngState: session.scenarioRng.getState(),
    });
  }

  private findNearestCheckpoint(session: ScrubSession, target: number) {
    let nearest = session.checkpoints.get(0);
    session.checkpoints.forEach((checkpoint) => {
      if (checkpoint.cycle <= target) {
        if (!nearest || checkpoint.cycle > nearest.cycle) {
          nearest = checkpoint;
        }
      }
    });
    if (!nearest) {
      throw new Error("Checkpoint missing.");
    }
    return nearest;
  }

  private restoreCheckpoint(session: ScrubSession, checkpoint: ScrubCheckpoint) {
    session.simRng.setState(checkpoint.simRngState);
    session.scenarioRng.setState(checkpoint.scenarioRngState);
    session.simulation.setState(checkpoint.simState);
  }
}

let runner: SimulationRunner | null = null;

export const getSimulationRunner = () => {
  if (!runner) {
    runner = new SimulationRunner();
  }
  return runner;
};
