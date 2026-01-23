import { Environment, Genome } from "./types";
import { createInitialGenome, mutateGenome } from "./genome";
import { createCycleEnvironment } from "./environment";
import { getBiomeConstraints } from "./biomes";

export interface EvolutionState {
  genome: Genome;
  environment: Environment;
  cycleCount: number;
}

let cycleCount = 0;
let lowMutationStreak = 0;
const LOW_MUTATION_STREAK_LIMIT = 200;

export interface CycleResult {
  survived: boolean;
  energyDelta: number;
  stressDelta: number;
  mutatedGenome?: Genome;
  causeOfDeath?: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type BiomeConstraints = {
  foodAvailability?: number;
  traitBias?: Partial<Record<keyof Genome, number>>;
  traitTargets?: Partial<Record<keyof Genome, { target: number; tolerance: number; strength: number }>>;
};

const getFoodAvailability = (biome: string, constraints: BiomeConstraints) => {
  if (constraints.foodAvailability !== undefined) {
    return clamp01(constraints.foodAvailability);
  }
  const name = biome.toLowerCase();
  if (name.includes("reef") || name.includes("mangrove")) return 0.85;
  if (name.includes("desert") || name.includes("dune")) return 0.25;
  if (name.includes("tundra") || name.includes("ice")) return 0.3;
  if (name.includes("forest") || name.includes("rainforest")) return 0.6;
  if (name.includes("ocean") || name.includes("coast")) return 0.5;
  return 0.55;
};

const computeBiomePressure = (genome: Genome, env: Environment) => {
  const biome = env.biome ?? "temperate";
  const constraints = getBiomeConstraints(biome) as BiomeConstraints;
  const bias = { ...(constraints.traitBias ?? {}) };
  if (biome.includes("ocean") || biome.includes("reef") || biome.includes("coast")) {
    bias.waterRetention = (bias.waterRetention ?? 0) + 0.5;
    bias.locomotionMode = (bias.locomotionMode ?? 0) + 0.3;
    bias.rigidity = (bias.rigidity ?? 0) - 0.2;
  } else if (biome.includes("desert") || biome.includes("dune")) {
    bias.waterRetention = (bias.waterRetention ?? 0) + 0.6;
    bias.rigidity = (bias.rigidity ?? 0) + 0.35;
    bias.limbLength = (bias.limbLength ?? 0) + 0.2;
  } else if (biome.includes("tundra") || biome.includes("ice")) {
    bias.thermoregulation = (bias.thermoregulation ?? 0) + 0.5;
    bias.bodySize = (bias.bodySize ?? 0) + 0.25;
    bias.limbLength = (bias.limbLength ?? 0) - 0.2;
  } else if (biome.includes("forest") || biome.includes("rainforest")) {
    bias.limbLength = (bias.limbLength ?? 0) + 0.4;
    bias.locomotionMode = (bias.locomotionMode ?? 0) + 0.25;
    bias.lightSensitivity = (bias.lightSensitivity ?? 0) + 0.35;
  }
  const targets = constraints.traitTargets ?? {};
  const pressure: Partial<Record<keyof Genome, number>> = {};
  let alignment = 0;
  let weightSum = 0;

  (Object.keys(bias) as Array<keyof Genome>).forEach((key) => {
    const biasValue = clamp(bias[key] ?? 0, -1, 1);
    if (biasValue === 0) return;
    const trait = genome[key];
    const score = biasValue * (trait - 0.5) * 2;
    alignment += score * Math.abs(biasValue);
    weightSum += Math.abs(biasValue);
    pressure[key] = clamp((pressure[key] ?? 0) + biasValue, -1, 1);
  });

  (Object.keys(targets) as Array<keyof Genome>).forEach((key) => {
    const entry = targets[key];
    if (!entry) return;
    const diff = entry.target - genome[key];
    const tolerance = Math.max(0.0001, entry.tolerance);
    const closeness = clamp01(1 - Math.abs(diff) / tolerance);
    alignment += closeness * entry.strength;
    weightSum += entry.strength;
    pressure[key] = clamp(
      (pressure[key] ?? 0) + clamp(diff / tolerance, -1, 1) * entry.strength,
      -1,
      1,
    );
  });

  const alignmentScore = weightSum > 0 ? clamp01((alignment / weightSum + 1) * 0.5) : 0.5;
  const mismatch = clamp01(1 - alignmentScore);
  return { constraints, alignmentScore, mismatch, pressure, foodAvailability: getFoodAvailability(biome, constraints) };
};

export function runCycle(
  genome: Genome,
  env: Environment,
  options: { disableDeath?: boolean } = {},
): CycleResult {
  const currentCycle = (cycleCount += 1);
  if (genome.mutationRate < 0.05) {
    lowMutationStreak += 1;
  } else {
    lowMutationStreak = 0;
  }
  const result: CycleResult = {
    survived: true,
    energyDelta: 0,
    stressDelta: 0,
  };

  // 1. Calculate Metabolic Cost
  const bmr =
    genome.bodySize * 0.5 + genome.metabolicRate * 0.5 + genome.sociality * 0.2;
  result.energyDelta -= bmr;

  const biomeInfo = computeBiomePressure(genome, env);
  const biomeName = (env.biome ?? "temperate").toLowerCase();

  // 2. Calculate Energy Intake (Feeding)
  let foragingSuccess = biomeInfo.foodAvailability * 0.6 + Math.random() * 0.4;

  if (genome.feedingStrategy > 0.7) {
    // Predatory/Active
    foragingSuccess += genome.aggression * 0.3;
  } else if (genome.feedingStrategy < 0.3) {
    // Passive/Grazer
    foragingSuccess += (1 - genome.aggression) * 0.2 + env.sunlight * 0.5;
  }

  if (genome.locomotionMode > 0.3) {
    result.stressDelta -= env.volatility * 0.5;
    foragingSuccess += 0.2;
    if (genome.locomotionMode > 0.5 && genome.limbCount > 0.3) {
      foragingSuccess += 0.2;
    }
  }

  if (biomeName.includes("ocean") || biomeName.includes("reef") || biomeName.includes("coast")) {
    foragingSuccess += genome.locomotionMode * 0.12 + genome.waterRetention * 0.1;
    result.stressDelta -= genome.waterRetention * 0.1;
  } else if (biomeName.includes("desert") || biomeName.includes("dune")) {
    foragingSuccess += genome.rigidity * 0.08 + genome.waterRetention * 0.05;
    result.stressDelta += (1 - genome.waterRetention) * 0.12;
  } else if (biomeName.includes("tundra") || biomeName.includes("ice")) {
    foragingSuccess += genome.thermoregulation * 0.1 + genome.bodySize * 0.05;
    result.stressDelta += (1 - genome.thermoregulation) * 0.12;
  } else if (biomeName.includes("forest") || biomeName.includes("rainforest")) {
    foragingSuccess += genome.limbLength * 0.1 + genome.lightSensitivity * 0.08;
    result.stressDelta -= genome.limbLength * 0.05;
  }

  foragingSuccess += biomeInfo.alignmentScore * 0.25;
  result.stressDelta -= biomeInfo.alignmentScore * 0.2;
  result.stressDelta += biomeInfo.mismatch * 0.25;

  result.energyDelta += foragingSuccess;

  // 3. Stress from Environment
  const idealTemp = genome.thermoregulation * 2 - 1;
  const tempDiff = Math.abs(env.temperature - idealTemp);
  result.stressDelta += tempDiff * 0.5;

  result.stressDelta += env.volatility * (1 - genome.rigidity) * 0.2;

  if (env.travelRate > 0.2) {
    foragingSuccess += genome.locomotionMode * env.travelRate * 0.15;
    result.stressDelta -= genome.locomotionMode * env.travelRate * 0.1;
  } else {
    result.stressDelta -= genome.digestiveEfficiency * (1 - env.travelRate) * 0.06;
  }

  const interactionRate = env.interactionRate ?? env.proximityDensity;
  if (interactionRate > 0.2) {
    const socialBoost = genome.sociality * interactionRate;
    foragingSuccess += socialBoost * 0.15;
    result.stressDelta -= socialBoost * 0.08;
    result.stressDelta += genome.aggression * interactionRate * 0.05;
  } else {
    foragingSuccess += genome.digestiveEfficiency * (1 - interactionRate) * 0.1;
    result.stressDelta -= genome.waterRetention * (1 - interactionRate) * 0.05;
  }

  if (genome.locomotionMode < 0.15 && genome.bodySize > 0.15) {
    result.stressDelta += 0.6;
    result.energyDelta -= 0.4;
  }
  if (genome.locomotionMode > 0.35 && genome.limbCount < 0.2) {
    result.stressDelta += 0.5;
    result.energyDelta -= 0.3;
  }
  if (genome.locomotionMode > 0.35 && genome.limbCount > 0.3) {
    result.energyDelta += 0.25;
  }
  if (genome.segmentation > 0.35 && genome.rigidity > 0.3) {
    result.stressDelta -= env.volatility * 0.35;
  }

  result.energyDelta += biomeInfo.alignmentScore * 0.2;

  // 4. Survival Check
  let causeOfDeath: string | undefined;
  if (result.energyDelta < -0.5) {
    causeOfDeath = "Starvation";
  } else if (result.stressDelta > 0.8) {
    causeOfDeath = "Environmental Stress";
  }
  if (causeOfDeath) {
    result.causeOfDeath = causeOfDeath;
    if (!options.disableDeath) {
      result.survived = false;
    }
  }

  const bias = biomeInfo.pressure;

  if (result.survived && lowMutationStreak >= LOW_MUTATION_STREAK_LIMIT) {
    const magnitude =
      env.volatility * 0.6 + 0.2 + biomeInfo.mismatch * 0.25;
    result.mutatedGenome = mutateGenome(genome, magnitude, Math.random, undefined, bias);
    lowMutationStreak = 0;
    return result;
  }

  // 5. Mutation Opportunity
  let mutationChance =
    genome.mutationRate + result.stressDelta * 0.5 + env.volatility * 0.2;
  mutationChance += biomeInfo.mismatch * 0.25;
  mutationChance += env.proximityDensity * 0.15 + env.travelRate * 0.1;
  if (genome.locomotionMode < 0.15 && currentCycle > 2000) {
    mutationChance += 0.5;
  }

  if (result.survived && Math.random() < mutationChance) {
    const magnitude = env.volatility * 0.5 + 0.1 + biomeInfo.mismatch * 0.25;
    result.mutatedGenome = mutateGenome(genome, magnitude, Math.random, undefined, bias);
  }

  return result;
}

/**
 * Advance the simulation by ONE cycle.
 *
 * IMPORTANT:
 * - Death is completely disabled.
 * - The organism NEVER resets.
 * - Mutations still occur.
 */
export function advanceOneCycle(state: EvolutionState): EvolutionState {
  const { genome, environment, cycleCount } = state;

  // Run simulation logic
  const result = runCycle(genome, environment);

  // Advance environment regardless of outcome
  const nextEnvironment = createCycleEnvironment(environment);

  // --- DEATH REMOVED ---
  // We ALWAYS survive. Ignore starvation / stress entirely.

  let nextGenome = genome;

  // Apply mutation if it occurred
  if (result.mutatedGenome) {
    nextGenome = result.mutatedGenome;
  }

  return {
    genome: nextGenome,
    environment: nextEnvironment,
    cycleCount: cycleCount + 1,
  };
}

/**
 * Advance simulation by N cycles (e.g. Jump 20k)
 * This function ALSO ignores death completely.
 */
export function advanceManyCycles(
  state: EvolutionState,
  cycles: number
): EvolutionState {
  let current = state;

  for (let i = 0; i < cycles; i += 1) {
    current = advanceOneCycle(current);
  }

  return current;
}

/**
 * Create a fresh evolution state.
 * NOTE: This is now ONLY called on app start,
 * never due to "death".
 */
export function createInitialEvolutionState(
  environment: Environment
): EvolutionState {
  return {
    genome: createInitialGenome(),
    environment,
    cycleCount: 0,
  };
}
