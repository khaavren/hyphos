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
  biome: BiomeType;
  biomePrev?: BiomeType;
  biomeDrift?: number;
  interactionRate?: number;
  history?: EnvironmentHistory;
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

export type EyePlacement = 'forward' | 'lateral' | 'stalk';

export type EnvironmentHistory = {
  biomeMix: Record<BiomeType, number>;
  avgTemp: number;
  avgVolatility: number;
  travelIntensity: number;
  interactionRate: number;
};

export interface Phenotype {
  // Classification
  bodyPlan: BodyPlan;
  skinType: SkinType;
  biome?: BiomeType;
  envHistory?: EnvironmentHistory;

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
  legPairs: number;
  finPairs: number;
  wingPairs: number;
  wingArea: number;
  tentaclePairs: number;
  tailLength: number;
  tailFinSize: number;

  // Surface
  patchCoverage: number; // moss/lichen/algae
  veinVisibility: number;
  poreScale: number;
  wetSheen: number;
  roughness: number;
  armorPlates: number;
  furAmount: number;
  slimeAmount: number;
  camouflageAmount: number;

  // Animation / Vitality
  breathRate: number;
  breathAmplitude: number;
  gaitRate: number;
  motionIntensity: number;

  // Extras
  ornamentation: number;
  broodPouches: number;
  eyesCount: number;
  eyesSize: number;
  eyeCount: number;
  eyeSize: number;
  eyesPlacement: EyePlacement;
  antennaeCount: number;
  whiskerCount: number;
  mouthPresence: number;
  senseVision: number;
  senseChemo: number;
  senseMechano: number;
  senseThermo: number;
  senseElectro: number;
  streamlining: number;
  bodyAspectRatio: number;
}

export type BiomeType =
  | "tropical_rainforest"
  | "tropical_seasonal_forest"
  | "savanna"
  | "desert_hot"
  | "temperate_grassland"
  | "temperate_deciduous_forest"
  | "temperate_rainforest"
  | "mediterranean_chaparral"
  | "boreal_taiga"
  | "tundra"
  | "polar_ice"
  | "mountain_alpine"
  | "freshwater_river"
  | "freshwater_lake_wetland"
  | "marine_coastal_intertidal"
  | "marine_coral_reef"
  | "marine_open_ocean"
  | "marine_deep_sea"
  | "estuary_mangrove"
  | "swamp_marsh"
  | "cave_subterranean"
  | "urban_anthropogenic"
  // keep legacy:
  | "ocean"
  | "desert"
  | "forest"
  | "tundra_legacy"
  | "temperate";
