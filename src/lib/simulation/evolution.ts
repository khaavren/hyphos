import { Environment, Genome } from "./types";
import { mutateGenome } from "./genome"; // We will implement this next

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

export function runCycle(genome: Genome, env: Environment): CycleResult {
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
    // Larger bodies and complex brains cost more energy
    const bmr = (genome.bodySize * 0.5 + genome.metabolicRate * 0.5 + genome.sociality * 0.2);
    result.energyDelta -= bmr;

    // 2. Calculate Energy Intake (Feeding)
    // Simplified model: Alignment of feeding strategy with environment resource
    // e.g. High sunlight -> Photosynthesis (if feedingStrategy implies it, here abstract)
    // For now: Random foraging success + bonus if high aggression or high sociality
    let foragingSuccess = Math.random() * 0.8;

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

    result.energyDelta += foragingSuccess;

    // 3. Stress from Environment
    // Deviation from ideal temp causes stress
    const idealTemp = genome.thermoregulation * 2 - 1; // Map 0..1 to -1..1
    const tempDiff = Math.abs(env.temperature - idealTemp);
    result.stressDelta += tempDiff * 0.5;

    // High volatility causes stress if low rigidity/resilience
    result.stressDelta += env.volatility * (1 - genome.rigidity) * 0.2;

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

    // 4. Survival Check
    // In a real run, we'd track accumulated Energy/Stress. 
    // Here we just check acute failure for the cycle step.
    if (result.energyDelta < -0.5) {
        result.survived = false;
        result.causeOfDeath = "Starvation";
    } else if (result.stressDelta > 0.8) {
        result.survived = false;
        result.causeOfDeath = "Environmental Stress";
    }

    if (result.survived && lowMutationStreak >= LOW_MUTATION_STREAK_LIMIT) {
        const magnitude = env.volatility * 0.6 + 0.2;
        result.mutatedGenome = mutateGenome(genome, magnitude);
        lowMutationStreak = 0;
        return result;
    }

    // 5. Mutation Opportunity
    // Stress increases mutation chance (imperative adaptation)
    let mutationChance = genome.mutationRate + (result.stressDelta * 0.5) + (env.volatility * 0.2);
    if (genome.locomotionMode < 0.15 && currentCycle > 2000) {
        mutationChance += 0.5;
    }

    if (result.survived && Math.random() < mutationChance) {
        // Magnitude depends on volatility
        const magnitude = env.volatility * 0.5 + 0.1;
        result.mutatedGenome = mutateGenome(genome, magnitude);
    }

    return result;
}
