"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { SimulationSnapshot } from "../lib/graph/valueBridge";

type Symbiote3DViewProps = {
  snapshot: SimulationSnapshot | null;
  cycle: number;
  maxCycle: number;
  seed: string;
  reducedMotion: boolean;
  colorAgnostic: boolean;
  isComputing?: boolean;
};

type SymbioteSceneProps = {
  snapshot: SimulationSnapshot | null;
  cycle: number;
  maxCycle: number;
  seed: string;
  reducedMotion: boolean;
  colorAgnostic: boolean;
};

type SymbioteUniforms = Record<string, { value: number }>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const STYLE = {
  // DISP: vertex displacement range (larger values = chunkier silhouette).
  DISP_LARGE_MIN: 0.14,
  DISP_LARGE_MAX: 0.22,
  DISP_SMALL_MIN: 0.05,
  DISP_SMALL_MAX: 0.09,
  // WARP: domain warp range for shape noise.
  WARP_MIN: 0.08,
  WARP_MAX: 0.16,
  // MICRO: micro normal range for surface texture.
  MICRO_STRENGTH_MIN: 0.2,
  MICRO_STRENGTH_MAX: 0.6,
  MICRO_EPS: 0.016,
  // PATCH: moss/lichen coverage bias.
  PATCH_BASE: 0.25,
  PATCH_SCALE: 0.6,
  // VEIN: vein strength scaling.
  VEIN_SCALE: 1.2,
  // LIGHTING: wrap, scatter, and final clamp.
  LIGHT_WRAP: 0.45,
  LIGHT_SCATTER: 0.22,
  LIGHT_SCATTER_POW: 2.2,
  LIGHT_CLAMP: 0.92,
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
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

const randomUnitVector = (rng: () => number) => {
  const u = rng();
  const v = rng();
  const theta = 2 * Math.PI * u;
  const z = v * 2 - 1;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(r * Math.cos(theta), z, r * Math.sin(theta));
};

type CameraRigProps = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  reducedMotion: boolean;
};

const CameraRig = ({ zoom, minZoom, maxZoom, reducedMotion }: CameraRigProps) => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    camera.position.set(0, 0, zoom);
    camera.updateProjectionMatrix();
    controlsRef.current?.update();
  }, [camera, zoom]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom
      enableRotate={!reducedMotion}
      zoomSpeed={0.6}
      minDistance={minZoom}
      maxDistance={maxZoom}
      makeDefault
    />
  );
};

const hashSeed = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const vertexShader = `
  uniform float u_time;
  uniform float u_cycle;
  uniform float u_age;
  uniform float u_seed;
  uniform float u_stiffness;
  uniform float u_microScale;
  uniform float u_microNormalStrength;
  uniform float u_debugColorMode;

  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vPos;

  const float DISP_LARGE_MIN = ${STYLE.DISP_LARGE_MIN};
  const float DISP_LARGE_MAX = ${STYLE.DISP_LARGE_MAX};
  const float DISP_SMALL_MIN = ${STYLE.DISP_SMALL_MIN};
  const float DISP_SMALL_MAX = ${STYLE.DISP_SMALL_MAX};
  const float WARP_MIN = ${STYLE.WARP_MIN};
  const float WARP_MAX = ${STYLE.WARP_MAX};

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));

    float n00 = mix(n000, n100, f.x);
    float n10 = mix(n010, n110, f.x);
    float n01 = mix(n001, n101, f.x);
    float n11 = mix(n011, n111, f.x);
    float n0 = mix(n00, n10, f.y);
    float n1 = mix(n01, n11, f.y);
    return mix(n0, n1, f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  float ridge(float n) {
    return 1.0 - abs(n * 2.0 - 1.0);
  }

  void main() {
    float age = clamp(u_age, 0.0, 1.0);
    float early = smoothstep(0.0, 0.06, age);
    float grow = smoothstep(0.25, 1.0, age);
    float mature = smoothstep(0.6, 1.0, age);
    float warpAmp = mix(WARP_MIN, WARP_MAX, early);
    float dispAmpLarge = mix(DISP_LARGE_MIN, DISP_LARGE_MAX, early);
    float dispAmpSmall = mix(DISP_SMALL_MIN, DISP_SMALL_MAX, early);

    float bucket = floor(u_cycle / 50.0);
    float t = fract(u_cycle / 50.0);
    float seedA = u_seed + bucket * 0.13;
    float seedB = u_seed + (bucket + 1.0) * 0.13;

    vec3 pos = position;
    vec3 npos = normalize(position);
    vec3 p = pos * 2.4;
    vec3 timeOffset = vec3(0.0, u_time * 0.06, 0.0);
    vec3 warpA = vec3(
      fbm(p + vec3(seedA * 1.2, seedA * 0.7, seedA * 1.3)),
      fbm(p + vec3(seedA * 1.1, seedA * 0.3, seedA * 0.9)),
      fbm(p + vec3(seedA * 0.2, seedA * 1.3, seedA * 0.4))
    ) - 0.5;
    vec3 warpB = vec3(
      fbm(p + vec3(seedB * 1.2, seedB * 0.7, seedB * 1.3)),
      fbm(p + vec3(seedB * 1.1, seedB * 0.3, seedB * 0.9)),
      fbm(p + vec3(seedB * 0.2, seedB * 1.3, seedB * 0.4))
    ) - 0.5;
    vec3 warp = mix(warpA, warpB, t) * warpAmp;
    vec3 warpedP = p + warp * 1.25 + timeOffset;
    float nA = fbm(warpedP + vec3(seedA * 0.7));
    float nB = fbm(warpedP + vec3(seedB * 0.7));
    float n = mix(nA, nB, t);
    float nSmall = fbm(warpedP * 2.6 + vec3(seedA * 1.9));

    float lowA = fbm(p * 0.6 + vec3(seedA * 0.35, seedA * 0.2, seedA * 0.6));
    float lowB = fbm(p * 0.6 + vec3(seedB * 0.35, seedB * 0.2, seedB * 0.6));
    float low = mix(lowA, lowB, t);

    vec3 axis1 = normalize(vec3(
      sin(seedA * 1.7),
      cos(seedA * 2.1),
      sin(seedA * 0.9)
    ));
    vec3 axis2 = normalize(vec3(
      cos(seedA * 0.4),
      sin(seedA * 1.6),
      cos(seedA * 1.1)
    ));
    vec3 axis3 = normalize(vec3(
      sin(seedA * 0.9),
      sin(seedA * 0.2),
      cos(seedA * 1.7)
    ));
    float lobe =
      dot(npos, axis1) * 0.55 +
      dot(npos, axis2) * 0.35 +
      dot(npos, axis3) * -0.25;
    float lobeShape = lobe * lobe * lobe;
    vec3 seedScale = vec3(
      1.0 + 0.12 * sin(seedA * 1.3),
      1.0 + 0.1 * cos(seedA * 1.9),
      1.0 + 0.08 * sin(seedA * 2.4)
    );
    float scaleMix = mix(0.6, 1.0, early);
    pos *= mix(vec3(1.0), seedScale, scaleMix);

    float shapeStrength = mix(0.22, 0.36, early);
    pos *= 1.0 + lobeShape * shapeStrength;
    pos *= 1.0 + (low - 0.5) * 0.18 * dispAmpLarge;

    float cellNoise = fbm(npos * 2.4 + vec3(seedA * 1.5, seedA * 0.8, seedA * 1.1));
    float cellAmp = mix(0.12, 0.2, early);
    pos *= 1.0 + (cellNoise - 0.5) * cellAmp;

    float bleb =
      pow(max(dot(npos, axis1), 0.0), 3.0) * 0.16 +
      pow(max(dot(npos, axis2), 0.0), 3.0) * 0.12 +
      pow(max(dot(npos, axis3), 0.0), 3.0) * 0.08;
    pos += npos * bleb * dispAmpLarge;

    float bulgeNoise = ridge(fbm(warpedP * 1.1 + vec3(seedA * 2.1)));
    float bulge = pow(max(bulgeNoise - 0.15, 0.0), 1.6);
    pos += npos * bulge * (0.18 + 0.12 * mature) * grow;

    float lumpsNoise = ridge(fbm(warpedP * 1.8 + vec3(seedB * 1.7)));
    float lumps = smoothstep(0.2, 0.85, lumpsNoise);
    pos += npos * (lumps - 0.5) * (0.08 + 0.08 * mature) * grow;

    float ampLarge = mix(0.25, 0.18, clamp(u_stiffness, 0.0, 1.0));
    float ampSmall = mix(0.1, 0.05, clamp(u_stiffness, 0.0, 1.0));
    float disp =
      (n - 0.5) * ampLarge * dispAmpLarge +
      (nSmall - 0.5) * ampSmall * dispAmpSmall +
      lobeShape * 0.08 * dispAmpLarge;
    pos += normal * disp;

    vPos = pos;
    vec3 displacedNormal = normalize(pos);
    vNormal = normalize(normalMatrix * displacedNormal);
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform float u_time;
  uniform float u_cycle;
  uniform float u_age;
  uniform float u_seed;
  uniform float u_vitality;
  uniform float u_veinGrowth;
  uniform float u_moss;
  uniform float u_lichen;
  uniform float u_stiffness;
  uniform float u_colorAgnostic;
  uniform float u_wrap;
  uniform float u_scatterStrength;
  uniform float u_scatterPow;
  uniform float u_microScale;
  uniform float u_microNormalStrength;
  uniform float u_patchCoverage;
  uniform float u_debugColorMode;

  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vPos;

  const float MICRO_STRENGTH_MIN = ${STYLE.MICRO_STRENGTH_MIN};
  const float MICRO_STRENGTH_MAX = ${STYLE.MICRO_STRENGTH_MAX};
  const float MICRO_EPS = ${STYLE.MICRO_EPS};
  const float PATCH_BASE = ${STYLE.PATCH_BASE};
  const float PATCH_SCALE = ${STYLE.PATCH_SCALE};
  const float VEIN_SCALE = ${STYLE.VEIN_SCALE};
  const float LIGHT_CLAMP = ${STYLE.LIGHT_CLAMP};
  const float WARP_MIN = ${STYLE.WARP_MIN};
  const float WARP_MAX = ${STYLE.WARP_MAX};

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));

    float n00 = mix(n000, n100, f.x);
    float n10 = mix(n010, n110, f.x);
    float n01 = mix(n001, n101, f.x);
    float n11 = mix(n011, n111, f.x);
    float n0 = mix(n00, n10, f.y);
    float n1 = mix(n01, n11, f.y);
    return mix(n0, n1, f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  float ridge(float n) {
    return 1.0 - abs(n * 2.0 - 1.0);
  }

  float triLine(vec3 p, vec3 dir, float freq) {
    float v = dot(p, dir) * freq;
    float f = abs(fract(v) - 0.5);
    return f;
  }

  void main() {
    float age = clamp(u_age, 0.0, 1.0);
    float early = smoothstep(0.02, 0.12, age);
    float grow = smoothstep(0.2, 0.6, age);
    float mature = smoothstep(0.6, 1.0, age);
    float veryEarly = smoothstep(0.0, 0.02, age);
    float latticeAge = smoothstep(0.12, 0.35, age);
    float warpAmp = mix(WARP_MIN, WARP_MAX, early);

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorld);

    float bucket = floor(u_cycle / 50.0);
    float t = fract(u_cycle / 50.0);
    float seedA = u_seed + bucket * 0.13;
    float seedB = u_seed + (bucket + 1.0) * 0.13;

    vec3 p = vPos * 2.4;
    vec3 warp = vec3(
      fbm(p + vec3(seedA, seedA * 0.9, seedA * 0.3)),
      fbm(p + vec3(seedA * 0.6, seedA * 1.1, seedA * 0.2)),
      fbm(p + vec3(seedA * 0.2, seedA * 0.4, seedA * 1.4))
    ) - 0.5;
    vec3 warpedP = p + warp * 1.4 * warpAmp;
    vec3 timeOffset = vec3(0.0, u_time * 0.03, 0.0);
    float nA = fbm(warpedP + vec3(seedA) + timeOffset);
    float nB = fbm(warpedP + vec3(seedB) + timeOffset);
    float nMix = mix(nA, nB, t);

    float veinScale = 2.0;
    float veinNoise = ridge(fbm(warpedP * veinScale + vec3(seedA * 1.7)));
    float veinsMask =
      smoothstep(0.32, 0.58, veinNoise) - smoothstep(0.58, 0.85, veinNoise);
    float veinStrength =
      clamp(u_veinGrowth * VEIN_SCALE, 0.0, 1.0) * smoothstep(0.12, 0.6, age);
    veinsMask = clamp(veinsMask, 0.0, 1.0) * veinStrength;

    float patchGate = early;
    float patchScale = 1.2;
    float patchNoise = fbm(warpedP * patchScale + warp * 1.2 + vec3(seedB * 0.7));
    float patchNoise2 = fbm(warpedP * 0.6 + vec3(seedB * 1.3));
    float blobs = smoothstep(0.35, 0.7, patchNoise + 0.35 * patchNoise2);

    float latticeMask = 0.0;

    vec3 baseStart = vec3(0.88, 0.80, 0.88);
    vec3 baseMature = vec3(0.56, 0.66, 0.56);
    vec3 base = mix(baseStart, baseMature, early);
    vec3 mossColor = vec3(0.22, 0.54, 0.32);
    vec3 lichenColor = vec3(0.28, 0.54, 0.34);
    vec3 veinColor = vec3(0.28, 0.2, 0.34);

    if (u_colorAgnostic > 0.5) {
      float lum = dot(base, vec3(0.333));
      base = mix(base, vec3(lum), 0.7);
      mossColor = vec3(0.58);
      lichenColor = vec3(0.68);
      veinColor = vec3(0.45);
    }

    float microStrength = mix(MICRO_STRENGTH_MIN, MICRO_STRENGTH_MAX, early) * u_microNormalStrength;
    microStrength *= mix(1.0, 1.35, veinsMask);
    float eps = MICRO_EPS;
    float microH = fbm(warpedP * u_microScale + vec3(seedA * 0.5));
    float microHx = fbm((warpedP + vec3(eps, 0.0, 0.0)) * u_microScale + vec3(seedA * 0.5));
    float microHy = fbm((warpedP + vec3(0.0, eps, 0.0)) * u_microScale + vec3(seedA * 0.5));
    float dhdx = microHx - microH;
    float dhdy = microHy - microH;
    vec3 up = abs(n.y) > 0.8 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(up, n));
    vec3 bitangent = normalize(cross(n, tangent));
    vec3 microNormal = normalize(n + microStrength * (dhdx * tangent + dhdy * bitangent));

    float upMask = clamp(dot(microNormal, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5, 0.0, 1.0);
    float crease = smoothstep(0.35, 0.7, ridge(fbm(warpedP * 1.6)));
    float patchCoverage =
      clamp(u_patchCoverage * 1.2, 0.0, 1.0) * patchGate;
    patchCoverage = max(patchCoverage, PATCH_BASE + PATCH_SCALE * grow);
    float patchMask = blobs * mix(0.4, 1.0, upMask) * mix(0.6, 1.0, crease);
    patchMask *= patchCoverage * (0.8 + 0.2 * mature);
    microStrength *= mix(1.0, 1.25, patchMask);

    if (u_debugColorMode > 0.5) {
      gl_FragColor = vec4(microNormal * 0.5 + 0.5, 1.0);
      return;
    }

    vec3 color = base;
    color = mix(color, mossColor, patchMask * 0.9);
    color = mix(color, lichenColor, patchMask * 0.6);
    color = mix(color, color * 0.9, patchMask * 0.55);
    color *= (1.0 - veinsMask * 0.12);
    color += veinsMask * vec3(0.1, 0.05, 0.16) * 0.35;
    color = mix(color, color * 0.9, latticeMask);

    vec3 lightA = normalize(vec3(0.6, 0.8, 1.0));
    vec3 lightB = normalize(vec3(-0.7, 0.4, 0.8));
    vec3 lightC = normalize(vec3(0.1, -0.9, 0.6));
    vec3 lightACol = vec3(1.0, 0.96, 0.9);
    vec3 lightBCol = vec3(0.85, 0.9, 1.0);
    vec3 lightCCol = vec3(0.9, 0.9, 1.0);
    float wrap = u_wrap;
    float ndotlA = max(dot(microNormal, lightA), 0.0);
    float ndotlB = max(dot(microNormal, lightB), 0.0);
    float ndotlC = max(dot(microNormal, lightC), 0.0);
    float wrapDiffuseA = clamp((dot(microNormal, lightA) + wrap) / (1.0 + wrap), 0.0, 1.0);
    float wrapDiffuseB = clamp((dot(microNormal, lightB) + wrap) / (1.0 + wrap), 0.0, 1.0);
    float wrapDiffuseC = clamp((dot(microNormal, lightC) + wrap) / (1.0 + wrap), 0.0, 1.0);
    float scatter = pow(clamp(1.0 - dot(microNormal, viewDir), 0.0, 1.0), u_scatterPow) * u_scatterStrength;
    float thickness = 0.55 + 0.45 * fbm(warpedP * 0.8 + vec3(seedB * 0.6));

    vec3 subsurfaceColor = mix(base, vec3(0.62, 0.6, 0.64), 0.45);
    subsurfaceColor = mix(subsurfaceColor, vec3(0.48, 0.38, 0.58), veinsMask * 0.45);
    vec3 diffuse =
      color * wrapDiffuseA * 0.55 * lightACol +
      color * wrapDiffuseB * 0.25 * lightBCol +
      color * wrapDiffuseC * 0.12 * lightCCol;
    vec3 lightTerm = diffuse + subsurfaceColor * (scatter * thickness) * 0.75;
    color = lightTerm;

    float vitality = clamp(u_vitality, 0.0, 1.0);
    color *= 0.84 + vitality * 0.12;

    float contrast = mix(0.85, 1.0, early);
    color = mix(color, color * (0.9 + nMix * 0.1), 0.12 + veryEarly * 0.05);
    vec3 blush = vec3(0.9, 0.78, 0.88);
    color = mix(color, blush, 0.06 * (1.0 - early));
    float rim = pow(1.0 - max(dot(microNormal, viewDir), 0.0), 2.1);
    color *= 1.0 - rim * 0.05;
    color += rim * 0.06;
    color = (color - 0.5) * contrast + 0.5;
    color = clamp(color, 0.0, LIGHT_CLAMP);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const veinFragmentShader = `
  uniform float u_time;
  uniform float u_cycle;
  uniform float u_age;
  uniform float u_seed;
  uniform float u_veinGrowth;
  uniform float u_patchCoverage;
  uniform float u_colorAgnostic;

  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vPos;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));

    float n00 = mix(n000, n100, f.x);
    float n10 = mix(n010, n110, f.x);
    float n01 = mix(n001, n101, f.x);
    float n11 = mix(n011, n111, f.x);
    float n0 = mix(n00, n10, f.y);
    float n1 = mix(n01, n11, f.y);
    return mix(n0, n1, f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  float ridge(float n) {
    return 1.0 - abs(n * 2.0 - 1.0);
  }

  void main() {
    float age = clamp(u_age, 0.0, 1.0);
    float mature = smoothstep(0.25, 0.7, age);
    float bucket = floor(u_cycle / 50.0);
    float seedA = u_seed + bucket * 0.13;
    float seedB = u_seed + (bucket + 1.0) * 0.13;

    vec3 p = vPos * 3.1;
    vec3 warp = vec3(
      fbm(p + vec3(seedA * 0.7, seedA * 1.1, seedA * 0.3)),
      fbm(p + vec3(seedA * 1.3, seedA * 0.5, seedA * 0.9)),
      fbm(p + vec3(seedA * 0.2, seedA * 0.8, seedA * 1.4))
    ) - 0.5;
    vec3 wp = p + warp * 1.8;
    float v1 = ridge(fbm(wp * 2.6 + vec3(seedA * 1.7)));
    float v2 = ridge(fbm(wp * 4.1 + vec3(seedB * 2.4)));
    float line = smoothstep(0.5, 0.8, v1) * smoothstep(0.45, 0.78, v2);
    line = pow(line, 1.4);
    float thickness = smoothstep(0.0, 1.0, fbm(wp * 1.3 + vec3(seedA * 2.0)));
    float lineMask = line * (0.45 + 0.55 * thickness);

    float strength = clamp(u_veinGrowth * 1.6, 0.0, 1.0) * mature;
    float alpha = lineMask * strength;

    if (alpha < 0.03) {
      discard;
    }

    vec3 base = vec3(0.32, 0.2, 0.4);
    vec3 bright = vec3(0.56, 0.3, 0.7);
    if (u_colorAgnostic > 0.5) {
      base = vec3(0.6);
      bright = vec3(0.9);
    }
    vec3 color = mix(base, bright, line);
    float viewFade = 0.4 + 0.6 * (1.0 - dot(normalize(vNormal), normalize(cameraPosition - vWorld)));
    color *= viewFade;

    gl_FragColor = vec4(color, alpha * 0.45);
  }
`;

type SymbioteMeshProps = {
  uniforms: SymbioteUniforms;
  scale: [number, number, number];
};

const SymbioteMesh = ({
  uniforms,
  scale,
}: SymbioteMeshProps) => {
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 7), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: false,
      }),
    [uniforms],
  );

  useEffect(() => {
    geometry.computeVertexNormals();
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      scale={scale}
      frustumCulled={false}
    />
  );
};

type BioticOverlaysProps = {
  seed: number;
  age: number;
  colorAgnostic: boolean;
};

const BioticOverlays = ({ seed, age, colorAgnostic }: BioticOverlaysProps) => {
  const growth = smoothstep(0.18, 0.6, age);
  const mature = smoothstep(0.6, 1.0, age);
  const enableNodes = false;

  const overlayData = useMemo(() => {
    if (growth <= 0.02) {
      return {
        vineGeometries: [] as THREE.TubeGeometry[],
        nodePoints: [] as THREE.Vector3[],
        nodeScales: [] as number[],
        mossPoints: [] as THREE.Vector3[],
        mossScales: [] as number[],
        leafNormals: [] as THREE.Vector3[],
        leafScales: [] as number[],
        leafRolls: [] as number[],
        surfaceRadius: 1.02,
      };
    }

    const rng = mulberry32(seed);
    const vineCount = Math.round(10 + growth * 30);
    const segmentCount = Math.round(18 + growth * 26);
    const vineRadius = 1.02 + 0.03 * growth;
    const vineGeometries: THREE.TubeGeometry[] = [];
    const nodePoints: THREE.Vector3[] = [];
    const nodeScales: number[] = [];

    for (let i = 0; i < vineCount; i += 1) {
      let theta = rng() * Math.PI * 2;
      let phi = Math.acos(2 * rng() - 1);
      const points: THREE.Vector3[] = [];
      for (let s = 0; s < segmentCount; s += 1) {
        const step = 0.15 + 0.18 * rng();
        theta += (rng() - 0.5) * step;
        phi += (rng() - 0.5) * step;
        phi = clamp(phi, 0.25, Math.PI - 0.25);
        const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
        points.push(dir.clone().multiplyScalar(vineRadius));
        if (enableNodes && s % 5 === 0 && rng() < 0.7) {
          nodePoints.push(dir.clone().multiplyScalar(vineRadius * 1.01));
          nodeScales.push(0.026 + 0.04 * rng() * (0.5 + 0.5 * mature));
        }
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const geom = new THREE.TubeGeometry(
        curve,
        points.length * 6,
        0.016 + 0.016 * mature,
        8,
        false,
      );
      vineGeometries.push(geom);
    }

    const mossPoints: THREE.Vector3[] = [];
    const mossScales: number[] = [];
    const mossCount = Math.round(90 + 360 * growth);
    for (let i = 0; i < mossCount; i += 1) {
      const dir = randomUnitVector(rng);
      const upBias = Math.pow(Math.max(0, dir.y), 0.28);
      if (rng() > 0.28 + 0.62 * upBias) {
        continue;
      }
      mossPoints.push(dir.multiplyScalar(vineRadius * 1.01));
      mossScales.push(0.03 + 0.06 * rng() * (0.6 + 0.4 * mature));
    }

    const leafNormals: THREE.Vector3[] = [];
    const leafScales: number[] = [];
    const leafRolls: number[] = [];
    const leafCount = Math.round(220 + 560 * growth);
    for (let i = 0; i < leafCount; i += 1) {
      const dir = randomUnitVector(rng);
      const upBias = Math.pow(Math.max(0, dir.y), 0.22);
      if (rng() > 0.22 + 0.7 * upBias) {
        continue;
      }
      leafNormals.push(dir);
      leafScales.push(0.06 + 0.12 * rng() * (0.6 + 0.4 * mature));
      leafRolls.push(rng() * Math.PI * 2);
    }

    return {
      vineGeometries,
      nodePoints,
      nodeScales,
      mossPoints,
      mossScales,
      leafNormals,
      leafScales,
      leafRolls,
      surfaceRadius: vineRadius * 1.01,
    };
  }, [seed, growth, mature, enableNodes]);

  useEffect(() => {
    return () => {
      overlayData.vineGeometries.forEach((geom) => geom.dispose());
    };
  }, [overlayData]);

  const vineMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colorAgnostic ? "#cfcfcf" : "#6a3ea8",
        roughness: 0.85,
        metalness: 0.02,
        transparent: true,
        opacity: 0.88,
      }),
    [colorAgnostic],
  );

  const nodeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colorAgnostic ? "#d9d9d9" : "#f3ad3f",
        emissive: colorAgnostic
          ? new THREE.Color("#9c9c9c")
          : new THREE.Color("#ffb057"),
        emissiveIntensity: 0.6 + 0.4 * mature,
        roughness: 0.45,
        metalness: 0.05,
      }),
    [colorAgnostic, mature],
  );

  const mossMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colorAgnostic ? "#bdbdbd" : "#6fa66d",
        roughness: 0.9,
        metalness: 0.0,
      }),
    [colorAgnostic],
  );

  const leafTexture = useMemo(() => {
    if (typeof document === "undefined") {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createRadialGradient(48, 50, 6, 48, 50, 46);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(48, 50, 34, 42, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }, []);

  useEffect(() => {
    return () => {
      leafTexture?.dispose();
    };
  }, [leafTexture]);

  const leafMaterial = useMemo(() => {
    if (!leafTexture) {
      return null;
    }
    return new THREE.MeshStandardMaterial({
      color: colorAgnostic ? "#d8d8d8" : "#7ab570",
      map: leafTexture,
      alphaMap: leafTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.92,
      metalness: 0.0,
      opacity: 0.85,
    });
  }, [leafTexture, colorAgnostic]);

  const leafGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const nodeGeometry = useMemo(() => new THREE.SphereGeometry(1, 10, 10), []);
  const mossGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  useEffect(() => {
    return () => {
      nodeGeometry.dispose();
      mossGeometry.dispose();
      leafGeometry.dispose();
    };
  }, [nodeGeometry, mossGeometry, leafGeometry]);

  const nodeRef = useRef<THREE.InstancedMesh>(null);
  const mossRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!enableNodes || !nodeRef.current) {
      return;
    }
    const temp = new THREE.Object3D();
    overlayData.nodePoints.forEach((point, index) => {
      const scale = overlayData.nodeScales[index] ?? 0.03;
      temp.position.copy(point);
      temp.scale.setScalar(scale);
      temp.updateMatrix();
      nodeRef.current?.setMatrixAt(index, temp.matrix);
    });
    nodeRef.current.instanceMatrix.needsUpdate = true;
  }, [enableNodes, overlayData.nodePoints, overlayData.nodeScales]);

  useEffect(() => {
    if (!mossRef.current) {
      return;
    }
    const temp = new THREE.Object3D();
    overlayData.mossPoints.forEach((point, index) => {
      const scale = overlayData.mossScales[index] ?? 0.03;
      temp.position.copy(point);
      temp.scale.setScalar(scale);
      temp.updateMatrix();
      mossRef.current?.setMatrixAt(index, temp.matrix);
    });
    mossRef.current.instanceMatrix.needsUpdate = true;
  }, [overlayData.mossPoints, overlayData.mossScales]);

  useEffect(() => {
    if (!leafRef.current) {
      return;
    }
    const temp = new THREE.Object3D();
    const forward = new THREE.Vector3(0, 0, 1);
    overlayData.leafNormals.forEach((normal, index) => {
      const scale = overlayData.leafScales[index] ?? 0.08;
      const roll = overlayData.leafRolls[index] ?? 0;
      const radius = overlayData.surfaceRadius ?? 1.02;
      const position = normal.clone().multiplyScalar(radius);
      const quat = new THREE.Quaternion().setFromUnitVectors(forward, normal);
      const rollQuat = new THREE.Quaternion().setFromAxisAngle(normal, roll);
      quat.multiply(rollQuat);
      temp.position.copy(position);
      temp.quaternion.copy(quat);
      temp.scale.setScalar(scale);
      temp.updateMatrix();
      leafRef.current?.setMatrixAt(index, temp.matrix);
    });
    leafRef.current.instanceMatrix.needsUpdate = true;
  }, [overlayData.leafNormals, overlayData.leafScales, overlayData.leafRolls, overlayData.surfaceRadius]);

  if (overlayData.vineGeometries.length === 0) {
    return null;
  }

  return (
    <group>
      {leafMaterial && overlayData.leafNormals.length > 0 ? (
        <instancedMesh
          ref={leafRef}
          args={[leafGeometry, leafMaterial, overlayData.leafNormals.length]}
        />
      ) : null}
      {overlayData.vineGeometries.map((geom, index) => (
        <mesh key={`vine-${index}`} geometry={geom} material={vineMaterial} />
      ))}
      {enableNodes && overlayData.nodePoints.length > 0 ? (
        <instancedMesh
          ref={nodeRef}
          args={[nodeGeometry, nodeMaterial, overlayData.nodePoints.length]}
        />
      ) : null}
      {overlayData.mossPoints.length > 0 ? (
        <instancedMesh
          ref={mossRef}
          args={[mossGeometry, mossMaterial, overlayData.mossPoints.length]}
        />
      ) : null}
    </group>
  );
};

const VeinShell = ({
  uniforms,
  scale,
}: SymbioteMeshProps) => {
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 7), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: veinFragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [uniforms],
  );

  useEffect(() => {
    geometry.computeVertexNormals();
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  const shellScale = useMemo(
    () => [scale[0] * 1.003, scale[1] * 1.003, scale[2] * 1.003] as [
      number,
      number,
      number,
    ],
    [scale],
  );

  return <mesh geometry={geometry} material={material} scale={shellScale} />;
};

const SymbioteScene = ({
  snapshot,
  cycle,
  maxCycle,
  seed,
  reducedMotion,
  colorAgnostic,
}: SymbioteSceneProps) => {
  const seedHash = useMemo(() => hashSeed(seed), [seed]);
  const seedNorm = useMemo(() => (seedHash / 4294967295) * 10, [seedHash]);
  const age = Math.min(1, Math.max(0, cycle / Math.max(1, maxCycle)));
  const showWireDebug = false;
  const overlaySeed = useMemo(
    () => seedHash ^ (Math.floor(cycle / 400) * 0x9e3779b9),
    [seedHash, cycle],
  );

  const uniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_cycle: { value: 0 },
      u_age: { value: 0 },
      u_seed: { value: seedNorm },
      u_vitality: { value: 0.6 },
      u_veinGrowth: { value: 0.4 },
      u_moss: { value: 0.35 },
      u_lichen: { value: 0.3 },
      u_stiffness: { value: 0.5 },
      u_colorAgnostic: { value: 0 },
      u_wrap: { value: STYLE.LIGHT_WRAP },
      u_scatterStrength: { value: STYLE.LIGHT_SCATTER },
      u_scatterPow: { value: STYLE.LIGHT_SCATTER_POW },
      u_microScale: { value: 8.0 },
      u_microNormalStrength: { value: 0.55 },
      u_patchCoverage: { value: 0.7 },
      u_debugColorMode: { value: 0 },
    }),
    [seedNorm],
  );

  useEffect(() => {
    uniforms.u_cycle.value = cycle;
  }, [cycle, uniforms]);

  useEffect(() => {
    uniforms.u_age.value = age;
  }, [age, uniforms]);

  useEffect(() => {
    uniforms.u_seed.value = seedNorm;
  }, [seedNorm, uniforms]);

  useEffect(() => {
    uniforms.u_colorAgnostic.value = colorAgnostic ? 1 : 0;
  }, [colorAgnostic, uniforms]);

  useEffect(() => {
    if (!snapshot) {
      uniforms.u_vitality.value = 0.6;
      uniforms.u_veinGrowth.value = 0.4;
      uniforms.u_moss.value = 0.35;
      uniforms.u_lichen.value = 0.3;
      uniforms.u_stiffness.value = 0.5;
      uniforms.u_patchCoverage.value = Math.min(1, 0.35 + 0.8 * age);
      return;
    }
    uniforms.u_vitality.value = snapshot.uniforms.u_vitality ?? 0.6;
    uniforms.u_veinGrowth.value = Math.max(
      snapshot.uniforms.u_veinGrowth ?? 0.4,
      0.25 + 0.7 * age,
    );
    uniforms.u_moss.value = snapshot.plantWeightsRaw.moss ?? 0.35;
    uniforms.u_lichen.value = snapshot.uniforms.u_lichenCoverage ?? 0.3;
    uniforms.u_stiffness.value = snapshot.uniforms.u_stiffness ?? 0.5;
    uniforms.u_patchCoverage.value = Math.min(
      1,
      Math.max(
        snapshot.plantWeightsRaw.moss ?? 0,
        snapshot.uniforms.u_lichenCoverage ?? 0,
        0.35 + 0.8 * age,
      ),
    );
  }, [snapshot, uniforms]);

  useFrame((_, delta) => {
    if (reducedMotion) {
      uniforms.u_time.value = 0;
      return;
    }
    uniforms.u_time.value += delta;
  });

  const scale = useMemo(() => {
    const sx = 1 + 0.08 * Math.sin(seedNorm * 1.9);
    const sy = 1 - 0.07 * Math.cos(seedNorm * 2.3);
    const sz = 1 + 0.06 * Math.sin(seedNorm * 2.7);
    const mix = 0.65 + 0.35 * age;
    return [1 + (sx - 1) * mix, 1 + (sy - 1) * mix, 1 + (sz - 1) * mix] as [
      number,
      number,
      number,
    ];
  }, [seedNorm, age]);

  return (
    <>
      <SymbioteMesh uniforms={uniforms} scale={scale} />
      {showWireDebug ? (
        <>
          <VeinShell uniforms={uniforms} scale={scale} />
          <BioticOverlays
            seed={overlaySeed}
            age={age}
            colorAgnostic={colorAgnostic}
          />
        </>
      ) : null}
    </>
  );
};

export default function Symbiote3DView({
  snapshot,
  cycle,
  maxCycle,
  seed,
  reducedMotion,
  colorAgnostic,
  isComputing = false,
}: Symbiote3DViewProps) {
  const age = Math.min(1, Math.max(0, cycle / Math.max(1, maxCycle)));
  const showStart = age < 0.03;
  const minZoom = 1.6;
  const maxZoom = 6.0;
  const [zoom, setZoom] = useState(3.2);

  return (
    <div className="flex h-full w-full flex-col rounded-3xl border border-zinc-200 bg-white/90 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        <span className="flex items-center gap-2">
          Symbiote
          {showStart ? (
            <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-zinc-500">
              Start
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-3">
          {isComputing ? (
            <span className="text-[10px] normal-case text-zinc-400">
              computing...
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
              Zoom
            </span>
            <button
              type="button"
              className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px]"
              onClick={() =>
                setZoom((value) => clamp(value - 0.25, minZoom, maxZoom))
              }
            >
              -
            </button>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.05}
              value={zoom}
              onChange={(event) =>
                setZoom(
                  clamp(Number(event.target.value), minZoom, maxZoom),
                )
              }
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-zinc-200"
            />
            <button
              type="button"
              className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px]"
              onClick={() =>
                setZoom((value) => clamp(value + 0.25, minZoom, maxZoom))
              }
            >
              +
            </button>
          </span>
          <span>Cycle {cycle}</span>
        </span>
      </div>
      <div className="min-h-[240px] flex-1">
        <Canvas
          className="h-full w-full"
          camera={{ position: [0, 0, zoom], fov: 42, near: 0.1, far: 20 }}
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.NoToneMapping;
          }}
        >
          <color attach="background" args={["#f6f5f2"]} />
          <ambientLight intensity={0.35} />
          <directionalLight
            position={[2, 2, 2]}
            intensity={0.85}
            color="#fff5eb"
          />
          <directionalLight
            position={[-2, 1, 1]}
            intensity={0.35}
            color="#d7e6ff"
          />
          <directionalLight
            position={[-2, 2, -2]}
            intensity={0.2}
            color="#f8f8ff"
          />
          <SymbioteScene
            snapshot={snapshot}
            cycle={cycle}
            maxCycle={maxCycle}
            seed={seed}
            reducedMotion={reducedMotion}
            colorAgnostic={colorAgnostic}
          />
          <CameraRig
            zoom={zoom}
            minZoom={minZoom}
            maxZoom={maxZoom}
            reducedMotion={reducedMotion}
          />
        </Canvas>
      </div>
    </div>
  );
}
