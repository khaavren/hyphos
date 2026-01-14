export type Trait = number; // 0..1

export interface Genome {
  // Structural
  symmetry: Trait;
  segmentation: Trait;
  rigidity: Trait;
  locomotionMode: Trait;
  limbCount: Trait;
  limbLength: Trait;
  bodySize: Trait;

  // Physiological
  metabolicRate: Trait;
  thermoregulation: Trait;
  waterRetention: Trait;
  respirationType: Trait;
  feedingStrategy: Trait;
  digestiveEfficiency: Trait;

  // Sensory / Behavioral
  lightSensitivity: Trait;
  chemicalSensitivity: Trait;
  proximityAwareness: Trait;
  aggression: Trait;
  sociality: Trait;
  reproductionStrategy: Trait;

  // Meta
  mutationRate: Trait;
}

export interface Environment {
  // Biome Properties
  temperature: number; // -1..1
  humidity: number; // 0..1
  wind: number; // 0..1
  sunlight: number; // 0..1

  // Context
  season: number; // 0..1 (cyclic)
  circadianPhase: number; // 0..1 (cyclic)

  // Dynamic
  travelRate: number; // from phone movement
  proximityDensity: number; // nearby players
  volatility: number; // how much things change
}

export type BodyPlan =
  | 'sessile_reef'
  | 'segmented_crawler'
  | 'arthropod_walker'
  | 'cephalopod_swimmer'
  | 'ovoid_generalist';

export type LocomotionType = 'sessile' | 'swim' | 'crawl' | 'walk' | 'glide' | 'fly' | 'burrow';
export type LimbType = 'fin' | 'leg' | 'wing' | 'tentacle' | 'cilia';

export type SkinType = 'soft' | 'slimy' | 'scaly' | 'plated';

export interface Phenotype {
  // Classification
  bodyPlan: BodyPlan;
  skinType: SkinType;

  // Dimensions
  axialScale: [number, number, number]; // x, y, z
  segmentCount: number;
  asymmetry: number;
  rigidity: number;

  // Appendages
  locomotion: LocomotionType;
  limbPairs: number;
  limbType: LimbType;
  limbLength: number;
  limbThickness: number;

  // Surface
  patchCoverage: number; // moss/lichen/algae
  veinVisibility: number;
  poreScale: number;
  wetSheen: number;
  roughness: number;
  armorPlates: number;

  // Animation / Vitality
  breathRate: number;
  breathAmplitude: number;
  gaitRate: number;
  motionIntensity: number;

  // Extras
  ornamentation: number;
  broodPouches: number;
}

export type BiomeType = "ocean" | "desert" | "forest" | "tundra" | "temperate";
