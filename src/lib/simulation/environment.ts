import { Environment } from "./types";

/**
 * Creates a default environment snapshot or samples from real data (simulated for now).
 */
export function createCycleEnvironment(prevEnv?: Environment): Environment {
    const t = Date.now() / 10000; // Mock time

    // 1. Base Seasons (slow cycle)
    const season = (Math.sin(t * 0.01) + 1) / 2;

    // 2. Circadian (fast cycle)
    const circadianPhase = (Math.sin(t * 1.0) + 1) / 2;

    // 3. Volatility (random fluctuations)
    const volatility = prevEnv ? clamp(prevEnv.volatility + (Math.random() - 0.5) * 0.1, 0, 1) : 0.2;

    // 4. Derive physical properties
    // Temperature: High in summer (season=1), Low in winter. Drops at night (circadian<0.5).
    let temperature = lerp(-0.8, 0.8, season);
    temperature += (circadianPhase - 0.5) * 0.3;
    temperature += (Math.random() - 0.5) * volatility;
    temperature = clamp(temperature, -1, 1);

    // Humidity: Inverse to temp usually, but random here for biome variety
    const humidity = clamp(0.5 + (Math.random() - 0.5) * volatility, 0, 1);

    // Wind: Higher volatility = higher wind
    const wind = clamp(volatility * 0.8 + Math.random() * 0.2, 0, 1);

    // Sunlight: Follows circadian
    let sunlight = circadianPhase;
    // Reduce sunlight if high humidity (clouds)
    if (humidity > 0.7) sunlight *= 0.6;

    return {
        temperature,
        humidity,
        wind,
        sunlight,
        season,
        circadianPhase,
        travelRate: 0, // Mock: would come from GPS speed
        proximityDensity: 0, // Mock: would come from Bluetooth/Network
        volatility
    };
}

// Helpers
function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function clamp(x: number, min: number, max: number) {
    return Math.min(Math.max(x, min), max);
}
