import React, { useMemo } from 'react';
import { Sparkles, Cloud, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Environment } from '../../lib/simulation/types';

interface EnvironmentRendererProps {
    env: Environment;
}

export default function EnvironmentRenderer({ env }: EnvironmentRendererProps) {
    // warm/cool colors based on temperature
    // -1 (cold) -> Blue/White, 1 (hot) -> Red/Orange
    const skyColor = useMemo(() => {
        const cold = new THREE.Color('#1a2a6c');   // Deep cold blue
        const neutral = new THREE.Color('#2b32b2'); // Mid blue
        const hot = new THREE.Color('#fdbb2d');    // Warm orange

        const c = new THREE.Color().copy(neutral);
        if (env.temperature < 0) {
            c.lerp(cold, Math.abs(env.temperature));
        } else {
            c.lerp(hot, env.temperature);
        }

        // Darken at night (Circadian < 0.5 is night-ish? In our sim 0..1 is cycle. 
        // Let's assume 0.0-0.5 is Day, 0.5-1.0 is Night for visual contrast
        const brightness = 0.2 + 0.8 * env.sunlight;
        c.multiplyScalar(brightness);

        return c;
    }, [env.temperature, env.sunlight]);

    const fogDensity = useMemo(() => 0.02 + env.humidity * 0.08, [env.humidity]);

    // Lighting
    // Sun position moves with circadianPhase
    const sunPos = useMemo(() => {
        const r = 20;
        const theta = env.circadianPhase * Math.PI * 2;
        return [Math.cos(theta) * r, Math.sin(theta) * r, 10];
    }, [env.circadianPhase]);

    return (
        <group>
            <color attach="background" args={[skyColor]} />
            <fogExp2 attach="fog" args={[skyColor, fogDensity]} />
            {/* Dynamic Light */}
            <directionalLight
                position={sunPos as [number, number, number]}
                intensity={1.0 + env.sunlight}
                color={env.temperature > 0.5 ? "#xffaa0" : "#ffffff"}
                castShadow
            />
            <ambientLight intensity={0.2 + env.sunlight * 0.3} />

            {/* Particles / Plankton / Dust */}
            <Sparkles
                count={100}
                scale={12}
                size={2}
                speed={0.4}
                opacity={0.5}
                color={env.temperature < 0 ? "#a0c0ff" : "#fffae0"}
            />

            {/* Clouds if humid */}
            {env.humidity > 0.6 && (
                <group position={[0, 5, -5]}>
                    <Cloud opacity={0.5} speed={0.4} bounds={[10, 3, 1.5]} segments={20} />
                </group>
            )}

            {/* Stars at night */}
            {env.sunlight < 0.2 && (
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            )}
        </group>
    );
}
