import { BodyPlan, Environment, Genome, LimbType, LocomotionType, Phenotype, SkinType } from "./types";

/**
 * Deterministically maps a Genome + Environment History to a specific Phenotype.
 * This is the "Renderer Input".
 */
export function derivePhenotype(genome: Genome, _env: Environment): Phenotype {
    void _env;
    // 1. Determine Body Plan (Basins of Attraction)
    // We map the 20d genome space into discrete basins.
    const baseBodyPlan = determineBodyPlan(genome);

    // 2. Derive Locomotion
    let locomotion = determineLocomotion(genome, baseBodyPlan);

    // Limb Type
    let limbType: LimbType = 'leg';
    if (locomotion === 'fly') limbType = 'wing';
    else if (locomotion === 'swim') limbType = 'fin';
    else if (baseBodyPlan === 'arthropod_walker') limbType = 'leg';
    else if (genome.limbLength > 0.8) limbType = 'tentacle';

    const bodyPlan = determineBodyPlan(genome, locomotion, limbType);

    // 3. Derive Appendages
    // Map limbCount 0..1 to 0..8 pairs
    let limbPairs = Math.floor(genome.limbCount * 6); // 0 to 5 (actually pairs so 0-10 limbs)
    let segmentCount = Math.max(1, Math.floor(genome.segmentation * 8)); // 0.05 -> 0 -> 1 segment. 1.0 -> 8 segments.

    if (bodyPlan === 'sessile_reef') {
        limbPairs = 0;
        locomotion = 'sessile';
    }
    if (bodyPlan === 'arthropod_walker') {
        limbPairs = Math.max(2, limbPairs);
        segmentCount = Math.max(4, segmentCount);
    }
    if (bodyPlan === 'cephalopod_swimmer') {
        locomotion = 'swim';
        segmentCount = Math.min(3, segmentCount);
    }

    // 4. Surface Details
    const patchCoverage = genome.waterRetention; // Moss/Algae likes water
    const roughness = genome.rigidity;

    // Derive Skin Type
    let skinType: SkinType = 'soft';
    if (genome.waterRetention > 0.8) skinType = 'slimy';
    else if (genome.rigidity > 0.7) skinType = 'plated';
    else if (genome.rigidity > 0.4) skinType = 'scaly';

    const baseScale = 0.2 + genome.bodySize * 2.5;
    const axialMultiplier: Record<BodyPlan, [number, number, number]> = {
        sessile_reef: [1.05, 0.7, 1.05],
        segmented_crawler: [1.15, 0.85, 1.1],
        arthropod_walker: [1.25, 0.8, 1.05],
        cephalopod_swimmer: [0.9, 1.1, 1.25],
        ovoid_generalist: [1, 1, 1],
    };

    return {
        bodyPlan,
        skinType,
        axialScale: [
            baseScale * axialMultiplier[bodyPlan][0],
            baseScale * axialMultiplier[bodyPlan][1] * (genome.symmetry > 0.6 ? 1 : 0.8),
            baseScale * axialMultiplier[bodyPlan][2],
        ],
        segmentCount,
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

function determineBodyPlan(
    g: Genome,
    locomotion?: LocomotionType,
    limbType?: LimbType,
): BodyPlan {
    // Decision Tree - LOW THRESHOLDS FOR COMPLEXITY
    if (g.segmentation > 0.5 && g.limbCount > 0.6 && g.rigidity > 0.4) {
        return 'arthropod_walker';
    }

    let basePlan: BodyPlan = 'ovoid_generalist';
    // 1. Sessile (Reef) - Rare, only if very low movement
    if (g.locomotionMode < 0.15) basePlan = 'sessile_reef';

    // 2. Segmented / Arthropod - VERY COMMON
    // Lowered threshold from 0.6 to 0.3
    if (
        g.segmentation > 0.45 &&
        g.limbCount > 0.55 &&
        g.rigidity > 0.45 &&
        g.symmetry > 0.55 &&
        g.locomotionMode > 0.3
    ) {
        basePlan = 'arthropod_walker';
    } else if (g.segmentation > 0.35) {
        basePlan = 'segmented_crawler';
    }

    // 3. Cephalopod - If flexible and swimming
    if (g.locomotionMode > 0.6 && g.limbCount < 0.5) {
        basePlan = 'cephalopod_swimmer';
    }
    if (locomotion === 'fly') {
        return limbType === 'wing' ? 'arthropod_walker' : 'segmented_crawler';
    }
    return basePlan;
}

function determineLocomotion(g: Genome, plan: BodyPlan) {
    if (g.segmentation > 0.5 && g.limbCount > 0.6 && g.rigidity > 0.4) {
        return 'walk';
    }
    if (plan === 'sessile_reef') return 'sessile';
    if (plan === 'cephalopod_swimmer') return 'swim';

    if (
        g.locomotionMode > 0.8 &&
        g.limbCount > 0.45 &&
        g.limbLength > 0.5 &&
        g.rigidity > 0.5
    ) {
        return 'fly';
    }
    if (g.rigidity > 0.4) return 'walk';
    return 'swim';
}
