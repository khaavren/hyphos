import type { Uniforms } from "../renderers/IRenderer";
import type {
  Accessibility,
  Biome,
  ChannelsABST,
  PlantWeightEntry,
  PlantWeights,
  SensorKey,
  Sensors,
  SimulationSnapshot,
  StateMachineSnapshot,
} from "../graph/valueBridge";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const clamp01 = (value: number) => clamp(value, 0, 1);

const createStateTimers = () => ({
  stressHold: 0,
  collapseHold: 0,
  recoverHold: 0,
  extinctionHold: 0,
  rebirthHold: 0,
});

const sensorKeys: SensorKey[] = [
  "light",
  "tempStress",
  "precipitation",
  "wind",
  "stormProb",
  "humidity",
  "greenExposureProxy",
  "mobility",
  "nightTime",
  "networkDensity",
  "encounterRate",
  "eventCrowdProxy",
  "batteryStress",
  "attentionFrag",
  "lowTouchRate",
  "automationUsage",
  "predictiveHabits",
];

const biomeTuning: Record<
  Biome,
  {
    tempShift: number;
    greenBias: number;
    blueBias: number;
    saturation: number;
    roughness: number;
    subsurface: number;
  }
> = {
  temperate: {
    tempShift: 0.0,
    greenBias: 0.02,
    blueBias: -0.01,
    saturation: 0.04,
    roughness: 0.0,
    subsurface: 0.0,
  },
  boreal: {
    tempShift: -0.015,
    greenBias: 0.0,
    blueBias: 0.04,
    saturation: -0.02,
    roughness: 0.05,
    subsurface: 0.05,
  },
  arid: {
    tempShift: 0.045,
    greenBias: -0.02,
    blueBias: -0.03,
    saturation: 0.0,
    roughness: 0.08,
    subsurface: -0.05,
  },
  tropical: {
    tempShift: 0.02,
    greenBias: 0.05,
    blueBias: 0.01,
    saturation: 0.08,
    roughness: -0.04,
    subsurface: 0.08,
  },
  oceanic: {
    tempShift: -0.01,
    greenBias: 0.0,
    blueBias: 0.05,
    saturation: -0.01,
    roughness: 0.02,
    subsurface: 0.04,
  },
};

export type SimulationInput = {
  sensorsRaw: Sensors;
  biome: Biome;
  accessibility: Accessibility;
  cycleIndex: number;
};

export type SimulationInternalState = {
  time: number;
  fractureIntensity: number;
  fractureFrames: number;
  fractureSeed: number;
  nextFractureAt: number;
  smoothedSensors: Sensors | null;
  state: StateMachineSnapshot;
  uniforms: Uniforms;
  ema: {
    attackHalfLife: number;
    releaseHalfLife: number;
  };
};

export class Simulation {
  private time = 0;
  private fractureIntensity = 0;
  private fractureFrames = 0;
  private fractureSeed = 0.42;
  private nextFractureAt = 6;
  private smoothedSensors: Sensors | null = null;
  private state: StateMachineSnapshot = {
    state: "ALIVE",
    timeInState: 0,
    stress: 0,
    timers: createStateTimers(),
  };
  private base = {
    noiseAmp1: 0.85,
    noiseAmp2: 0.55,
    noiseAmp3: 0.35,
    pulseEnergy: 0.18,
    pulseWidth: 26,
    pulseSpeed: 0.24,
    fractureMagnitude: 1.2,
    chromaSplit: 0.6,
  };
  private ema = {
    attackHalfLife: 0.8,
    releaseHalfLife: 2.4,
  };
  private uniforms: Uniforms;
  private snapshot: SimulationSnapshot | null = null;
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.uniforms = {
      u_time: 0,
      u_timeScale: 1,
      u_circadianPhase: 0,
      u_noiseScale1: 1.6,
      u_noiseScale2: 3.2,
      u_noiseScale3: 7.8,
      u_noiseSpeed1: 0.035,
      u_noiseSpeed2: 0.06,
      u_noiseSpeed3: 0.11,
      u_noiseAmp1_px: this.base.noiseAmp1,
      u_noiseAmp2_px: this.base.noiseAmp2,
      u_noiseAmp3_px: this.base.noiseAmp3,
      u_stiffness: 0.65,
      u_normalStrength: 1.15,
      u_specular: 0.35,
      u_roughness: 0.48,
      u_subsurface: 0.5,
      u_wrap: 0.35,
      u_tempShift: 0.02,
      u_greenBias: 0.04,
      u_blueBias: -0.01,
      u_saturation: 1.05,
      u_contrast: 1.03,
      u_grainStrength: 0.03,
      u_grainScale: 220,
      u_grainDriftSpeed: 0.025,
      u_vitality: 0.78,
      u_veinDensity: 0.7,
      u_veinThickness_px: 1.6,
      u_veinContrast: 0.7,
      u_veinGrowth: 0.85,
      u_veinWander: 0.35,
      u_myceliumDensity: 0.55,
      u_myceliumThickness_px: 1.4,
      u_myceliumPulseHz: 0.2,
      u_myceliumSpread: 0.55,
      u_myceliumAnisotropy: 0.75,
      u_lichenCoverage: 0.4,
      u_lichenPatchScale: 1.25,
      u_lichenEdgeFeather_px: 2.2,
      u_lichenMatte: 0.55,
      u_pulseCount: 3,
      u_pulseSpeed: this.base.pulseSpeed,
      u_pulseWidth_px: this.base.pulseWidth,
      u_pulseEnergy: this.base.pulseEnergy,
      u_pulseInterference: 0.35,
      u_fractureOn: 0,
      u_fractureSeed: this.fractureSeed,
      u_fractureMagnitude_px: this.base.fractureMagnitude,
      u_chromaSplit_px: this.base.chromaSplit,
      u_healTime_s: 2.6,
    };
  }

  private updateSmoothedSensors(
    sensors: Sensors,
    deltaSeconds: number,
  ): Sensors {
    if (!this.smoothedSensors) {
      this.smoothedSensors = { ...sensors };
      return this.smoothedSensors;
    }
    const { attackHalfLife, releaseHalfLife } = this.ema;
    const updated = { ...this.smoothedSensors };
    sensorKeys.forEach((key) => {
      const current = updated[key];
      const target = sensors[key];
      const halfLife = target > current ? attackHalfLife : releaseHalfLife;
      const alpha = 1 - Math.exp(-deltaSeconds / Math.max(halfLife, 0.001));
      updated[key] = current + (target - current) * alpha;
    });

    this.smoothedSensors = updated;
    return updated;
  }

  private computeChannels(smoothed: Sensors): ChannelsABST {
    const A = clamp01(
      smoothed.light * 0.35 +
        smoothed.mobility * 0.2 +
        smoothed.encounterRate * 0.2 +
        smoothed.greenExposureProxy * 0.25 -
        smoothed.nightTime * 0.15,
    );
    const B = clamp01(
      smoothed.humidity * 0.32 +
        smoothed.precipitation * 0.28 +
        smoothed.greenExposureProxy * 0.2 +
        (1 - smoothed.tempStress) * 0.2,
    );
    const S = clamp01(
      smoothed.tempStress * 0.32 +
        smoothed.stormProb * 0.18 +
        smoothed.batteryStress * 0.2 +
        smoothed.attentionFrag * 0.18 +
        smoothed.lowTouchRate * 0.12,
    );
    const T = clamp01(
      smoothed.wind * 0.18 +
        smoothed.stormProb * 0.22 +
        smoothed.eventCrowdProxy * 0.2 +
        smoothed.networkDensity * 0.2 +
        smoothed.automationUsage * 0.1 +
        smoothed.predictiveHabits * 0.1,
    );

    return { A, B, S, T };
  }

  private updateStateMachine(stress: number, deltaSeconds: number) {
    const state = this.state;
    const timers = state.timers ?? (state.timers = createStateTimers());
    state.timeInState += deltaSeconds;
    state.stress = stress;

    if (stress > 0.7) {
      timers.stressHold += deltaSeconds;
    } else {
      timers.stressHold = 0;
    }

    if (stress > 0.85) {
      timers.collapseHold += deltaSeconds;
    } else {
      timers.collapseHold = 0;
    }

    if (stress < 0.45) {
      timers.recoverHold += deltaSeconds;
    } else {
      timers.recoverHold = 0;
    }

    if (stress > 0.92) {
      timers.extinctionHold += deltaSeconds;
    } else {
      timers.extinctionHold = 0;
    }

    if (stress < 0.35) {
      timers.rebirthHold += deltaSeconds;
    } else {
      timers.rebirthHold = 0;
    }

    const transition = (next: StateMachineSnapshot["state"]) => {
      if (state.state !== next) {
        state.state = next;
        state.timeInState = 0;
        timers.stressHold = 0;
        timers.collapseHold = 0;
        timers.recoverHold = 0;
        timers.extinctionHold = 0;
        timers.rebirthHold = 0;
      }
    };

    switch (state.state) {
      case "ALIVE":
        if (timers.stressHold > 2) {
          transition("STRESSED");
        }
        break;
      case "STRESSED":
        if (timers.collapseHold > 3) {
          transition("COLLAPSE");
        } else if (timers.recoverHold > 2.5) {
          transition("RECOVER");
        }
        break;
      case "COLLAPSE":
        if (timers.extinctionHold > 4) {
          transition("EXTINCTION");
        } else if (timers.recoverHold > 2) {
          transition("RECOVER");
        }
        break;
      case "RECOVER":
        if (timers.recoverHold > 2.5) {
          transition("ALIVE");
        } else if (timers.stressHold > 2) {
          transition("STRESSED");
        }
        break;
      case "EXTINCTION":
        if (timers.rebirthHold > 3) {
          transition("REBIRTH");
        }
        break;
      case "REBIRTH":
        if (timers.recoverHold > 2) {
          transition("ALIVE");
        }
        break;
    }
  }

  private computePlantWeights(
    smoothed: Sensors,
    channels: ChannelsABST,
  ): PlantWeights {
    return {
      veins: clamp01(
        channels.B * 0.5 +
          channels.A * 0.2 +
          (1 - channels.S) * 0.3,
      ),
      margins: clamp01(
        channels.A * 0.45 + channels.T * 0.35 + smoothed.wind * 0.2,
      ),
      chlorophyll: clamp01(
        channels.B * 0.45 +
          smoothed.greenExposureProxy * 0.35 +
          (1 - smoothed.tempStress) * 0.2,
      ),
      cellWalls: clamp01(
        channels.S * 0.5 + smoothed.stormProb * 0.3 + smoothed.wind * 0.2,
      ),
      moss: clamp01(
        smoothed.humidity * 0.4 +
          smoothed.precipitation * 0.3 +
          (1 - smoothed.mobility) * 0.3,
      ),
      roots: clamp01(
        smoothed.precipitation * 0.35 +
          channels.S * 0.3 +
          smoothed.lowTouchRate * 0.35,
      ),
      senescence: clamp01(
        channels.S * 0.45 +
          smoothed.batteryStress * 0.3 +
          smoothed.attentionFrag * 0.25,
      ),
    };
  }

  private clampTop3(weights: PlantWeights): PlantWeightEntry[] {
    const entries = (Object.keys(weights) as (keyof PlantWeights)[]).map(
      (name) => ({
        name,
        weight: weights[name],
        active: weights[name] > 0.12,
      }),
    );

    const sorted = entries
      .filter((entry) => entry.active)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);

    const sum = sorted.reduce((acc, entry) => acc + entry.weight, 0);
    if (sum > 0) {
      sorted.forEach((entry) => {
        entry.weight = entry.weight / sum;
      });
    }

    return entries.map((entry) => {
      const match = sorted.find((item) => item.name === entry.name);
      return match
        ? { ...match, active: true }
        : { ...entry, active: false, weight: 0 };
    });
  }

  private applyAccessibility(
    accessibility: Accessibility,
    base: {
      tempShift: number;
      greenBias: number;
      blueBias: number;
      saturation: number;
      contrast: number;
      pulseEnergy: number;
    },
  ) {
    if (!accessibility.colorAgnostic) {
      return base;
    }
    return {
      ...base,
      tempShift: 0,
      greenBias: 0,
      blueBias: 0,
      saturation: 0.82,
      contrast: 1.0,
      pulseEnergy: base.pulseEnergy * 0.85,
    };
  }

  update(deltaSeconds: number, input: SimulationInput): Uniforms {
    const safeDelta = Math.min(1, Math.max(0, deltaSeconds));
    this.time += safeDelta;

    const rawSensors = input.sensorsRaw;
    const smoothed = this.updateSmoothedSensors(rawSensors, safeDelta);
    const channels = this.computeChannels(smoothed);
    const stress = clamp01(channels.S * 0.6 + channels.T * 0.4);
    const prevState = this.state.state;
    this.updateStateMachine(stress, safeDelta);

    const plantWeights = this.computePlantWeights(smoothed, channels);
    const clampedTop3 = this.clampTop3(plantWeights);

    const reducedMotion = input.accessibility.reducedMotion;
    const photosafe = input.accessibility.photosensitivitySafe;
    const tuning = biomeTuning[input.biome];

    const maxDisplacement = reducedMotion ? 0.25 : 999;
    const pulseEnergyBase = reducedMotion ? 0.08 : this.base.pulseEnergy;
    const pulseWidth = reducedMotion ? 42 : this.base.pulseWidth;
    const pulseSpeed = reducedMotion ? 0.12 : this.base.pulseSpeed;
    let fractureMagnitude = reducedMotion ? 0.1 : this.base.fractureMagnitude;
    let chromaSplit = reducedMotion ? 0.1 : this.base.chromaSplit;
    if (photosafe) {
      fractureMagnitude *= 0.4;
      chromaSplit *= 0.4;
    }

    let tempShift =
      0.02 +
      tuning.tempShift +
      (smoothed.tempStress - 0.5) * 0.05 +
      (channels.T - 0.5) * 0.02;
    let greenBias =
      0.04 +
      tuning.greenBias +
      (smoothed.greenExposureProxy - 0.5) * 0.04;
    let blueBias =
      -0.01 + tuning.blueBias + (smoothed.humidity - 0.5) * 0.03;
    let saturation =
      1.05 +
      tuning.saturation +
      (channels.B - 0.5) * 0.2 -
      stress * 0.08;
    let contrast = 1.03 + (stress - 0.5) * 0.1;

    const accessible = this.applyAccessibility(input.accessibility, {
      tempShift,
      greenBias,
      blueBias,
      saturation,
      contrast,
      pulseEnergy: pulseEnergyBase,
    });

    tempShift = accessible.tempShift;
    greenBias = accessible.greenBias;
    blueBias = accessible.blueBias;
    saturation = accessible.saturation;
    contrast = accessible.contrast;

    let pulseEnergy =
      accessible.pulseEnergy * (0.6 + channels.A * 0.7 + channels.T * 0.2);
    if (photosafe) {
      pulseEnergy *= 0.6;
    }

    const pulseCount = clamp(
      Math.round(1 + channels.A * 2 + channels.T * 1.5),
      1,
      4,
    );

    const clampWeight = (name: keyof PlantWeights) =>
      clampedTop3.find((entry) => entry.name === name)?.weight ?? 0;

    const veins = clampWeight("veins");
    const moss = clampWeight("moss");
    const roots = clampWeight("roots");
    const cellWalls = clampWeight("cellWalls");
    const chlorophyll = clampWeight("chlorophyll");
    const senescence = clampWeight("senescence");

    const vitality = clamp(
      0.5 + channels.A * 0.3 + channels.B * 0.2 - stress * 0.25,
      0.2,
      1.0,
    );

    this.uniforms.u_time = this.time;
    this.uniforms.u_timeScale = 0.85 + channels.A * 0.4;
    if (reducedMotion) {
      this.uniforms.u_timeScale *= 0.6;
    }
    this.uniforms.u_circadianPhase = (this.time / 80) % 1;
    this.uniforms.u_noiseAmp1_px = clamp(
      this.base.noiseAmp1 * (0.8 + channels.A * 0.4),
      0,
      maxDisplacement,
    );
    this.uniforms.u_noiseAmp2_px = clamp(
      this.base.noiseAmp2 * (0.85 + channels.B * 0.4),
      0,
      maxDisplacement,
    );
    this.uniforms.u_noiseAmp3_px = clamp(
      this.base.noiseAmp3 * (0.8 + channels.A * 0.3),
      0,
      maxDisplacement,
    );
    this.uniforms.u_stiffness = clamp(0.45 + stress * 0.45, 0.3, 0.95);
    this.uniforms.u_normalStrength = 1.0 + channels.A * 0.4;
    this.uniforms.u_specular = clamp(0.2 + channels.B * 0.5, 0.15, 0.8);
    this.uniforms.u_roughness = clamp(
      0.38 + tuning.roughness + stress * 0.25 - channels.B * 0.2,
      0.2,
      0.9,
    );
    this.uniforms.u_subsurface = clamp(
      0.35 +
        tuning.subsurface +
        chlorophyll * 0.3 +
        channels.B * 0.2,
      0.25,
      0.9,
    );
    this.uniforms.u_wrap = clamp(0.25 + channels.A * 0.3, 0.1, 0.6);
    this.uniforms.u_tempShift = tempShift;
    this.uniforms.u_greenBias = greenBias;
    this.uniforms.u_blueBias = blueBias;
    this.uniforms.u_saturation = clamp(saturation, 0.7, 1.3);
    this.uniforms.u_contrast = clamp(contrast, 0.9, 1.2);
    this.uniforms.u_grainStrength = clamp(
      0.02 + smoothed.attentionFrag * 0.05,
      0.01,
      photosafe ? 0.04 : 0.06,
    );
    this.uniforms.u_grainScale = 200 + smoothed.networkDensity * 90;
    this.uniforms.u_grainDriftSpeed =
      0.02 + smoothed.mobility * 0.03 + smoothed.automationUsage * 0.01;
    this.uniforms.u_vitality = vitality;

    this.uniforms.u_veinDensity = clamp(0.45 + veins * 0.8, 0.3, 1.2);
    this.uniforms.u_veinThickness_px = 1.2 + veins * 1.2;
    this.uniforms.u_veinContrast = clamp(0.5 + veins * 0.6, 0.35, 1.0);
    this.uniforms.u_veinGrowth = veins;
    this.uniforms.u_veinWander = clamp(0.2 + channels.A * 0.4, 0.15, 0.6);
    this.uniforms.u_myceliumDensity = clamp(0.35 + roots * 0.8, 0.2, 1.0);
    this.uniforms.u_myceliumThickness_px = 1.0 + roots * 1.4;
    this.uniforms.u_myceliumPulseHz = 0.1 + channels.A * 0.3;
    this.uniforms.u_myceliumSpread = clamp(0.35 + roots * 0.6, 0.2, 0.9);
    this.uniforms.u_myceliumAnisotropy = clamp(
      0.55 + cellWalls * 0.4,
      0.3,
      0.95,
    );
    this.uniforms.u_lichenCoverage = clamp(0.2 + moss * 0.8, 0.1, 0.9);
    this.uniforms.u_lichenPatchScale = clamp(1.0 + moss * 0.6, 0.8, 1.8);
    this.uniforms.u_lichenEdgeFeather_px = 1.8 + moss * 2.4;
    this.uniforms.u_lichenMatte = clamp(0.4 + moss * 0.5, 0.3, 0.85);

    this.uniforms.u_pulseCount = pulseCount;
    this.uniforms.u_pulseSpeed = pulseSpeed * (0.8 + channels.A * 0.5);
    this.uniforms.u_pulseWidth_px = pulseWidth + senescence * 12;
    this.uniforms.u_pulseEnergy = clamp(pulseEnergy, 0.04, 0.28);
    this.uniforms.u_pulseInterference = clamp(
      0.25 + smoothed.predictiveHabits * 0.5,
      0.2,
      0.8,
    );

    let macroMutationFired = false;
    const fractureInterval = 8 - stress * 4 + (photosafe ? 2 : 0);
    if (this.time > this.nextFractureAt) {
      this.fractureFrames = 2;
      this.fractureIntensity = 1;
      this.fractureSeed = this.random();
      this.nextFractureAt =
        this.time + Math.max(4, fractureInterval) + this.random() * 6;
      macroMutationFired = true;
    }

    if (this.fractureFrames > 0) {
      this.fractureFrames -= 1;
      this.fractureIntensity = 1;
    } else {
      const healRate = safeDelta / this.uniforms.u_healTime_s;
      const maxIntensity = photosafe ? 0.15 : 0.25;
      this.fractureIntensity = Math.min(this.fractureIntensity, maxIntensity);
      this.fractureIntensity = Math.max(0, this.fractureIntensity - healRate);
    }

    this.uniforms.u_fractureOn = this.fractureIntensity;
    this.uniforms.u_fractureSeed = this.fractureSeed;
    this.uniforms.u_fractureMagnitude_px =
      fractureMagnitude * (0.5 + stress * 0.6);
    this.uniforms.u_chromaSplit_px = chromaSplit * (0.4 + stress * 0.6);

    const collapse =
      prevState !== this.state.state && this.state.state === "COLLAPSE";
    const extinction =
      prevState !== this.state.state && this.state.state === "EXTINCTION";

    const timers = this.state.timers ?? createStateTimers();
    this.snapshot = {
      t: this.time,
      cycleIndex: input.cycleIndex,
      sensorsRaw: rawSensors,
      sensorsSmoothed: smoothed,
      channelsABST: channels,
      stateMachine: { ...this.state, timers: { ...timers } },
      plantWeightsRaw: plantWeights,
      plantWeightsClampedTop3: clampedTop3,
      uniforms: { ...this.uniforms },
      events: {
        macroMutationFired,
        collapse: collapse || undefined,
        extinction: extinction || undefined,
      },
      ema: { ...this.ema },
    };

    return this.uniforms;
  }

  getSnapshot() {
    return this.snapshot;
  }

  getState(): SimulationInternalState {
    const timers = this.state.timers ?? createStateTimers();
    return {
      time: this.time,
      fractureIntensity: this.fractureIntensity,
      fractureFrames: this.fractureFrames,
      fractureSeed: this.fractureSeed,
      nextFractureAt: this.nextFractureAt,
      smoothedSensors: this.smoothedSensors ? { ...this.smoothedSensors } : null,
      state: { ...this.state, timers: { ...timers } },
      uniforms: { ...this.uniforms },
      ema: { ...this.ema },
    };
  }

  setState(state: SimulationInternalState) {
    this.time = state.time;
    this.fractureIntensity = state.fractureIntensity;
    this.fractureFrames = state.fractureFrames;
    this.fractureSeed = state.fractureSeed;
    this.nextFractureAt = state.nextFractureAt;
    this.smoothedSensors = state.smoothedSensors
      ? { ...state.smoothedSensors }
      : null;
    this.state = {
      ...state.state,
      timers: { ...(state.state.timers ?? createStateTimers()) },
    };
    this.uniforms = { ...state.uniforms };
    this.ema = { ...state.ema };
    this.snapshot = null;
  }
}
