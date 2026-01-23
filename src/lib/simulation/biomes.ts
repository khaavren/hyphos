// src/lib/simulation/biomes.ts
import type { BiomeType, LimbType, LocomotionType, SkinType } from "./types";

/**
 * BiomeConstraints are SOFT pressures (bias/weights), not binary forbids.
 * - biases are generally in [-0.35, +0.35]
 * - weights are relative preferences (they don’t need to sum to 1; we normalize when sampling)
 */
export type BiomeConstraints = {
  id: BiomeType;
  label: string;

  // Core morphology pressures
  sizeBias: number; // + bigger, - smaller
  limbLengthBias: number; // + longer, - shorter
  limbPairsBias: number; // + more limbPairs, - fewer
  segmentationBias: number; // + more segmentation
  rigidityBias: number; // + more rigid / plated tendency
  waterRetentionBias: number; // + wetter skins, - drier skins

  // Surface/insulation/armor “looks”
  insulationBias: number; // + fur/insulation look (you’ll map this in renderer later)
  armorBias: number; // + plated/scaly probability
  ornamentBias: number; // + ornamentation/bright signals

  // Sensory investment pressures (you’ll map to phenotype later)
  sensoryBias: {
    vision: number;
    chemo: number;
    mechano: number;
    thermo: number;
  };

  // Relative preferences (soft)
  locomotionWeights: Record<LocomotionType, number>;
  limbTypeWeights: Record<LimbType, number>;
  skinWeights: Record<SkinType, number>;
};

const W = <T extends string>(weights: Record<T, number>) => weights;

// Common defaults so every biome is fully specified.
const DEFAULT_LOCOMOTION = W<LocomotionType>({
  sessile: 0.05,
  swim: 0.15,
  crawl: 0.25,
  walk: 0.25,
  glide: 0.12,
  fly: 0.10,
  burrow: 0.08,
});

const DEFAULT_LIMBTYPE = W<LimbType>({
  fin: 0.20,
  leg: 0.35,
  wing: 0.12,
  tentacle: 0.18,
  cilia: 0.15,
});

const DEFAULT_SKIN = W<SkinType>({
  soft: 0.30,
  slimy: 0.20,
  scaly: 0.25,
  plated: 0.25,
});

// Utility to merge partial weight overrides onto defaults.
function mergeWeights<T extends string>(
  base: Record<T, number>,
  override: Partial<Record<T, number>>,
): Record<T, number> {
  return { ...base, ...override };
}

function biome(
  id: BiomeType,
  label: string,
  partial: Omit<Partial<BiomeConstraints>, "id" | "label">,
): BiomeConstraints {
  return {
    id,
    label,

    sizeBias: partial.sizeBias ?? 0,
    limbLengthBias: partial.limbLengthBias ?? 0,
    limbPairsBias: partial.limbPairsBias ?? 0,
    segmentationBias: partial.segmentationBias ?? 0,
    rigidityBias: partial.rigidityBias ?? 0,
    waterRetentionBias: partial.waterRetentionBias ?? 0,

    insulationBias: partial.insulationBias ?? 0,
    armorBias: partial.armorBias ?? 0,
    ornamentBias: partial.ornamentBias ?? 0,

    sensoryBias: {
      vision: partial.sensoryBias?.vision ?? 0,
      chemo: partial.sensoryBias?.chemo ?? 0,
      mechano: partial.sensoryBias?.mechano ?? 0,
      thermo: partial.sensoryBias?.thermo ?? 0,
    },

    locomotionWeights: mergeWeights(DEFAULT_LOCOMOTION, partial.locomotionWeights ?? {}),
    limbTypeWeights: mergeWeights(DEFAULT_LIMBTYPE, partial.limbTypeWeights ?? {}),
    skinWeights: mergeWeights(DEFAULT_SKIN, partial.skinWeights ?? {}),
  };
}

/**
 * Canonical Earth biome set for this game (22).
 * These constraints are designed to create divergent phenotype attractors.
 */
export const BIOME_TABLE: Record<BiomeType, BiomeConstraints> = {
  // --- TERRESTRIAL ---
  tropical_rainforest: biome("tropical_rainforest", "Tropical Rainforest", {
    sizeBias: 0.05,
    limbLengthBias: 0.18,
    limbPairsBias: 0.10,
    segmentationBias: 0.05,
    rigidityBias: -0.05,
    waterRetentionBias: 0.18,
    insulationBias: -0.10,
    armorBias: -0.05,
    ornamentBias: 0.22,
    sensoryBias: { vision: 0.18, chemo: 0.05, mechano: 0.10, thermo: 0.00 },
    // Use glide/fly/crawl/walk mix to imply arboreal life.
    locomotionWeights: {
      walk: 0.20,
      crawl: 0.20,
      glide: 0.22,
      fly: 0.18,
      swim: 0.08,
      burrow: 0.06,
      sessile: 0.02,
    },
    limbTypeWeights: { leg: 0.30, wing: 0.18, tentacle: 0.22, fin: 0.10, cilia: 0.10 },
    skinWeights: { soft: 0.32, slimy: 0.26, scaly: 0.22, plated: 0.20 },
  }),

  tropical_seasonal_forest: biome("tropical_seasonal_forest", "Tropical Seasonal Forest", {
    sizeBias: 0.06,
    limbLengthBias: 0.12,
    limbPairsBias: 0.06,
    segmentationBias: 0.04,
    rigidityBias: 0.02,
    waterRetentionBias: 0.10,
    insulationBias: -0.06,
    armorBias: 0.04,
    ornamentBias: 0.14,
    sensoryBias: { vision: 0.12, chemo: 0.06, mechano: 0.06, thermo: 0.02 },
    locomotionWeights: { walk: 0.26, crawl: 0.20, glide: 0.16, fly: 0.12, burrow: 0.10, swim: 0.10, sessile: 0.02 },
    limbTypeWeights: { leg: 0.36, wing: 0.14, tentacle: 0.18, fin: 0.12, cilia: 0.10 },
    skinWeights: { soft: 0.30, slimy: 0.22, scaly: 0.26, plated: 0.22 },
  }),

  savanna: biome("savanna", "Savanna", {
    sizeBias: 0.10,
    limbLengthBias: 0.22,
    limbPairsBias: 0.04,
    segmentationBias: 0.02,
    rigidityBias: 0.06,
    waterRetentionBias: -0.08,
    insulationBias: -0.02,
    armorBias: 0.08,
    ornamentBias: 0.06,
    sensoryBias: { vision: 0.20, chemo: -0.02, mechano: 0.06, thermo: 0.06 },
    locomotionWeights: { walk: 0.36, crawl: 0.16, burrow: 0.14, glide: 0.08, fly: 0.06, swim: 0.06, sessile: 0.02 },
    limbTypeWeights: { leg: 0.46, wing: 0.10, tentacle: 0.12, fin: 0.12, cilia: 0.08 },
    skinWeights: { scaly: 0.30, plated: 0.30, soft: 0.22, slimy: 0.18 },
  }),

  desert_hot: biome("desert_hot", "Desert (Hot)", {
    sizeBias: -0.10,
    limbLengthBias: -0.12,
    limbPairsBias: -0.04,
    segmentationBias: 0.04,
    rigidityBias: 0.18,
    waterRetentionBias: -0.18,
    insulationBias: -0.08,
    armorBias: 0.18,
    ornamentBias: 0.02,
    sensoryBias: { vision: 0.06, chemo: 0.08, mechano: 0.10, thermo: 0.16 },
    locomotionWeights: { burrow: 0.26, crawl: 0.22, walk: 0.20, swim: 0.02, glide: 0.06, fly: 0.06, sessile: 0.02 },
    limbTypeWeights: { leg: 0.34, tentacle: 0.16, fin: 0.06, wing: 0.10, cilia: 0.10 },
    skinWeights: { plated: 0.36, scaly: 0.30, soft: 0.20, slimy: 0.14 },
  }),

  temperate_grassland: biome("temperate_grassland", "Temperate Grassland", {
    sizeBias: 0.06,
    limbLengthBias: 0.16,
    limbPairsBias: 0.02,
    segmentationBias: 0.02,
    rigidityBias: 0.06,
    waterRetentionBias: -0.04,
    insulationBias: 0.04,
    armorBias: 0.06,
    ornamentBias: 0.06,
    sensoryBias: { vision: 0.16, chemo: 0.00, mechano: 0.06, thermo: 0.06 },
    locomotionWeights: { walk: 0.34, crawl: 0.18, burrow: 0.16, glide: 0.08, fly: 0.08, swim: 0.06, sessile: 0.02 },
    limbTypeWeights: { leg: 0.44, wing: 0.12, fin: 0.10, tentacle: 0.12, cilia: 0.08 },
    skinWeights: { scaly: 0.28, plated: 0.24, soft: 0.26, slimy: 0.22 },
  }),

  temperate_deciduous_forest: biome("temperate_deciduous_forest", "Temperate Deciduous Forest", {
    sizeBias: 0.05,
    limbLengthBias: 0.10,
    limbPairsBias: 0.06,
    segmentationBias: 0.04,
    rigidityBias: 0.02,
    waterRetentionBias: 0.06,
    insulationBias: 0.08,
    armorBias: 0.02,
    ornamentBias: 0.10,
    sensoryBias: { vision: 0.12, chemo: 0.06, mechano: 0.08, thermo: 0.06 },
    locomotionWeights: { walk: 0.26, crawl: 0.20, glide: 0.16, fly: 0.12, burrow: 0.10, swim: 0.10, sessile: 0.02 },
    limbTypeWeights: { leg: 0.36, wing: 0.14, tentacle: 0.16, fin: 0.12, cilia: 0.10 },
    skinWeights: { soft: 0.30, scaly: 0.26, plated: 0.20, slimy: 0.24 },
  }),

  temperate_rainforest: biome("temperate_rainforest", "Temperate Rainforest", {
    sizeBias: 0.06,
    limbLengthBias: 0.12,
    limbPairsBias: 0.06,
    segmentationBias: 0.03,
    rigidityBias: -0.02,
    waterRetentionBias: 0.22,
    insulationBias: 0.02,
    armorBias: -0.02,
    ornamentBias: 0.12,
    sensoryBias: { vision: 0.10, chemo: 0.08, mechano: 0.08, thermo: 0.04 },
    locomotionWeights: { crawl: 0.22, walk: 0.22, glide: 0.18, fly: 0.12, swim: 0.12, burrow: 0.08, sessile: 0.02 },
    limbTypeWeights: { tentacle: 0.20, leg: 0.30, wing: 0.14, fin: 0.14, cilia: 0.10 },
    skinWeights: { slimy: 0.30, soft: 0.28, scaly: 0.22, plated: 0.20 },
  }),

  mediterranean_chaparral: biome("mediterranean_chaparral", "Mediterranean / Chaparral", {
    sizeBias: -0.02,
    limbLengthBias: 0.02,
    limbPairsBias: 0.02,
    segmentationBias: 0.04,
    rigidityBias: 0.12,
    waterRetentionBias: -0.10,
    insulationBias: 0.02,
    armorBias: 0.12,
    ornamentBias: 0.04,
    sensoryBias: { vision: 0.10, chemo: 0.04, mechano: 0.06, thermo: 0.10 },
    locomotionWeights: { walk: 0.30, crawl: 0.18, burrow: 0.18, glide: 0.06, fly: 0.08, swim: 0.04, sessile: 0.02 },
    limbTypeWeights: { leg: 0.42, tentacle: 0.12, wing: 0.10, fin: 0.10, cilia: 0.08 },
    skinWeights: { plated: 0.32, scaly: 0.28, soft: 0.22, slimy: 0.18 },
  }),

  boreal_taiga: biome("boreal_taiga", "Boreal Forest (Taiga)", {
    sizeBias: 0.14,
    limbLengthBias: -0.06,
    limbPairsBias: 0.02,
    segmentationBias: 0.02,
    rigidityBias: 0.06,
    waterRetentionBias: -0.02,
    insulationBias: 0.20,
    armorBias: 0.06,
    ornamentBias: 0.04,
    sensoryBias: { vision: 0.10, chemo: 0.04, mechano: 0.08, thermo: 0.16 },
    locomotionWeights: { walk: 0.30, crawl: 0.18, burrow: 0.14, glide: 0.06, fly: 0.06, swim: 0.06, sessile: 0.02 },
    limbTypeWeights: { leg: 0.44, tentacle: 0.10, wing: 0.08, fin: 0.10, cilia: 0.08 },
    skinWeights: { soft: 0.26, scaly: 0.26, plated: 0.26, slimy: 0.22 },
  }),

  tundra: biome("tundra", "Tundra", {
    sizeBias: 0.18,
    limbLengthBias: -0.14,
    limbPairsBias: -0.02,
    segmentationBias: 0.02,
    rigidityBias: 0.08,
    waterRetentionBias: -0.06,
    insulationBias: 0.28,
    armorBias: 0.10,
    ornamentBias: -0.02,
    sensoryBias: { vision: 0.08, chemo: 0.02, mechano: 0.08, thermo: 0.22 },
    locomotionWeights: { walk: 0.30, crawl: 0.18, burrow: 0.18, fly: 0.04, glide: 0.04, swim: 0.04, sessile: 0.02 },
    limbTypeWeights: { leg: 0.46, fin: 0.08, wing: 0.06, tentacle: 0.10, cilia: 0.08 },
    skinWeights: { soft: 0.28, scaly: 0.24, plated: 0.30, slimy: 0.18 },
  }),

  polar_ice: biome("polar_ice", "Polar Ice / Glacier", {
    sizeBias: 0.20,
    limbLengthBias: -0.18,
    limbPairsBias: -0.04,
    segmentationBias: 0.00,
    rigidityBias: 0.10,
    waterRetentionBias: -0.10,
    insulationBias: 0.32,
    armorBias: 0.12,
    ornamentBias: -0.06,
    sensoryBias: { vision: 0.04, chemo: 0.02, mechano: 0.08, thermo: 0.26 },
    locomotionWeights: { walk: 0.26, crawl: 0.18, burrow: 0.20, swim: 0.10, glide: 0.02, fly: 0.02, sessile: 0.02 },
    limbTypeWeights: { leg: 0.38, fin: 0.16, wing: 0.04, tentacle: 0.10, cilia: 0.08 },
    skinWeights: { plated: 0.32, scaly: 0.28, soft: 0.26, slimy: 0.14 },
  }),

  mountain_alpine: biome("mountain_alpine", "Mountain / Alpine", {
    sizeBias: 0.06,
    limbLengthBias: 0.06,
    limbPairsBias: 0.04,
    segmentationBias: 0.02,
    rigidityBias: 0.08,
    waterRetentionBias: -0.02,
    insulationBias: 0.12,
    armorBias: 0.10,
    ornamentBias: 0.04,
    sensoryBias: { vision: 0.14, chemo: 0.02, mechano: 0.12, thermo: 0.14 },
    locomotionWeights: { walk: 0.30, crawl: 0.20, glide: 0.12, fly: 0.10, burrow: 0.12, swim: 0.04, sessile: 0.02 },
    limbTypeWeights: { leg: 0.44, wing: 0.12, tentacle: 0.12, fin: 0.08, cilia: 0.08 },
    skinWeights: { scaly: 0.30, plated: 0.28, soft: 0.22, slimy: 0.20 },
  }),

  // --- AQUATIC ---
  freshwater_river: biome("freshwater_river", "Freshwater – Rivers & Streams", {
    sizeBias: 0.02,
    limbLengthBias: 0.02,
    limbPairsBias: -0.02,
    segmentationBias: 0.02,
    rigidityBias: 0.04,
    waterRetentionBias: 0.24,
    insulationBias: -0.08,
    armorBias: 0.08,
    ornamentBias: 0.06,
    sensoryBias: { vision: 0.08, chemo: 0.10, mechano: 0.14, thermo: 0.04 },
    locomotionWeights: { swim: 0.34, crawl: 0.18, walk: 0.12, sessile: 0.04, burrow: 0.10, glide: 0.02, fly: 0.02 },
    limbTypeWeights: { fin: 0.30, leg: 0.22, tentacle: 0.18, cilia: 0.16, wing: 0.04 },
    skinWeights: { slimy: 0.34, soft: 0.26, scaly: 0.22, plated: 0.18 },
  }),

  freshwater_lake_wetland: biome("freshwater_lake_wetland", "Freshwater – Lakes & Wetlands", {
    sizeBias: 0.04,
    limbLengthBias: 0.06,
    limbPairsBias: 0.02,
    segmentationBias: 0.02,
    rigidityBias: 0.02,
    waterRetentionBias: 0.26,
    insulationBias: -0.06,
    armorBias: 0.04,
    ornamentBias: 0.08,
    sensoryBias: { vision: 0.10, chemo: 0.10, mechano: 0.10, thermo: 0.04 },
    locomotionWeights: { swim: 0.30, crawl: 0.18, walk: 0.16, burrow: 0.08, sessile: 0.04, glide: 0.02, fly: 0.02 },
    limbTypeWeights: { fin: 0.26, leg: 0.26, tentacle: 0.16, cilia: 0.16, wing: 0.06 },
    skinWeights: { slimy: 0.30, soft: 0.26, scaly: 0.24, plated: 0.20 },
  }),

  marine_coastal_intertidal: biome("marine_coastal_intertidal", "Marine – Coastal / Intertidal", {
    sizeBias: 0.02,
    limbLengthBias: -0.02,
    limbPairsBias: 0.06,
    segmentationBias: 0.08,
    rigidityBias: 0.18,
    waterRetentionBias: 0.20,
    insulationBias: -0.10,
    armorBias: 0.20,
    ornamentBias: 0.06,
    sensoryBias: { vision: 0.06, chemo: 0.10, mechano: 0.16, thermo: 0.04 },
    locomotionWeights: { crawl: 0.28, walk: 0.22, swim: 0.18, sessile: 0.06, burrow: 0.10, glide: 0.02, fly: 0.02 },
    limbTypeWeights: { leg: 0.28, fin: 0.20, tentacle: 0.16, cilia: 0.16, wing: 0.04 },
    skinWeights: { plated: 0.36, scaly: 0.28, slimy: 0.20, soft: 0.16 },
  }),

  marine_coral_reef: biome("marine_coral_reef", "Marine – Coral Reef", {
    sizeBias: 0.04,
    limbLengthBias: 0.08,
    limbPairsBias: 0.06,
    segmentationBias: 0.06,
    rigidityBias: 0.06,
    waterRetentionBias: 0.22,
    insulationBias: -0.10,
    armorBias: 0.06,
    ornamentBias: 0.24,
    sensoryBias: { vision: 0.18, chemo: 0.06, mechano: 0.08, thermo: 0.02 },
    locomotionWeights: { swim: 0.30, crawl: 0.18, walk: 0.12, sessile: 0.10, burrow: 0.06, glide: 0.02, fly: 0.02 },
    limbTypeWeights: { fin: 0.28, tentacle: 0.20, cilia: 0.16, leg: 0.16, wing: 0.02 },
    skinWeights: { soft: 0.26, slimy: 0.26, scaly: 0.26, plated: 0.22 },
  }),

  marine_open_ocean: biome("marine_open_ocean", "Marine – Open Ocean (Pelagic)", {
    sizeBias: 0.18,
    limbLengthBias: 0.02,
    limbPairsBias: -0.10,
    segmentationBias: -0.02,
    rigidityBias: -0.02,
    waterRetentionBias: 0.22,
    insulationBias: -0.10,
    armorBias: -0.02,
    ornamentBias: 0.04,
    sensoryBias: { vision: 0.10, chemo: 0.06, mechano: 0.10, thermo: 0.02 },
    locomotionWeights: { swim: 0.44, crawl: 0.10, walk: 0.06, sessile: 0.02, burrow: 0.06, glide: 0.02, fly: 0.02 },
    limbTypeWeights: { fin: 0.40, tentacle: 0.18, cilia: 0.14, leg: 0.10, wing: 0.02 },
    skinWeights: { slimy: 0.30, soft: 0.28, scaly: 0.24, plated: 0.18 },
  }),

  marine_deep_sea: biome("marine_deep_sea", "Marine – Deep Sea (Abyssal)", {
    sizeBias: 0.06,
    limbLengthBias: 0.10,
    limbPairsBias: -0.06,
    segmentationBias: 0.02,
    rigidityBias: -0.06,
    waterRetentionBias: 0.26,
    insulationBias: -0.12,
    armorBias: -0.04,
    ornamentBias: 0.10, // treat as “bioluminescent ornament” later
    sensoryBias: { vision: -0.20, chemo: 0.18, mechano: 0.16, thermo: 0.00 },
    locomotionWeights: { swim: 0.36, crawl: 0.14, walk: 0.06, sessile: 0.06, burrow: 0.06, glide: 0.02, fly: 0.00 },
    limbTypeWeights: { tentacle: 0.28, fin: 0.24, cilia: 0.20, leg: 0.10, wing: 0.00 },
    skinWeights: { soft: 0.36, slimy: 0.28, scaly: 0.22, plated: 0.14 },
  }),

  // --- TRANSITIONAL / SPECIAL ---
  estuary_mangrove: biome("estuary_mangrove", "Estuary / Mangrove", {
    sizeBias: 0.04,
    limbLengthBias: 0.06,
    limbPairsBias: 0.08,
    segmentationBias: 0.04,
    rigidityBias: 0.06,
    waterRetentionBias: 0.22,
    insulationBias: -0.08,
    armorBias: 0.06,
    ornamentBias: 0.10,
    sensoryBias: { vision: 0.10, chemo: 0.12, mechano: 0.10, thermo: 0.04 },
    locomotionWeights: { crawl: 0.22, walk: 0.18, swim: 0.18, burrow: 0.10, sessile: 0.06, glide: 0.02, fly: 0.02 },
    limbTypeWeights: { leg: 0.24, fin: 0.20, tentacle: 0.18, cilia: 0.16, wing: 0.04 },
    skinWeights: { slimy: 0.30, soft: 0.26, scaly: 0.24, plated: 0.20 },
  }),

  swamp_marsh: biome("swamp_marsh", "Swamp / Marsh", {
    sizeBias: 0.02,
    limbLengthBias: 0.10,
    limbPairsBias: 0.06,
    segmentationBias: 0.03,
    rigidityBias: -0.02,
    waterRetentionBias: 0.28,
    insulationBias: -0.06,
    armorBias: -0.02,
    ornamentBias: 0.08,
    sensoryBias: { vision: 0.06, chemo: 0.14, mechano: 0.10, thermo: 0.04 },
    locomotionWeights: { crawl: 0.22, swim: 0.22, walk: 0.14, burrow: 0.10, sessile: 0.06, glide: 0.02, fly: 0.02 },
    limbTypeWeights: { tentacle: 0.20, fin: 0.22, cilia: 0.16, leg: 0.20, wing: 0.04 },
    skinWeights: { slimy: 0.36, soft: 0.28, scaly: 0.20, plated: 0.16 },
  }),

  cave_subterranean: biome("cave_subterranean", "Cave / Subterranean", {
    sizeBias: -0.04,
    limbLengthBias: 0.02,
    limbPairsBias: 0.04,
    segmentationBias: 0.06,
    rigidityBias: 0.06,
    waterRetentionBias: 0.04,
    insulationBias: 0.00,
    armorBias: 0.06,
    ornamentBias: -0.06,
    sensoryBias: { vision: -0.26, chemo: 0.20, mechano: 0.18, thermo: 0.08 },
    locomotionWeights: { burrow: 0.30, crawl: 0.24, walk: 0.14, swim: 0.06, sessile: 0.02, glide: 0.00, fly: 0.00 },
    limbTypeWeights: { tentacle: 0.22, leg: 0.26, cilia: 0.14, fin: 0.10, wing: 0.00 },
    skinWeights: { soft: 0.32, scaly: 0.26, plated: 0.24, slimy: 0.18 },
  }),

  urban_anthropogenic: biome("urban_anthropogenic", "Urban / Anthropogenic", {
    sizeBias: 0.00,
    limbLengthBias: 0.06,
    limbPairsBias: 0.10,
    segmentationBias: 0.06,
    rigidityBias: 0.12,
    waterRetentionBias: -0.02,
    insulationBias: 0.02,
    armorBias: 0.12,
    ornamentBias: 0.24, // “signals” / display traits
    sensoryBias: { vision: 0.14, chemo: 0.02, mechano: 0.14, thermo: 0.04 },
    locomotionWeights: { walk: 0.30, crawl: 0.18, fly: 0.10, glide: 0.08, burrow: 0.10, swim: 0.04, sessile: 0.02 },
    limbTypeWeights: { leg: 0.36, wing: 0.14, tentacle: 0.14, fin: 0.08, cilia: 0.08 },
    skinWeights: { plated: 0.30, scaly: 0.28, soft: 0.22, slimy: 0.20 },
  }),

  // Keep your older “simple” enum values mapped too (if your code currently uses them):
  ocean: biome("ocean", "Ocean (Legacy)", {
    sizeBias: 0.14,
    waterRetentionBias: 0.24,
    limbPairsBias: -0.06,
    limbTypeWeights: { fin: 0.34, tentacle: 0.18, cilia: 0.16, leg: 0.14, wing: 0.00 },
    locomotionWeights: { swim: 0.42, crawl: 0.12, walk: 0.06, sessile: 0.06, burrow: 0.06, glide: 0.00, fly: 0.00 },
    skinWeights: { slimy: 0.32, soft: 0.28, scaly: 0.24, plated: 0.16 },
    sensoryBias: { vision: 0.06, chemo: 0.10, mechano: 0.12, thermo: 0.02 },
  }),

  forest: biome("forest", "Forest (Legacy)", {
    sizeBias: 0.06,
    limbLengthBias: 0.12,
    limbPairsBias: 0.06,
    waterRetentionBias: 0.08,
    ornamentBias: 0.14,
    locomotionWeights: { walk: 0.26, crawl: 0.20, glide: 0.16, fly: 0.12, burrow: 0.10, swim: 0.10, sessile: 0.02 },
    limbTypeWeights: { leg: 0.34, wing: 0.14, tentacle: 0.18, fin: 0.10, cilia: 0.10 },
    sensoryBias: { vision: 0.12, chemo: 0.06, mechano: 0.08, thermo: 0.04 },
  }),

  desert: biome("desert", "Desert (Legacy)", {
    sizeBias: -0.10,
    rigidityBias: 0.16,
    waterRetentionBias: -0.16,
    armorBias: 0.16,
    locomotionWeights: { burrow: 0.26, crawl: 0.22, walk: 0.20, swim: 0.02, glide: 0.06, fly: 0.06, sessile: 0.02 },
    skinWeights: { plated: 0.34, scaly: 0.30, soft: 0.20, slimy: 0.16 },
    sensoryBias: { vision: 0.06, chemo: 0.08, mechano: 0.10, thermo: 0.16 },
  }),

  tundra_legacy: biome("tundra_legacy" as BiomeType, "Tundra (Legacy)", {
    sizeBias: 0.18,
    limbLengthBias: -0.14,
    insulationBias: 0.28,
    sensoryBias: { vision: 0.08, chemo: 0.02, mechano: 0.08, thermo: 0.22 },
  }),

  temperate: biome("temperate", "Temperate (Legacy)", {
    sizeBias: 0.04,
    limbLengthBias: 0.06,
    limbPairsBias: 0.04,
    sensoryBias: { vision: 0.10, chemo: 0.04, mechano: 0.06, thermo: 0.06 },
  }),
};

/**
 * Helper: returns a biome constraints object, falling back to a safe default.
 */
export function getBiomeConstraints(biome: BiomeType): BiomeConstraints {
  return BIOME_TABLE[biome] ?? BIOME_TABLE.temperate;
}

/**
 * Optional helper: normalize weights into probabilities (0..1 sum=1).
 * Useful when sampling limbType/locomotion/skin decisions.
 */
export function normalizeWeights<T extends string>(weights: Record<T, number>): Record<T, number> {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const sum = entries.reduce((acc, [, v]) => acc + Math.max(0, v), 0);
  if (sum <= 0) return weights;
  const out = {} as Record<T, number>;
  for (const [k, v] of entries) out[k] = Math.max(0, v) / sum;
  return out;
}
