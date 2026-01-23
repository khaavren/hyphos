import { BiomeType, Environment, EnvironmentHistory } from "./types";
import { BIOME_TABLE, getBiomeConstraints } from "./biomes";

const BIOME_IDS = Object.keys(BIOME_TABLE) as BiomeType[];

const pickBiome = (rng: () => number, current?: BiomeType, neighbors?: BiomeType[]) => {
    if (!current) {
        return BIOME_IDS[Math.floor(rng() * BIOME_IDS.length)];
    }
    const pool =
        neighbors && neighbors.length > 0
            ? neighbors.filter((b) => b !== current)
            : BIOME_IDS.filter((b) => b !== current);
    if (pool.length === 0) return current;
    return pool[Math.floor(rng() * pool.length)];
};

const mulberry32 = (seed: number) => {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = t;
        r = Math.imul(r ^ (r >>> 15), r | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

/**
 * Creates a default environment snapshot or samples from real data (simulated for now).
 */
export function createCycleEnvironment(
    prevEnv?: Environment,
    options: { biome?: BiomeType; lockBiome?: boolean } = {},
): Environment {
    const t = Date.now() / 10000; // Mock time
    const seed = (prevEnv as { seed?: number } | undefined)?.seed;
    const rand = seed !== undefined ? mulberry32(seed + Math.floor(t * 1000)) : Math.random;

    // 1. Base Seasons (slow cycle)
    const season = (Math.sin(t * 0.01) + 1) / 2;

    // 2. Circadian (fast cycle)
    const circadianPhase = (Math.sin(t * 1.0) + 1) / 2;

    // 3. Volatility (random fluctuations)
    const volatility = prevEnv
        ? clamp(prevEnv.volatility + (rand() - 0.5) * 0.1, 0, 1)
        : 0.2;

    // 4. Derive physical properties
    // Temperature: High in summer (season=1), Low in winter. Drops at night (circadian<0.5).
    let temperature = lerp(-0.8, 0.8, season);
    temperature += (circadianPhase - 0.5) * 0.3;
    temperature += (rand() - 0.5) * volatility;
    temperature = clamp(temperature, -1, 1);

    // Humidity: Inverse to temp usually, but random here for biome variety
    let humidity = clamp(0.5 + (rand() - 0.5) * volatility, 0, 1);

    // Wind: Higher volatility = higher wind
    let wind = clamp(volatility * 0.8 + rand() * 0.2, 0, 1);

    // Sunlight: Follows circadian
    let sunlight = circadianPhase;
    // Reduce sunlight if high humidity (clouds)
    if (humidity > 0.7) sunlight *= 0.6;

    const travelRate = prevEnv
        ? clamp(prevEnv.travelRate + (rand() - 0.5) * 0.08, 0, 1)
        : 0;
    const lockBiome = options.lockBiome ?? false;
    const baseBiome = options.biome ?? prevEnv?.biome ?? pickBiome(rand);
    const biomeDrift = clamp(travelRate * 0.6 + volatility * 0.4, 0, 1);
    const changeChance = lockBiome
        ? 0
        : clamp(0.08 + biomeDrift * 0.22, 0, 0.35);
    const baseConstraints = getBiomeConstraints(baseBiome) as {
        neighbors?: BiomeType[];
        adjacent?: BiomeType[];
        adjacency?: BiomeType[];
        environment?: Partial<Pick<Environment, "temperature" | "humidity" | "wind" | "sunlight">>;
        climate?: Partial<Pick<Environment, "temperature" | "humidity" | "wind" | "sunlight">>;
    };
    const neighborList =
        baseConstraints.neighbors ??
        baseConstraints.adjacent ??
        baseConstraints.adjacency ??
        [];
    const biome = lockBiome
        ? baseBiome
        : rand() < changeChance
            ? pickBiome(rand, baseBiome, neighborList)
            : baseBiome;
    const constraints = getBiomeConstraints(biome) as {
        environment?: Partial<Pick<Environment, "temperature" | "humidity" | "wind" | "sunlight">>;
        climate?: Partial<Pick<Environment, "temperature" | "humidity" | "wind" | "sunlight">>;
    };
    const envBias = constraints.environment ?? constraints.climate ?? {};

    if (envBias.temperature !== undefined) {
        temperature = lerp(temperature, envBias.temperature, 0.45);
    }
    if (envBias.humidity !== undefined) {
        humidity = clamp(lerp(humidity, envBias.humidity, 0.5), 0, 1);
    }
    if (envBias.wind !== undefined) {
        wind = clamp(lerp(wind, envBias.wind, 0.4), 0, 1);
    }
    if (envBias.sunlight !== undefined) {
        sunlight = clamp(lerp(sunlight, envBias.sunlight, 0.4), 0, 1);
    }

    if (biome === "desert") {
        temperature = clamp(temperature + (rand() - 0.5) * volatility * 0.4, -1, 1);
    }

    const proximityDensity = prevEnv?.proximityDensity ?? 0;
    const interactionRate = clamp(proximityDensity, 0, 1);
    const history = updateHistory(prevEnv?.history, {
        biome,
        temperature,
        volatility,
        travelRate,
        proximityDensity,
    });

    return {
        temperature,
        humidity,
        wind,
        sunlight,
        season,
        circadianPhase,
        travelRate,
        proximityDensity,
        volatility,
        biome,
        biomePrev: prevEnv?.biome,
        biomeDrift,
        interactionRate,
        history,
    };
}

// Helpers
function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function clamp(x: number, min: number, max: number) {
    return Math.min(Math.max(x, min), max);
}

function updateHistory(
    prev: EnvironmentHistory | undefined,
    current: {
        biome: BiomeType;
        temperature: number;
        volatility: number;
        travelRate: number;
        proximityDensity: number;
    },
): EnvironmentHistory {
    const alpha = 0.08;
    const baseMix = Object.fromEntries(
        BIOME_IDS.map((biome) => [biome, 0]),
    ) as Record<BiomeType, number>;
    const prevMix = prev?.biomeMix ?? baseMix;
    const mix: Record<BiomeType, number> = { ...baseMix };
    (Object.keys(prevMix) as BiomeType[]).forEach((key) => {
        mix[key] = prevMix[key] * (1 - alpha);
    });
    mix[current.biome] = (mix[current.biome] ?? 0) + alpha;
    const mixSum = Object.values(mix).reduce((acc, value) => acc + value, 0) || 1;
    (Object.keys(mix) as BiomeType[]).forEach((key) => {
        mix[key] = mix[key] / mixSum;
    });

    const avgTemp = prev ? lerp(prev.avgTemp, current.temperature, alpha) : current.temperature;
    const avgVolatility = prev
        ? lerp(prev.avgVolatility, current.volatility, alpha)
        : current.volatility;
    const travelIntensity = prev
        ? lerp(prev.travelIntensity, current.travelRate, alpha)
        : current.travelRate;
    const interactionRate = prev
        ? lerp(prev.interactionRate, current.proximityDensity, alpha)
        : current.proximityDensity;

    return {
        biomeMix: mix,
        avgTemp,
        avgVolatility,
        travelIntensity,
        interactionRate,
    };
}
