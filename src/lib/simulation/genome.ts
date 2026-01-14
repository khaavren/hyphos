import { Genome } from './types';

export function createInitialGenome(): Genome {
    return {
        // Structural - SINGLE CELL START
        symmetry: 0.5, // Perfect spehere
        segmentation: 0.05, // Almost none
        rigidity: 0.1, // Soft membrane
        locomotionMode: 0.0, // Drifting
        limbCount: 0.0, // No limbs
        limbLength: 0.0,
        bodySize: 0.05, // Microscopic

        // Physiological
        metabolicRate: 0.2, // Slow
        thermoregulation: 0.1,
        waterRetention: 0.8, // Aquatic/Cytoplasm
        respirationType: 0.1, // Diffusion
        feedingStrategy: 0.1, // Filter
        digestiveEfficiency: 0.5,

        // Sensory/Behavioral
        lightSensitivity: 0.2,
        chemicalSensitivity: 0.8, // Chemotaxis
        proximityAwareness: 0.1,
        aggression: 0.0,
        sociality: 0.0,
        reproductionStrategy: 0.9, // r-selection (fast)

        // Meta
        mutationRate: 0.15 // High initial mutation to escape single cell phase
    };
}

export function mutateGenome(parent: Genome, magnitude: number = 0.1): Genome {
    const g = { ...parent };

    // COMPLEXITY RATCHET: Evolution favors complexity over time until a plateau
    // We add a small positive bias to structural traits if they are low
    const growthBias = 0.02;

    (Object.keys(g) as Array<keyof Genome>).forEach(key => {
        let change = (Math.random() - 0.5) * magnitude;

        // Ratchet logic for structural traits
        if (['bodySize', 'segmentation', 'limbCount', 'limbLength', 'neuralComplexity'].includes(key)) {
            // It's harder to lose complexity than to gain it (slightly)
            change += growthBias;
        }

        if (Math.random() < 0.3) {
            g[key] += change;
        }
    });

    // Macro Mutation (rare but impactful) - Boosted for early game
    if (Math.random() < 0.05 * g.mutationRate) {
        const key = randomKey(g);
        // If we are small, favor growing
        if (key === 'bodySize' && g.bodySize < 0.3) {
            g[key] += 0.2;
        } else {
            g[key] += (Math.random() - 0.5) * 0.5; // Big jump
        }
    }

    // Clamp all to 0..1
    (Object.keys(g) as Array<keyof Genome>).forEach(key => {
        g[key] = Math.max(0, Math.min(1, g[key]));
    });

    return g;
}

function randomKey(g: Genome): keyof Genome {
    const keys = Object.keys(g) as Array<keyof Genome>;
    return keys[Math.floor(Math.random() * keys.length)];
}

// Deprecated or used for "Sandbox" mode
export function generateRandomGenome(): Genome {
    const g = createInitialGenome();
    (Object.keys(g) as Array<keyof Genome>).forEach(key => {
        g[key] = Math.random();
    });
    return g;
}
