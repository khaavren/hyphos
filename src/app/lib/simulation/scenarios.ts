import type { Sensors } from "../graph/valueBridge";

export type ScenarioId =
  | "forest-day"
  | "storm-commute"
  | "low-light-indoor"
  | "heatwave-urban";

export type ScenarioContext = {
  t: number;
  cycleIndex: number;
  rng: () => number;
  baseSensors: Sensors;
};

export type ScenarioDefinition = {
  id: ScenarioId;
  label: string;
  description: string;
  generate: (context: ScenarioContext) => Sensors;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const wave = (t: number, speed: number, phase = 0) =>
  0.5 + 0.5 * Math.sin(t * speed + phase);

const pulse = (t: number, speed: number, phase = 0) =>
  Math.max(0, Math.sin(t * speed + phase));

export const scenarios: ScenarioDefinition[] = [
  {
    id: "forest-day",
    label: "Forest Day",
    description: "High canopy exposure, gentle wind, slow circadian shift.",
    generate: ({ t, rng, baseSensors }) => {
      const day = wave(t, 0.08);
      const breeze = wave(t, 0.42, 1.2);
      const mist = wave(t, 0.18, 2.4);
      const jitter = (rng() - 0.5) * 0.04;
      return {
        ...baseSensors,
        light: clamp01(0.55 + day * 0.35 + jitter),
        tempStress: clamp01(0.2 + day * 0.15),
        precipitation: clamp01(0.2 + (1 - day) * 0.25),
        wind: clamp01(0.12 + breeze * 0.12),
        stormProb: clamp01(0.05 + (1 - day) * 0.12),
        humidity: clamp01(0.55 + (1 - day) * 0.12 + mist * 0.05),
        greenExposureProxy: clamp01(0.65 + day * 0.25),
        mobility: clamp01(0.35 + day * 0.2),
        nightTime: clamp01(0.25 + (1 - day) * 0.5),
        networkDensity: clamp01(0.25 + wave(t, 0.15, 0.7) * 0.1),
        encounterRate: clamp01(0.48 + wave(t, 0.12, 1.5) * 0.1),
        eventCrowdProxy: clamp01(0.25 + wave(t, 0.2, 0.4) * 0.08),
        batteryStress: clamp01(0.25 + (1 - day) * 0.2),
        attentionFrag: clamp01(0.35 + mist * 0.15),
        lowTouchRate: clamp01(0.4 + (1 - day) * 0.2),
        automationUsage: clamp01(0.32 + wave(t, 0.11, 0.2) * 0.08),
        predictiveHabits: clamp01(0.35 + wave(t, 0.07, 2.2) * 0.1),
      };
    },
  },
  {
    id: "storm-commute",
    label: "Storm Commute",
    description: "Heavy wind/rain, network surges, high motion.",
    generate: ({ t, rng, baseSensors }) => {
      const squall = pulse(t, 0.9, 0.4);
      const commute = pulse(t, 0.6, 1.2);
      const jitter = (rng() - 0.5) * 0.08;
      return {
        ...baseSensors,
        light: clamp01(0.35 + (1 - squall) * 0.2),
        tempStress: clamp01(0.45 + squall * 0.2),
        precipitation: clamp01(0.65 + squall * 0.25 + jitter),
        wind: clamp01(0.7 + squall * 0.2 + jitter),
        stormProb: clamp01(0.7 + squall * 0.2),
        humidity: clamp01(0.75 + squall * 0.15),
        greenExposureProxy: clamp01(0.35 + (1 - squall) * 0.1),
        mobility: clamp01(0.7 + commute * 0.2),
        nightTime: clamp01(0.45 + (1 - commute) * 0.15),
        networkDensity: clamp01(0.75 + commute * 0.2),
        encounterRate: clamp01(0.6 + commute * 0.2),
        eventCrowdProxy: clamp01(0.6 + commute * 0.25),
        batteryStress: clamp01(0.55 + squall * 0.25),
        attentionFrag: clamp01(0.6 + squall * 0.2),
        lowTouchRate: clamp01(0.55 + squall * 0.2),
        automationUsage: clamp01(0.55 + commute * 0.15),
        predictiveHabits: clamp01(0.6 + commute * 0.15),
      };
    },
  },
  {
    id: "low-light-indoor",
    label: "Low-light Indoor",
    description: "Dim light, low mobility, higher lichen/moss bias.",
    generate: ({ t, rng, baseSensors }) => {
      const hum = wave(t, 0.08, 1.1);
      const jitter = (rng() - 0.5) * 0.03;
      return {
        ...baseSensors,
        light: clamp01(0.18 + hum * 0.08 + jitter),
        tempStress: clamp01(0.3 + hum * 0.1),
        precipitation: clamp01(0.1 + hum * 0.1),
        wind: clamp01(0.05 + hum * 0.05),
        stormProb: clamp01(0.1 + hum * 0.05),
        humidity: clamp01(0.65 + hum * 0.1),
        greenExposureProxy: clamp01(0.25 + hum * 0.1),
        mobility: clamp01(0.15 + hum * 0.05),
        nightTime: clamp01(0.65 + (1 - hum) * 0.15),
        networkDensity: clamp01(0.35 + hum * 0.1),
        encounterRate: clamp01(0.3 + hum * 0.08),
        eventCrowdProxy: clamp01(0.25 + hum * 0.05),
        batteryStress: clamp01(0.35 + (1 - hum) * 0.1),
        attentionFrag: clamp01(0.55 + hum * 0.15),
        lowTouchRate: clamp01(0.65 + hum * 0.1),
        automationUsage: clamp01(0.4 + hum * 0.1),
        predictiveHabits: clamp01(0.45 + hum * 0.1),
      };
    },
  },
  {
    id: "heatwave-urban",
    label: "Heatwave Urban",
    description: "High thermal stress, bright light, dense network pulses.",
    generate: ({ t, rng, baseSensors }) => {
      const flare = wave(t, 0.12, 0.8);
      const pulseNet = pulse(t, 0.7, 1.5);
      const jitter = (rng() - 0.5) * 0.05;
      return {
        ...baseSensors,
        light: clamp01(0.8 + flare * 0.15 + jitter),
        tempStress: clamp01(0.78 + flare * 0.15),
        precipitation: clamp01(0.05 + flare * 0.05),
        wind: clamp01(0.2 + flare * 0.1),
        stormProb: clamp01(0.1 + flare * 0.05),
        humidity: clamp01(0.35 + (1 - flare) * 0.1),
        greenExposureProxy: clamp01(0.35 + (1 - flare) * 0.1),
        mobility: clamp01(0.55 + flare * 0.15),
        nightTime: clamp01(0.35 + (1 - flare) * 0.2),
        networkDensity: clamp01(0.78 + pulseNet * 0.2),
        encounterRate: clamp01(0.55 + pulseNet * 0.15),
        eventCrowdProxy: clamp01(0.65 + pulseNet * 0.2),
        batteryStress: clamp01(0.6 + flare * 0.2),
        attentionFrag: clamp01(0.55 + flare * 0.15),
        lowTouchRate: clamp01(0.45 + flare * 0.1),
        automationUsage: clamp01(0.6 + pulseNet * 0.15),
        predictiveHabits: clamp01(0.6 + pulseNet * 0.1),
      };
    },
  },
];

export const getScenarioById = (id: ScenarioId) =>
  scenarios.find((scenario) => scenario.id === id) ?? scenarios[0];
