import {
    BodyPlan,
    Environment,
    EnvironmentHistory,
    EyePlacement,
    Genome,
    LimbType,
    LocomotionType,
    Phenotype,
    SkinType,
} from "./types";
import { BIOME_TABLE, getBiomeConstraints } from "./biomes";

type BiomeConstraints = {
    bodyPlanWeights?: Partial<Record<BodyPlan, number>>;
    locomotionWeights?: Partial<Record<LocomotionType, number>>;
    limbTypeWeights?: Partial<Record<LimbType, number>>;
    skinWeights?: Partial<Record<SkinType, number>>;
    sensoryBias?: Partial<Record<"vision" | "chemo" | "mechano" | "thermo", number>>;
    surfaceBias?: Partial<Record<"fur" | "armor" | "slime" | "camo" | "ornament", number>>;
    limbBias?: Partial<Record<"leg" | "fin" | "wing" | "tentacle", number>>;
    scaleBias?: Partial<Record<"size" | "x" | "y" | "z" | "limbLength", number>>;
    patchBias?: number;
};

/**
 * Deterministically maps a Genome + Environment History to a specific Phenotype.
 * This is the "Renderer Input".
 */
export function derivePhenotype(genome: Genome, env: Environment): Phenotype {
    const biome = env.biome ?? "temperate";
    const history = env.history ?? buildFallbackHistory(env);
    const constraints = getBiomeConstraints(biome) as BiomeConstraints;
    const weightSource = constraints as BiomeConstraints & {
        weights?: {
            bodyPlan?: Partial<Record<BodyPlan, number>>;
            locomotion?: Partial<Record<LocomotionType, number>>;
            limbType?: Partial<Record<LimbType, number>>;
            skin?: Partial<Record<SkinType, number>>;
        };
    };
    const bodyPlanWeights = weightSource.bodyPlanWeights ?? weightSource.weights?.bodyPlan ?? {};
    const locomotionWeights = weightSource.locomotionWeights ?? weightSource.weights?.locomotion ?? {};
    const limbTypeWeights = weightSource.limbTypeWeights ?? weightSource.weights?.limbType ?? {};
    const skinWeights = weightSource.skinWeights ?? weightSource.weights?.skin ?? {};
    const sensoryBias = constraints.sensoryBias ?? {};
    const surfaceBias = constraints.surfaceBias ?? {};
    const limbBias = constraints.limbBias ?? {};
    const patchBias = constraints.patchBias ?? 0;
    // 1. Determine Body Plan (Basins of Attraction)
    // We map the 20d genome space into discrete basins.
    const baseBodyPlan = determineBodyPlan(genome, bodyPlanWeights);

    // 2. Derive Locomotion
    let locomotion = determineLocomotion(genome, baseBodyPlan, locomotionWeights);

    // Limb Type
    let limbType = determineLimbType(genome, locomotion, baseBodyPlan, limbTypeWeights);

    let bodyPlan = determineBodyPlan(genome, bodyPlanWeights, locomotion, limbType);

    // 3. Derive Appendages (Budgeted)
    const rawLimbPairs = Math.floor(genome.limbCount * 6);
    const rawSegmentCount = Math.max(1, Math.floor(genome.segmentation * 8));
    let limbPairs = rawLimbPairs;
    let segmentCount = rawSegmentCount;

    if (bodyPlan === 'arthropod_walker' && rawLimbPairs < 3) {
        bodyPlan = rawSegmentCount >= 2 ? 'segmented_crawler' : 'ovoid_generalist';
    }

    const sensory = allocateSensoryBudget(genome, biome, history, sensoryBias);
    let senseVision = sensory.vision;
    const antennaeCount = getAntennaeCount(sensory.mechano, sensory.chemo);
    const whiskerCount = getWhiskerCount(sensory.mechano);
    const mouthPresence = clamp01(genome.feedingStrategy * 0.6 + genome.aggression * 0.4);

    const limbBudget = clamp01(genome.limbCount);
    const limbShares = allocateLimbShares(genome, locomotion, limbType, biome, limbBias, locomotionWeights);
    const totalPairs = clampInt(Math.round(limbBudget * 6), 0, 6);
    const limbAlloc = allocatePairs(totalPairs, limbShares);
    let legPairs = limbAlloc.leg;
    let finPairs = limbAlloc.fin;
    let wingPairs = limbAlloc.wing;
    let tentaclePairs = limbAlloc.tentacle;

    if (locomotion !== 'fly' && locomotion !== 'glide') {
        wingPairs = 0;
    }
    if (locomotion !== 'swim' && limbType !== 'fin') {
        finPairs = 0;
    }

    if (locomotion !== 'walk') {
        const totalPairsActual = legPairs + finPairs + wingPairs + tentaclePairs;
        const typeScores: Record<LimbType, number> = {
            leg: legPairs,
            fin: finPairs,
            wing: wingPairs,
            tentacle: tentaclePairs,
            cilia: totalPairsActual === 0 ? 1 : 0,
        };
        limbType = pickMax(typeScores);
    }

    let rigidity = genome.rigidity;
    const flightPreference = locomotion;

    const surface = allocateSurfaceBudget(genome, biome, history, surfaceBias);
    const armorPlates = surface.armor;
    const furAmount = surface.fur;
    const slimeAmount = surface.slime;
    const camouflageAmount = surface.camo;
    const ornamentation = surface.ornament;

    const wetSheen = clamp01(Math.max(slimeAmount, genome.waterRetention * 0.6));
    const roughness = clamp01(0.2 + rigidity * 0.5 + armorPlates * 0.25 - slimeAmount * 0.2);

    // Derive Skin Type
    let skinType: SkinType = determineSkinType(genome, locomotion, skinWeights);
    if (slimeAmount > armorPlates && slimeAmount > furAmount && slimeAmount > 0.35) {
        skinType = "slimy";
    }
    if (armorPlates > 0.45) {
        skinType = "plated";
    }

    const isWalker = locomotion === "walk" || bodyPlan === "arthropod_walker";
    const isSwimmer = locomotion === "swim" || bodyPlan === "cephalopod_swimmer";
    const isFlyer = locomotion === "fly" || locomotion === "glide";
    const isSessile = bodyPlan === "sessile_reef";

    if (isWalker) {
        bodyPlan = "arthropod_walker";
        locomotion = "walk";
        limbType = "leg";
        legPairs = Math.max(3, legPairs);
        finPairs = 0;
        wingPairs = 0;
        tentaclePairs = 0;
        segmentCount = Math.max(3, segmentCount);
        rigidity = Math.max(rigidity, 0.35);
        senseVision = Math.max(senseVision, 0.25);
    } else if (isSwimmer) {
        locomotion = "swim";
        limbType = bodyPlan === "cephalopod_swimmer" ? "tentacle" : "fin";
        if (limbType === "tentacle") {
            tentaclePairs = Math.max(3, tentaclePairs);
            finPairs = 0;
        } else {
            finPairs = Math.max(2, finPairs);
            tentaclePairs = 0;
        }
        legPairs = 0;
        wingPairs = 0;
        segmentCount = Math.max(2, segmentCount);
        senseVision = Math.max(senseVision, 0.2);
    } else if (isFlyer) {
        locomotion = flightPreference === "fly" ? "fly" : "glide";
        limbType = "wing";
        wingPairs = Math.max(1, wingPairs);
        finPairs = 0;
        tentaclePairs = 0;
    } else if (isSessile) {
        bodyPlan = "sessile_reef";
        locomotion = "sessile";
        limbPairs = 0;
        legPairs = 0;
        finPairs = 0;
        wingPairs = 0;
        tentaclePairs = 0;
    }

    limbPairs = legPairs + finPairs + wingPairs + tentaclePairs;

    let eyesCount = getEyesCount(senseVision);
    let eyesSize = clamp01(0.2 + senseVision * 0.8);
    if (isWalker) {
        eyesCount = Math.max(eyesCount, 2);
        eyesSize = Math.max(eyesSize, 0.12);
    } else if (isSwimmer) {
        eyesCount = Math.max(eyesCount, 2);
        eyesSize = Math.max(eyesSize, 0.1);
    }
    const eyesPlacement = getEyesPlacement(senseVision, locomotion, biome);

    const baseScale = 0.25 + Math.pow(genome.bodySize, 1.2) * 3.0;
    const biomeScale = getBiomeScale(constraints);
    const axialMultiplier: Record<BodyPlan, [number, number, number]> = {
        sessile_reef: [1.05, 0.7, 1.05],
        segmented_crawler: [1.15, 0.85, 1.1],
        arthropod_walker: [1.25, 0.8, 1.05],
        cephalopod_swimmer: [0.9, 1.1, 1.25],
        ovoid_generalist: [1, 1, 1],
    };

    const streamlining = clamp01(
        (locomotion === 'swim' ? 0.6 : 0.2) +
            genome.locomotionMode * 0.2 +
            (1 - armorPlates) * 0.2,
    );
    const bodyAspectRatio = clamp01(
        (locomotion === 'swim' ? 0.75 : 0.45) +
            (1 - genome.symmetry) * 0.1 +
            (segmentCount / 8) * 0.2,
    );

    const axialScale: [number, number, number] = [
        baseScale *
            biomeScale.size *
            axialMultiplier[bodyPlan][0] *
            biomeScale.x *
            lerp(0.85, 1.35, bodyAspectRatio),
        baseScale *
            biomeScale.size *
            axialMultiplier[bodyPlan][1] *
            biomeScale.y *
            (genome.symmetry > 0.6 ? 1 : 0.8) *
            lerp(1.2, 0.85, bodyAspectRatio),
        baseScale * biomeScale.size * axialMultiplier[bodyPlan][2] * biomeScale.z,
    ];

    if (bodyPlan === 'arthropod_walker' && axialScale[0] <= axialScale[1]) {
        axialScale[0] = axialScale[1] * 1.15;
    }
    if (locomotion === "swim") {
        axialScale[0] *= 1.15;
        axialScale[1] *= 0.85;
        axialScale[2] *= 1.1;
    }

    let tailLength =
        locomotion === 'swim' || locomotion === 'glide'
            ? clamp01(streamlining * 0.8 + genome.limbLength * 0.1)
            : 0;
    if (locomotion === "swim") {
        tailLength = Math.max(0.2, tailLength);
    }
    const tailFinSize = locomotion === 'swim' ? clamp01(Math.max(0.2, streamlining * 0.9)) : 0;
    let wingArea =
        (locomotion === "fly" || locomotion === "glide" ? 1 : 0) *
        clamp01(wingPairs / 4) *
        clamp01(genome.limbLength + 0.2);
    if (locomotion === "fly") {
        wingArea = Math.max(0.25, wingArea);
    } else if (locomotion === "glide") {
        wingArea = Math.max(0.12, wingArea);
    }

    return {
        bodyPlan,
        skinType,
        biome,
        envHistory: history,
        axialScale,
        segmentCount,
        asymmetry: 1 - genome.symmetry,
        rigidity,

        locomotion,
        limbPairs,
        limbType,
        limbLength: (2.0 + genome.limbLength * 6.0) * biomeScale.limbLength,
        limbThickness: Math.max(0.3, 0.2 + rigidity * 0.3),
        legPairs,
        finPairs,
        wingPairs,
        tentaclePairs,
        tailLength,
        tailFinSize,

        patchCoverage: clamp01(genome.waterRetention * 0.6 + camouflageAmount * 0.2 + patchBias * 0.4),
        veinVisibility: genome.metabolicRate,
        poreScale: genome.respirationType,
        wetSheen,
        roughness,
        armorPlates,
        furAmount,
        slimeAmount,
        camouflageAmount,

        breathRate: 0.2 + genome.metabolicRate,
        breathAmplitude: 0.1 + genome.respirationType * 0.2,
        gaitRate: 0.2 + genome.locomotionMode + genome.metabolicRate,
        motionIntensity: genome.aggression,

        ornamentation,
        broodPouches: genome.reproductionStrategy,
        eyeCount: eyesCount,
        eyeSize: eyesSize,
        eyesPlacement,
        antennaeCount,
        whiskerCount,
        mouthPresence,
        senseVision,
        senseChemo: sensory.chemo,
        senseMechano: sensory.mechano,
        senseThermo: sensory.thermo,
        senseElectro: sensory.electro,
        streamlining,
        bodyAspectRatio,
        wingArea,
    };
}

function determineBodyPlan(
    g: Genome,
    weights: Partial<Record<BodyPlan, number>>,
    locomotion?: LocomotionType,
    limbType?: LimbType,
): BodyPlan {
    const scores: Record<BodyPlan, number> = {
        sessile_reef: (1 - g.locomotionMode) * 1.2 + (1 - g.limbCount) * 0.4,
        segmented_crawler: g.segmentation * 1.0 + g.limbCount * 0.2 + (1 - g.rigidity) * 0.2,
        arthropod_walker:
            g.segmentation * 1.1 +
            g.limbCount * 1.0 +
            g.rigidity * 0.9 +
            g.symmetry * 0.5 +
            g.locomotionMode * 0.4,
        cephalopod_swimmer:
            (1 - g.rigidity) * 0.6 +
            g.limbLength * 0.6 +
            g.locomotionMode * 0.4 +
            (1 - g.segmentation) * 0.2,
        ovoid_generalist:
            0.35 + (1 - g.segmentation) * 0.3 + (1 - g.limbCount) * 0.2,
    };

    if (locomotion === 'sessile') {
        scores.sessile_reef += 0.45;
    }
    if (locomotion === 'swim') {
        scores.cephalopod_swimmer += 0.25;
    }
    if (locomotion === 'walk') {
        scores.arthropod_walker += 0.2;
    }
    if (locomotion === 'fly') {
        if (limbType === 'wing') {
            scores.arthropod_walker += 0.35;
        } else {
            scores.segmented_crawler += 0.15;
        }
    }

    applyWeights(scores, weights);
    return pickMax(scores);
}

function determineLocomotion(
    g: Genome,
    plan: BodyPlan,
    weights: Partial<Record<LocomotionType, number>>,
): LocomotionType {
    const scores: Record<LocomotionType, number> = {
        sessile: (1 - g.locomotionMode) * 1.2 + (1 - g.limbCount) * 0.4,
        swim: (1 - g.rigidity) * 0.6 + g.locomotionMode * 0.5 + (1 - g.limbCount) * 0.2,
        crawl: g.segmentation * 0.5 + (1 - g.rigidity) * 0.3 + g.limbCount * 0.2,
        walk: g.rigidity * 0.6 + g.limbCount * 0.6 + g.segmentation * 0.4 + g.locomotionMode * 0.3,
        glide: g.limbLength * 0.6 + g.locomotionMode * 0.4 + (1 - g.bodySize) * 0.2,
        fly: g.locomotionMode * 0.7 + g.limbLength * 0.6 + g.rigidity * 0.4,
        burrow: g.rigidity * 0.6 + g.bodySize * 0.3 + (1 - g.limbLength) * 0.2,
    };

    if (plan === 'sessile_reef') scores.sessile += 0.6;
    if (plan === 'cephalopod_swimmer') scores.swim += 0.4;
    if (plan === 'arthropod_walker') scores.walk += 0.35;

    applyWeights(scores, weights);
    return pickMax(scores);
}

function determineLimbType(
    g: Genome,
    locomotion: LocomotionType,
    plan: BodyPlan,
    weights: Partial<Record<LimbType, number>>,
): LimbType {
    const scores: Record<LimbType, number> = {
        leg:
            g.rigidity * 0.5 +
            g.limbCount * 0.6 +
            (locomotion === 'walk' || locomotion === 'crawl' || locomotion === 'burrow' ? 0.4 : 0),
        wing:
            g.limbLength * 0.7 +
            g.locomotionMode * 0.4 +
            (locomotion === 'fly' || locomotion === 'glide' ? 0.5 : 0),
        fin:
            (1 - g.rigidity) * 0.3 +
            g.limbLength * 0.4 +
            (locomotion === 'swim' ? 0.4 : 0),
        tentacle:
            (1 - g.rigidity) * 0.5 +
            g.limbLength * 0.6 +
            (locomotion === 'swim' ? 0.2 : 0),
        cilia:
            (1 - g.bodySize) * 0.4 +
            (locomotion === 'sessile' ? 0.5 : 0),
    };

    if (plan === 'cephalopod_swimmer') scores.tentacle += 0.35;
    if (plan === 'arthropod_walker') scores.leg += 0.35;

    applyWeights(scores, weights);
    return pickMax(scores);
}

function determineSkinType(
    g: Genome,
    locomotion: LocomotionType,
    weights: Partial<Record<SkinType, number>>,
): SkinType {
    const scores: Record<SkinType, number> = {
        slimy: g.waterRetention * 0.8 + (1 - g.rigidity) * 0.2,
        soft: (1 - g.rigidity) * 0.6 + g.waterRetention * 0.2,
        scaly: g.rigidity * 0.5 + g.segmentation * 0.3,
        plated: g.rigidity * 0.8 + g.bodySize * 0.2,
    };

    if (locomotion === 'burrow') scores.plated += 0.15;
    applyWeights(scores, weights);
    return pickMax(scores);
}

function applyWeights<T extends string>(
    scores: Record<T, number>,
    weights?: Partial<Record<T, number>>,
) {
    if (!weights) return;
    (Object.keys(scores) as T[]).forEach((key) => {
        const weight = weights[key];
        if (weight === undefined) return;
        scores[key] *= weight;
    });
}

function pickMax<T extends string>(scores: Record<T, number>): T {
    const keys = Object.keys(scores) as T[];
    let bestKey = keys[0];
    let bestScore = scores[bestKey];
    keys.slice(1).forEach((key) => {
        const score = scores[key];
        if (score > bestScore) {
            bestKey = key;
            bestScore = score;
        }
    });
    return bestKey;
}

export function classifyCreature(
    phenotype: Phenotype,
): { stageLabel: string; creatureLabel: string } {
    if (
        phenotype.bodyPlan === "arthropod_walker" &&
        phenotype.locomotion === "walk" &&
        phenotype.limbType === "leg" &&
        phenotype.limbPairs >= 3
    ) {
        return { stageLabel: "Walker", creatureLabel: "Arthropod Walker" };
    }
    if (
        phenotype.locomotion === "fly" ||
        phenotype.locomotion === "glide" ||
        phenotype.limbType === "wing"
    ) {
        return { stageLabel: "Flyer", creatureLabel: "Flyer" };
    }
    if (phenotype.locomotion === "swim") {
        return { stageLabel: "Swimmer", creatureLabel: "Swimmer" };
    }
    if (phenotype.bodyPlan === "sessile_reef") {
        return { stageLabel: "Sessile", creatureLabel: "Sessile Reef" };
    }
    if (phenotype.bodyPlan === "segmented_crawler") {
        return { stageLabel: "Crawler", creatureLabel: "Segmented Crawler" };
    }
    return { stageLabel: "Generalist", creatureLabel: "Ovoid Generalist" };
}

function allocateSensoryBudget(
    g: Genome,
    biome: string,
    history: EnvironmentHistory,
    bias: Partial<Record<"vision" | "chemo" | "mechano" | "thermo", number>>,
): { vision: number; chemo: number; mechano: number; thermo: number; electro: number } {
    const raw = {
        vision: clamp01(g.lightSensitivity + (bias.vision ?? 0)),
        chemo: clamp01(g.chemicalSensitivity + (bias.chemo ?? 0)),
        mechano: clamp01(g.proximityAwareness + (bias.mechano ?? 0)),
        thermo: clamp01(g.thermoregulation + (bias.thermo ?? 0)),
        electro: clamp01(g.waterRetention * 0.6 + history.avgVolatility * 0.4),
    };

    return normalizeBudget(raw);
}

function allocateLimbShares(
    g: Genome,
    locomotion: LocomotionType,
    limbType: LimbType,
    biome: string,
    bias: Partial<Record<"leg" | "fin" | "wing" | "tentacle", number>>,
    locomotionWeights: Partial<Record<LocomotionType, number>>,
): { leg: number; fin: number; wing: number; tentacle: number } {
    const base = {
        leg: g.rigidity * 0.4 + (locomotion === 'walk' || locomotion === 'crawl' || locomotion === 'burrow' ? 0.7 : 0.2),
        fin: (1 - g.rigidity) * 0.25 + (locomotion === 'swim' ? 0.7 : 0.2),
        wing: g.limbLength * 0.3 + (locomotion === 'fly' || locomotion === 'glide' ? 0.8 : 0.15),
        tentacle: (1 - g.rigidity) * 0.35 + (locomotion === 'swim' ? 0.45 : 0.15),
    };
    const limbTypeBoost: Partial<typeof base> = {
        leg: limbType === 'leg' ? 1.25 : 1,
        fin: limbType === 'fin' ? 1.2 : 1,
        wing: limbType === 'wing' ? 1.25 : 1,
        tentacle: limbType === 'tentacle' ? 1.2 : 1,
    };
    const weighted = applyMultiplier(base, limbTypeBoost);
    const biased = applyMultiplier(weighted, bias);
    const locomotionBias: Partial<typeof base> =
        locomotion === "fly" || locomotion === "glide"
            ? { wing: locomotionWeights.fly ?? locomotionWeights.glide }
            : locomotion === "swim"
                ? { fin: locomotionWeights.swim }
                : locomotion === "walk" || locomotion === "crawl"
                    ? { leg: locomotionWeights.walk ?? locomotionWeights.crawl }
                    : {};
    const tuned = applyMultiplier(biased, locomotionBias);
    return normalizeBudget(tuned);
}

function allocateSurfaceBudget(
    g: Genome,
    biome: string,
    history: EnvironmentHistory,
    bias: Partial<Record<"fur" | "armor" | "slime" | "camo" | "ornament", number>>,
): { armor: number; fur: number; slime: number; camo: number; ornament: number } {
    const raw = {
        armor: clamp01(g.rigidity + (bias.armor ?? 0)),
        fur: clamp01((1 - g.waterRetention) * (1 - (history.avgTemp + 1) * 0.5) + (bias.fur ?? 0)),
        slime: clamp01(g.waterRetention + (bias.slime ?? 0)),
        camo: clamp01(g.proximityAwareness * 0.6 + (1 - g.aggression) * 0.4 + (bias.camo ?? 0)),
        ornament: clamp01(g.sociality + (bias.ornament ?? 0)),
    };
    return normalizeBudget(raw);
}

function allocatePairs(
    totalPairs: number,
    shares: { leg: number; fin: number; wing: number; tentacle: number },
): { leg: number; fin: number; wing: number; tentacle: number } {
    const entries = Object.entries(shares).map(([key, value]) => ({
        key,
        value,
        floor: Math.floor(value * totalPairs),
        frac: value * totalPairs - Math.floor(value * totalPairs),
    }));
    let remaining = totalPairs - entries.reduce((acc, entry) => acc + entry.floor, 0);
    entries.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < entries.length && remaining > 0; i += 1) {
        entries[i].floor += 1;
        remaining -= 1;
    }
    const result = { leg: 0, fin: 0, wing: 0, tentacle: 0 };
    entries.forEach((entry) => {
        (result as Record<string, number>)[entry.key] = entry.floor;
    });
    return result;
}

function applyMultiplier<T extends Record<string, number>>(
    values: T,
    multipliers: Partial<Record<keyof T, number>>,
): T {
    const next: T = { ...values };
    (Object.keys(next) as Array<keyof T>).forEach((key) => {
        const mult = multipliers[key];
        if (mult === undefined) return;
        next[key] = (next[key] as number) * mult as T[typeof key];
    });
    return next;
}

function normalizeBudget<T extends Record<string, number>>(values: T): T {
    const total = Object.values(values).reduce((acc, value) => acc + value, 0);
    if (total <= 1e-6) return values;
    const scale = total > 1 ? 1 / total : 1;
    const next: T = { ...values };
    (Object.keys(next) as Array<keyof T>).forEach((key) => {
        next[key] = clamp01((next[key] as number) * scale) as T[typeof key];
    });
    return next;
}

function getEyesCount(vision: number): number {
    if (vision < 0.12) return 0;
    return clampInt(Math.round(2 + vision * 6), 1, 8);
}

function getEyesPlacement(vision: number, locomotion: LocomotionType, biome: string): EyePlacement {
    if (vision < 0.25) return 'lateral';
    if (locomotion === 'fly' || locomotion === 'walk') return 'forward';
    const isMarine =
        biome.startsWith("marine_") ||
        biome.includes("ocean") ||
        biome.includes("reef") ||
        biome.includes("intertidal");
    const isFreshwater =
        biome.startsWith("freshwater_") ||
        biome.includes("river") ||
        biome.includes("lake") ||
        biome.includes("wetland");
    if ((isMarine || isFreshwater) && vision < 0.6) return 'lateral';
    if (vision > 0.75) return 'stalk';
    return 'forward';
}

function getAntennaeCount(mechano: number, chemo: number): number {
    const score = mechano * 0.6 + chemo * 0.4;
    if (score < 0.2) return 0;
    return clampInt(Math.round(2 + score * 4), 2, 6);
}

function getWhiskerCount(mechano: number): number {
    if (mechano < 0.25) return 0;
    return clampInt(Math.round(2 + mechano * 6), 2, 8);
}

function buildFallbackHistory(env: Environment): EnvironmentHistory {
    const biomes = Object.keys(BIOME_TABLE) as Array<keyof EnvironmentHistory["biomeMix"]>;
    const baseMix = Object.fromEntries(biomes.map((biome) => [biome, 0])) as Record<
        keyof EnvironmentHistory["biomeMix"],
        number
    >;
    return {
        biomeMix: {
            ...baseMix,
            [env.biome]: 1,
        },
        avgTemp: env.temperature,
        avgVolatility: env.volatility,
        travelIntensity: env.travelRate,
        interactionRate: env.proximityDensity,
    };
}

function getBiomeScale(
    constraints: BiomeConstraints,
): { size: number; x: number; y: number; z: number; limbLength: number } {
    const scaleSource = constraints as BiomeConstraints & {
        axialScale?: Partial<Record<"size" | "x" | "y" | "z" | "limbLength", number>>;
        scale?: Partial<Record<"size" | "x" | "y" | "z" | "limbLength", number>>;
    };
    const scale = scaleSource.scaleBias ?? scaleSource.axialScale ?? scaleSource.scale ?? {};
    return {
        size: clamp(scale.size ?? 1, 0.85, 1.25),
        x: clamp(scale.x ?? 1, 0.85, 1.25),
        y: clamp(scale.y ?? 1, 0.85, 1.25),
        z: clamp(scale.z ?? 1, 0.85, 1.25),
        limbLength: clamp(scale.limbLength ?? 1, 0.85, 1.25),
    };
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.floor(value)));
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

// Dev check (manual):
// - env.biome = "marine_coral_reef": expect swim + fin/tentacle bias + higher ornamentation
// - env.biome = "tundra": expect walk/crawl bias + higher furAmount + shorter limbLength
// - env.biome = "temperate_rainforest": expect glide/fly bias + higher eyeCount/eyeSize
