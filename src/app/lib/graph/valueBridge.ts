import { useSyncExternalStore } from "react";
import type { Uniforms } from "../renderers/IRenderer";

export type Sensors = {
  light: number;
  tempStress: number;
  precipitation: number;
  wind: number;
  stormProb: number;
  humidity: number;
  greenExposureProxy: number;
  mobility: number;
  nightTime: number;
  networkDensity: number;
  encounterRate: number;
  eventCrowdProxy: number;
  batteryStress: number;
  attentionFrag: number;
  lowTouchRate: number;
  automationUsage: number;
  predictiveHabits: number;
};

export type SensorKey = keyof Sensors;

export type Accessibility = {
  reducedMotion: boolean;
  colorAgnostic: boolean;
  photosensitivitySafe: boolean;
};

export type Biome = "temperate" | "boreal" | "arid" | "tropical" | "oceanic";

export type ChannelsABST = {
  A: number;
  B: number;
  S: number;
  T: number;
};

export type StateName =
  | "ALIVE"
  | "STRESSED"
  | "COLLAPSE"
  | "RECOVER"
  | "EXTINCTION"
  | "REBIRTH";

export type StateMachineSnapshot = {
  state: StateName;
  timeInState: number;
  stress?: number;
  timers?: {
    stressHold: number;
    collapseHold: number;
    recoverHold: number;
    extinctionHold: number;
    rebirthHold: number;
  };
};

export type PlantWeights = {
  veins: number;
  margins: number;
  chlorophyll: number;
  cellWalls: number;
  moss: number;
  roots: number;
  senescence: number;
};

export type PlantWeightEntry = {
  name: keyof PlantWeights;
  weight: number;
  active: boolean;
};

export type SimulationSnapshot = {
  t: number;
  cycleIndex: number;
  sensorsRaw: Sensors;
  sensorsSmoothed: Sensors;
  channelsABST: ChannelsABST;
  stateMachine: StateMachineSnapshot;
  plantWeightsRaw: PlantWeights;
  plantWeightsClampedTop3: PlantWeightEntry[];
  uniforms: Uniforms;
  events: {
    macroMutationFired?: boolean;
    collapse?: boolean;
    extinction?: boolean;
  };
  ema?: {
    attackHalfLife: number;
    releaseHalfLife: number;
  };
};

export type BackendInfo = {
  backend: "WebGPU" | "WebGL2" | "Canvas2D" | "None";
  warning?: string | null;
};

export type ModelSettings = {
  biome: Biome;
  sensors: Sensors;
  sensorOverrideMask: Record<SensorKey, boolean>;
  accessibility: Accessibility;
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const defaultSensors: Sensors = {
  light: 0.62,
  tempStress: 0.28,
  precipitation: 0.45,
  wind: 0.35,
  stormProb: 0.2,
  humidity: 0.6,
  greenExposureProxy: 0.55,
  mobility: 0.4,
  nightTime: 0.3,
  networkDensity: 0.5,
  encounterRate: 0.52,
  eventCrowdProxy: 0.35,
  batteryStress: 0.32,
  attentionFrag: 0.45,
  lowTouchRate: 0.5,
  automationUsage: 0.4,
  predictiveHabits: 0.38,
};

const defaultOverrideMask = Object.fromEntries(
  Object.keys(defaultSensors).map((key) => [key, false]),
) as Record<SensorKey, boolean>;

let settings: ModelSettings = {
  biome: "temperate",
  sensors: defaultSensors,
  sensorOverrideMask: defaultOverrideMask,
  accessibility: {
    reducedMotion: false,
    colorAgnostic: false,
    photosensitivitySafe: true,
  },
};

const settingsListeners = new Set<() => void>();

const emitSettings = () => {
  settingsListeners.forEach((listener) => listener());
};

export const getModelSettings = () => settings;

export const subscribeSettings = (listener: () => void) => {
  settingsListeners.add(listener);
  return () => settingsListeners.delete(listener);
};

export const useModelSettings = () =>
  useSyncExternalStore(subscribeSettings, getModelSettings, getModelSettings);

export const setSensorValue = (key: SensorKey, value: number) => {
  settings = {
    ...settings,
    sensors: {
      ...settings.sensors,
      [key]: clamp(value),
    },
    sensorOverrideMask: {
      ...settings.sensorOverrideMask,
      [key]: true,
    },
  };
  emitSettings();
};

export const clearSensorOverrides = () => {
  settings = {
    ...settings,
    sensorOverrideMask: { ...defaultOverrideMask },
  };
  emitSettings();
};

export const setBiome = (biome: Biome) => {
  settings = {
    ...settings,
    biome,
  };
  emitSettings();
};

export const setAccessibility = (partial: Partial<Accessibility>) => {
  settings = {
    ...settings,
    accessibility: {
      ...settings.accessibility,
      ...partial,
    },
  };
  emitSettings();
};

let backendInfo: BackendInfo = {
  backend: "Canvas2D",
  warning: "GPU renderer inactive.",
};

const backendListeners = new Set<() => void>();

const emitBackend = () => {
  backendListeners.forEach((listener) => listener());
};

export const getBackendInfo = () => backendInfo;

export const subscribeBackendInfo = (listener: () => void) => {
  backendListeners.add(listener);
  return () => backendListeners.delete(listener);
};

export const useBackendInfo = () =>
  useSyncExternalStore(subscribeBackendInfo, getBackendInfo, getBackendInfo);

export const setBackendInfo = (info: BackendInfo) => {
  backendInfo = info;
  emitBackend();
};

let latestSnapshot: SimulationSnapshot | null = null;

export const pushSnapshot = (snapshot: SimulationSnapshot) => {
  latestSnapshot = snapshot;
};

export const getLatestSnapshot = () => latestSnapshot;

export const subscribeToSnapshots = (
  callback: (snapshot: SimulationSnapshot) => void,
  fps = 12,
) => {
  if (typeof window === "undefined") {
    return () => {};
  }
  const interval = window.setInterval(() => {
    if (!latestSnapshot) {
      return;
    }
    callback(latestSnapshot);
  }, 1000 / fps);

  return () => window.clearInterval(interval);
};
