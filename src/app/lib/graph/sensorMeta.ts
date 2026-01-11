import type { SensorKey } from "./valueBridge";

export const SENSOR_LABELS: Record<SensorKey, string> = {
  light: "Light",
  tempStress: "Temp Stress",
  precipitation: "Precipitation",
  wind: "Wind",
  stormProb: "Storm Prob",
  humidity: "Humidity",
  greenExposureProxy: "Green Exposure",
  mobility: "Mobility",
  nightTime: "Night Time",
  networkDensity: "Network Density",
  encounterRate: "Encounter Rate",
  eventCrowdProxy: "Event Crowd",
  batteryStress: "Battery Stress",
  attentionFrag: "Attention Frag",
  lowTouchRate: "Low Touch Rate",
  automationUsage: "Automation Usage",
  predictiveHabits: "Predictive Habits",
};

export const SENSOR_KEYS = Object.keys(SENSOR_LABELS) as SensorKey[];
