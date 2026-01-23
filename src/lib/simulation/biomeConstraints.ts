import {
  BiomeType,
  BodyPlan,
  Environment,
  Genome,
  LimbType,
  LocomotionType,
  SkinType,
} from "./types";

export type TraitTarget = {
  target: number;
  tolerance: number;
  strength: number;
};

export type BiomeWeights = {
  traitTargets: Partial<Record<keyof Genome, TraitTarget>>;
  traitBias: Partial<Record<keyof Genome, number>>;
  locomotion: Partial<Record<LocomotionType, number>>;
  limbType: Partial<Record<LimbType, number>>;
  bodyPlan: Partial<Record<BodyPlan, number>>;
  skin: Partial<Record<SkinType, number>>;
};

type BiomeGate = {
  id: string;
  biome: BiomeType;
  bonus: number;
  tag: string;
  condition: (g: Genome, env: Environment) => boolean;
};

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const safeDiv = (value: number, denom: number) =>
  denom === 0 ? 0 : value / denom;

const BIOME_WEIGHTS: Partial<Record<BiomeType, BiomeWeights>> = {
  ocean: {
    locomotion: {
      swim: 1.4,
      glide: 1.15,
      walk: 0.7,
      crawl: 0.7,
      burrow: 0.6,
      fly: 0.6,
      sessile: 0.5,
    },
    limbType: {
      fin: 1.35,
      tentacle: 1.1,
      cilia: 1.0,
      leg: 0.7,
      wing: 0.6,
    },
    bodyPlan: {
      cephalopod_swimmer: 1.35,
      ovoid_generalist: 1.1,
      segmented_crawler: 0.95,
      arthropod_walker: 0.9,
      sessile_reef: 0.8,
    },
    skin: {
      slimy: 1.35,
      soft: 1.1,
      scaly: 0.8,
      plated: 0.6,
    },
    traitBias: {
      waterRetention: 0.2,
      locomotionMode: 0.12,
      limbLength: 0.1,
      rigidity: -0.08,
      bodySize: -0.05,
    },
    traitTargets: {
      waterRetention: { target: 0.8, tolerance: 0.25, strength: 0.5 },
      locomotionMode: { target: 0.6, tolerance: 0.3, strength: 0.3 },
      limbLength: { target: 0.6, tolerance: 0.25, strength: 0.25 },
      rigidity: { target: 0.35, tolerance: 0.3, strength: 0.2 },
      segmentation: { target: 0.4, tolerance: 0.3, strength: 0.2 },
    },
  },
  desert: {
    locomotion: {
      walk: 1.3,
      crawl: 1.1,
      burrow: 1.2,
      swim: 0.45,
      glide: 0.65,
      fly: 0.65,
      sessile: 0.5,
    },
    limbType: {
      leg: 1.35,
      tentacle: 0.75,
      wing: 0.7,
      fin: 0.5,
      cilia: 0.6,
    },
    bodyPlan: {
      arthropod_walker: 1.15,
      segmented_crawler: 1.1,
      ovoid_generalist: 0.9,
      sessile_reef: 0.45,
      cephalopod_swimmer: 0.6,
    },
    skin: {
      plated: 1.35,
      scaly: 1.1,
      soft: 0.75,
      slimy: 0.5,
    },
    traitBias: {
      rigidity: 0.2,
      waterRetention: 0.12,
      bodySize: -0.08,
      limbLength: -0.12,
      segmentation: 0.05,
    },
    traitTargets: {
      rigidity: { target: 0.75, tolerance: 0.25, strength: 0.5 },
      waterRetention: { target: 0.6, tolerance: 0.3, strength: 0.35 },
      limbLength: { target: 0.4, tolerance: 0.25, strength: 0.3 },
      bodySize: { target: 0.45, tolerance: 0.35, strength: 0.2 },
    },
  },
  forest: {
    locomotion: {
      walk: 1.2,
      glide: 1.2,
      crawl: 1.1,
      fly: 1.05,
      swim: 0.6,
      burrow: 0.75,
      sessile: 0.7,
    },
    limbType: {
      leg: 1.1,
      wing: 1.1,
      tentacle: 0.85,
      fin: 0.6,
      cilia: 0.55,
    },
    bodyPlan: {
      arthropod_walker: 1.1,
      segmented_crawler: 1.05,
      ovoid_generalist: 0.95,
      cephalopod_swimmer: 0.75,
      sessile_reef: 0.7,
    },
    skin: {
      soft: 1.1,
      slimy: 0.9,
      scaly: 0.9,
      plated: 0.75,
    },
    traitBias: {
      limbCount: 0.15,
      limbLength: 0.15,
      segmentation: 0.08,
      waterRetention: 0.08,
      locomotionMode: 0.05,
    },
    traitTargets: {
      limbCount: { target: 0.65, tolerance: 0.3, strength: 0.45 },
      limbLength: { target: 0.65, tolerance: 0.25, strength: 0.35 },
      segmentation: { target: 0.55, tolerance: 0.3, strength: 0.25 },
    },
  },
  tundra: {
    locomotion: {
      walk: 1.2,
      crawl: 1.05,
      burrow: 1.1,
      swim: 0.65,
      glide: 0.7,
      fly: 0.55,
      sessile: 0.5,
    },
    limbType: {
      leg: 1.2,
      wing: 0.7,
      tentacle: 0.7,
      fin: 0.6,
      cilia: 0.7,
    },
    bodyPlan: {
      arthropod_walker: 1.0,
      segmented_crawler: 1.05,
      ovoid_generalist: 1.0,
      cephalopod_swimmer: 0.7,
      sessile_reef: 0.55,
    },
    skin: {
      plated: 1.1,
      scaly: 1.0,
      soft: 0.85,
      slimy: 0.6,
    },
    traitBias: {
      rigidity: 0.15,
      bodySize: 0.06,
      limbLength: -0.12,
      waterRetention: -0.05,
    },
    traitTargets: {
      rigidity: { target: 0.7, tolerance: 0.25, strength: 0.45 },
      limbLength: { target: 0.35, tolerance: 0.2, strength: 0.35 },
      bodySize: { target: 0.55, tolerance: 0.3, strength: 0.25 },
    },
  },
  temperate: {
    locomotion: {
      walk: 1.0,
      swim: 1.0,
      glide: 0.95,
      fly: 0.9,
      crawl: 1.0,
      burrow: 0.95,
      sessile: 0.85,
    },
    limbType: {
      leg: 1.0,
      fin: 0.95,
      wing: 0.9,
      tentacle: 0.95,
      cilia: 0.9,
    },
    bodyPlan: {
      ovoid_generalist: 1.05,
      segmented_crawler: 1.0,
      arthropod_walker: 1.0,
      cephalopod_swimmer: 0.9,
      sessile_reef: 0.85,
    },
    skin: {
      soft: 1.0,
      scaly: 0.95,
      slimy: 0.95,
      plated: 0.9,
    },
    traitBias: {
      locomotionMode: 0.02,
      limbCount: 0.02,
      rigidity: 0.02,
    },
    traitTargets: {
      locomotionMode: { target: 0.5, tolerance: 0.35, strength: 0.2 },
      limbCount: { target: 0.5, tolerance: 0.35, strength: 0.2 },
      segmentation: { target: 0.5, tolerance: 0.35, strength: 0.2 },
      rigidity: { target: 0.5, tolerance: 0.35, strength: 0.2 },
    },
  },
};

export const getBiomeWeights = (biome: BiomeType): BiomeWeights =>
  (BIOME_WEIGHTS[biome] ?? BIOME_WEIGHTS.temperate ?? BIOME_WEIGHTS.ocean)!;

const BIOME_GATES: BiomeGate[] = [
  {
    id: "OCEAN_CRAB_WALKER",
    biome: "ocean",
    bonus: 0.18,
    tag: "Crab-Walker",
    condition: (g) =>
      g.segmentation > 0.5 && g.rigidity > 0.5 && g.limbCount > 0.6,
  },
  {
    id: "OCEAN_SWIMMER",
    biome: "ocean",
    bonus: 0.15,
    tag: "Ocean-Swimmer",
    condition: (g) => g.locomotionMode > 0.5 && g.waterRetention > 0.6,
  },
  {
    id: "DESERT_BURROWER",
    biome: "desert",
    bonus: 0.16,
    tag: "Desert-Burrower",
    condition: (g) =>
      g.rigidity > 0.55 && g.waterRetention > 0.55 && g.limbCount < 0.4,
  },
  {
    id: "DESERT_PLATED",
    biome: "desert",
    bonus: 0.12,
    tag: "Desert-Plated",
    condition: (g) => g.rigidity > 0.6 && g.bodySize > 0.4,
  },
  {
    id: "FOREST_CLIMBER",
    biome: "forest",
    bonus: 0.18,
    tag: "Forest-Climber",
    condition: (g) =>
      g.limbCount > 0.5 && g.locomotionMode > 0.4 && g.segmentation > 0.4,
  },
  {
    id: "TUNDRA_INSULATED",
    biome: "tundra",
    bonus: 0.16,
    tag: "Tundra-Insulated",
    condition: (g) => g.rigidity > 0.6 && g.bodySize > 0.45,
  },
  {
    id: "TEMPERATE_GENERALIST",
    biome: "temperate",
    bonus: 0.1,
    tag: "Temperate-Generalist",
    condition: (g) =>
      g.limbCount > 0.3 && g.locomotionMode > 0.3 && g.rigidity > 0.3,
  },
];

export function computeBiomeFitness(
  genome: Genome,
  env: Environment,
): { fitness: number; penalties: number; bonuses: number; tags: string[] } {
  const biome = env.biome ?? "temperate";
  const weights = getBiomeWeights(biome);
  const targets = weights.traitTargets ?? {};
  let penalties = 0;

  (Object.keys(targets) as Array<keyof Genome>).forEach((key) => {
    const entry = targets[key];
    if (!entry) return;
    const value = genome[key];
    const diff = Math.abs(value - entry.target);
    const normalized = safeDiv(diff, entry.tolerance);
    penalties += normalized * normalized * entry.strength;
  });

  let bonuses = 0;
  const tags: string[] = [];
  BIOME_GATES.forEach((gate) => {
    if (gate.biome !== biome) return;
    if (gate.condition(genome, env)) {
      bonuses += gate.bonus;
      tags.push(gate.tag);
    }
  });

  const fitness = clamp(1 + bonuses - penalties, 0, 2);
  return { fitness, penalties, bonuses, tags };
}
