import { BodyPlan, Environment, Genome, LimbType, Phenotype, SkinType } from "./types";

/**
 * Deterministically maps a Genome + Environment History to a specific Phenotype.
 * This is the "Renderer Input".
 */
export function derivePhenotype(genome: Genome, _env: Environment): Phenotype {
    void _env;
    // 1. Determine Body Plan (Basins of Attraction)
    // We map the 20d genome space into discrete basins.
    const bodyPlan = determineBodyPlan(genome);

    // 2. Derive Locomotion
    const locomotion = determineLocomotion(genome, bodyPlan);

    // 3. Derive Appendages
    // Map limbCount 0..1 to 0..8 pairs
    let limbPairs = Math.floor(genome.limbCount * 6); // 0 to 5 (actually pairs so 0-10 limbs)

    if (bodyPlan === 'sessile_reef') limbPairs = 0;
    if (bodyPlan === 'arthropod_walker') limbPairs = Math.max(2, limbPairs);

    // Limb Type
    let limbType: LimbType = 'leg';
    if (locomotion === 'swim') limbType = 'fin';
    if (locomotion === 'fly') limbType = 'wing';
    if (genome.limbLength > 0.8) limbType = 'tentacle';
    if (bodyPlan === 'sessile_reef') limbType = 'cilia';

    // 4. Surface Details
    const patchCoverage = genome.waterRetention; // Moss/Algae likes water
    const roughness = genome.rigidity;

    // Derive Skin Type
    let skinType: SkinType = 'soft';
    if (genome.waterRetention > 0.8) skinType = 'slimy';
    else if (genome.rigidity > 0.7) skinType = 'plated';
    else if (genome.rigidity > 0.4) skinType = 'scaly';

    return {
        bodyPlan,
        skinType,
        axialScale: [
            0.2 + genome.bodySize * 2.5, // 0.0=0.2 (micro), 1.0=2.7 (huge)
            (0.2 + genome.bodySize * 2.5) * (genome.symmetry > 0.6 ? 1 : 0.8),
            0.2 + genome.bodySize * 2.5
        ],
        segmentCount: Math.max(1, Math.floor(genome.segmentation * 8)), // 0.05 -> 0 -> 1 segment. 1.0 -> 8 segments.
        asymmetry: 1 - genome.symmetry,
        rigidity: genome.rigidity,

        locomotion,
        limbPairs,
        limbType,
        limbLength: 2.0 + genome.limbLength * 6.0, // 0.0=2.0, 1.0=8.0 (dramatic tentacle length)
        limbThickness: Math.max(0.3, 0.2 + genome.rigidity * 0.3), // Min 0.3 for visibility

        patchCoverage,
        veinVisibility: genome.metabolicRate,
        poreScale: genome.respirationType,
        wetSheen: genome.waterRetention,
        roughness,
        armorPlates: genome.rigidity > 0.7 ? (genome.rigidity - 0.7) * 3 : 0,

        breathRate: 0.2 + genome.metabolicRate,
        breathAmplitude: 0.1 + genome.respirationType * 0.2,
        gaitRate: 0.2 + genome.locomotionMode + genome.metabolicRate,
        motionIntensity: genome.aggression,

        ornamentation: genome.sociality,
        broodPouches: genome.reproductionStrategy
    };
}

function determineBodyPlan(g: Genome): BodyPlan {
    // Decision Tree - LOW THRESHOLDS FOR COMPLEXITY

    // 1. Sessile (Reef) - Rare, only if very low movement
    if (g.locomotionMode < 0.15) return 'sessile_reef';

    // 2. Segmented / Arthropod - VERY COMMON
    // Lowered threshold from 0.6 to 0.3
    if (g.segmentation > 0.3) {
        if (g.rigidity > 0.4) return 'arthropod_walker';
        return 'segmented_crawler';
    }

    // 3. Cephalopod - If flexible and swimming
    if (g.locomotionMode > 0.6 && g.limbCount < 0.5) return 'cephalopod_swimmer';

    // 4. Default Ovoid
    return 'ovoid_generalist';
}

function determineLocomotion(g: Genome, plan: BodyPlan) {
    if (plan === 'sessile_reef') return 'sessile';
    if (plan === 'cephalopod_swimmer') return 'swim';

    if (g.locomotionMode > 0.8) return 'fly';
    if (g.locomotionMode > 0.5) return 'swim';
    if (g.rigidity > 0.4) return 'walk';

    return 'crawl';
}
