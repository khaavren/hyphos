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

let lastBioticDensity = 0;

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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const fract = (value: number) => value - Math.floor(value);

const hash3 = (x: number, y: number, z: number) =>
  fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123);

const noise3 = (p: THREE.Vector3) => {
  const ix = Math.floor(p.x);
  const iy = Math.floor(p.y);
  const iz = Math.floor(p.z);
  const fx = p.x - ix;
  const fy = p.y - iy;
  const fz = p.z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const n00 = lerp(n000, n100, ux);
  const n10 = lerp(n010, n110, ux);
  const n01 = lerp(n001, n101, ux);
  const n11 = lerp(n011, n111, ux);
  const n0 = lerp(n00, n10, uy);
  const n1 = lerp(n01, n11, uy);
  return lerp(n0, n1, uz);
};

const fbm3 = (p: THREE.Vector3, octaves = 4) => {
  let value = 0;
  let amplitude = 0.5;
  const temp = p.clone();
  for (let i = 0; i < octaves; i += 1) {
    value += amplitude * noise3(temp);
    temp.multiplyScalar(2);
    amplitude *= 0.5;
  }
  return value;
};

const sampleSurfaceRadius = (
  dir: THREE.Vector3,
  seedNorm: number,
  cycle: number,
  age: number,
) => {
  const early = smoothstep(0.0, 0.06, age);
  const warpAmp = lerp(STYLE.WARP_MIN, STYLE.WARP_MAX, early);
  const dispAmpLarge = lerp(STYLE.DISP_LARGE_MIN, STYLE.DISP_LARGE_MAX, early);
  const dispAmpSmall = lerp(STYLE.DISP_SMALL_MIN, STYLE.DISP_SMALL_MAX, early);

  const bucket = Math.floor(cycle / 50);
  const t = cycle / 50 - bucket;
  const seedA = seedNorm + bucket * 0.13;
  const seedB = seedNorm + (bucket + 1) * 0.13;

  const p = dir.clone().multiplyScalar(2.0);
  const warpA = new THREE.Vector3(
    fbm3(new THREE.Vector3(p.x + seedA * 1.2, p.y + seedA * 0.7, p.z + seedA * 1.3)),
    fbm3(new THREE.Vector3(p.x + seedA * 1.1, p.y + seedA * 0.3, p.z + seedA * 0.9)),
    fbm3(new THREE.Vector3(p.x + seedA * 0.2, p.y + seedA * 1.3, p.z + seedA * 0.4)),
  ).addScalar(-0.5);
  const warpB = new THREE.Vector3(
    fbm3(new THREE.Vector3(p.x + seedB * 1.2, p.y + seedB * 0.7, p.z + seedB * 1.3)),
    fbm3(new THREE.Vector3(p.x + seedB * 1.1, p.y + seedB * 0.3, p.z + seedB * 0.9)),
    fbm3(new THREE.Vector3(p.x + seedB * 0.2, p.y + seedB * 1.3, p.z + seedB * 0.4)),
  ).addScalar(-0.5);
  const warp = warpA.lerp(warpB, t).multiplyScalar(warpAmp);
  const warpedP = p.clone().addScaledVector(warp, 1.25);

  const nA = fbm3(new THREE.Vector3(warpedP.x + seedA * 0.7, warpedP.y + seedA * 0.7, warpedP.z + seedA * 0.7));
  const nB = fbm3(new THREE.Vector3(warpedP.x + seedB * 0.7, warpedP.y + seedB * 0.7, warpedP.z + seedB * 0.7));
  const n = lerp(nA, nB, t);
  const nSmall = fbm3(
    new THREE.Vector3(
      warpedP.x * 2.6 + seedA * 1.9,
      warpedP.y * 2.6 + seedA * 1.9,
      warpedP.z * 2.6 + seedA * 1.9,
    ),
  );

  const lowA = fbm3(new THREE.Vector3(p.x * 0.6 + seedA * 0.35, p.y * 0.6 + seedA * 0.2, p.z * 0.6 + seedA * 0.6));
  const lowB = fbm3(new THREE.Vector3(p.x * 0.6 + seedB * 0.35, p.y * 0.6 + seedB * 0.2, p.z * 0.6 + seedB * 0.6));
  const low = lerp(lowA, lowB, t);

  const axis1 = new THREE.Vector3(
    Math.sin(seedA * 1.7),
    Math.cos(seedA * 2.1),
    Math.sin(seedA * 0.9),
  ).normalize();
  const axis2 = new THREE.Vector3(
    Math.cos(seedA * 0.4),
    Math.sin(seedA * 1.6),
    Math.cos(seedA * 1.1),
  ).normalize();
  const axis3 = new THREE.Vector3(
    Math.sin(seedA * 0.9),
    Math.sin(seedA * 0.2),
    Math.cos(seedA * 1.7),
  ).normalize();
  const lobe =
    dir.dot(axis1) * 0.55 +
    dir.dot(axis2) * 0.35 +
    dir.dot(axis3) * -0.25;
  const lobeShape = lobe * lobe * lobe;

  let radius = 1.0;
  const shapeStage = smoothstep(0.08, 0.6, age);
  const shapeStrength = lerp(0.16, 0.44, shapeStage);
  radius *= 1.0 + lobeShape * shapeStrength;
  radius *= 1.0 + (low - 0.5) * (0.18 + 0.08 * shapeStage) * dispAmpLarge;

  const cellNoise = fbm3(
    new THREE.Vector3(
      dir.x * 2.4 + seedA * 1.5,
      dir.y * 2.4 + seedA * 0.8,
      dir.z * 2.4 + seedA * 1.1,
    ),
  );
  const cellAmp = lerp(0.08, 0.22, shapeStage);
  radius *= 1.0 + (cellNoise - 0.5) * cellAmp;

  const ampLarge = lerp(0.25, 0.18, 0.5);
  const ampSmall = lerp(0.1, 0.05, 0.5);
  const disp =
    (n - 0.5) * ampLarge * dispAmpLarge +
    (nSmall - 0.5) * ampSmall * dispAmpSmall +
    lobeShape * 0.08 * dispAmpLarge;
  radius += disp;

  return clamp(radius, 0.85, 1.45);
};

const vertexShader = `
  precision highp float;
  precision highp int;
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
    vec3 worldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    vec3 worldDir = normalize(worldPos);
    vec3 p = worldPos * 2.0;
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

    float shapeStage = smoothstep(0.08, 0.6, age);
    float shapeStrength = mix(0.16, 0.44, shapeStage);
    pos *= 1.0 + lobeShape * shapeStrength;
    pos *= 1.0 + (low - 0.5) * (0.18 + 0.08 * shapeStage) * dispAmpLarge;

    float cellNoise = fbm(worldDir * 2.4 + vec3(seedA * 1.5, seedA * 0.8, seedA * 1.1));
    float cellAmp = mix(0.08, 0.22, shapeStage);
    pos *= 1.0 + (cellNoise - 0.5) * cellAmp;

    float bleb =
      pow(max(dot(npos, axis1), 0.0), 3.0) * 0.16 +
      pow(max(dot(npos, axis2), 0.0), 3.0) * 0.12 +
      pow(max(dot(npos, axis3), 0.0), 3.0) * 0.08;
    pos += npos * bleb * dispAmpLarge;

    float bulgeNoise = ridge(fbm(warpedP * 1.1 + vec3(seedA * 2.1)));
    float bulge = pow(max(bulgeNoise - 0.15, 0.0), 1.6);
    pos += npos * bulge * (0.12 + 0.22 * mature) * grow;

    float lumpsNoise = ridge(fbm(warpedP * 1.8 + vec3(seedB * 1.7)));
    float lumps = smoothstep(0.2, 0.85, lumpsNoise);
    pos += npos * (lumps - 0.5) * (0.08 + 0.14 * mature) * grow;

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
  precision highp float;
  precision highp int;
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

  void main() {
    float age = clamp(u_age, 0.0, 1.0);
    float early = smoothstep(0.02, 0.12, age);
    float grow = smoothstep(0.2, 0.6, age);
    float mature = smoothstep(0.6, 1.0, age);
    float veryEarly = smoothstep(0.0, 0.02, age);
    float warpAmp = mix(WARP_MIN, WARP_MAX, early);

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorld);

    float bucket = floor(u_cycle / 50.0);
    float t = fract(u_cycle / 50.0);
    float seedA = u_seed + bucket * 0.13;
    float seedB = u_seed + (bucket + 1.0) * 0.13;

    vec3 p = vWorld * 2.0;
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
    float roughness = clamp(
      0.78 - 0.25 * fbm(warpedP * 1.2 + vec3(seedB * 0.9)),
      0.35,
      0.9
    );
    float ao = 1.0 - 0.35 * smoothstep(
      0.35,
      0.8,
      fbm(warpedP * 1.6 + vec3(seedA * 0.6))
    );

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

    vec3 color = base;
    color = mix(color, mossColor, patchMask * 0.9);
    color = mix(color, lichenColor, patchMask * 0.6);
    color = mix(color, color * 0.9, patchMask * 0.55);
    color *= (1.0 - veinsMask * 0.12);
    color += veinsMask * vec3(0.1, 0.05, 0.16) * 0.35;
    color *= ao;

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
    diffuse *= mix(1.0, 0.85, roughness);
    vec3 lightTerm =
      diffuse + subsurfaceColor * (scatter * thickness) * (0.75 * ao);
    color = lightTerm;

    float vitality = clamp(u_vitality, 0.0, 1.0);
    color *= 0.84 + vitality * 0.12;

    vec3 halfDir = normalize(lightA + viewDir);
    float spec = pow(max(dot(microNormal, halfDir), 0.0), mix(28.0, 10.0, roughness));
    float specMask =
      (1.0 - roughness) *
      0.08 *
      (0.6 + 0.4 * fbm(warpedP * 2.0 + vec3(seedB * 1.3)));
    color += specMask * spec;

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
  precision highp float;
  precision highp int;
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

    vec3 p = vWorld * 2.6;
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

const USE_DEBUG_STANDARD_MATERIAL = false;

const SymbioteMesh = ({
  uniforms,
  scale,
}: SymbioteMeshProps) => {
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 7), []);
  const material = useMemo(
    () =>
      USE_DEBUG_STANDARD_MATERIAL
        ? new THREE.MeshStandardMaterial({
            color: "#2f5b3a",
            roughness: 0.9,
            metalness: 0.0,
          })
        : new THREE.ShaderMaterial({
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
  cycle?: number;
  seedNorm?: number;
  age: number;
  colorAgnostic: boolean;
};

const BioticOverlays = ({
  seed,
  cycle = 0,
  seedNorm = ((seed >>> 0) / 4294967295) * 10,
  age,
  colorAgnostic,
}: BioticOverlaysProps) => {
  const growth = smoothstep(0.18, 0.6, age);
  const mature = smoothstep(0.6, 1.0, age);
  const enableNodes = false;

  const overlayData = useMemo(() => {
    const stage = smoothstep(0.2, 0.6, age);
    const lateStage = smoothstep(0.6, 1.0, age);
    const leafEnabled = age > 0.45;
    if (growth <= 0.02) {
      return {
        vineGeometries: [] as THREE.TubeGeometry[],
        nodePoints: [] as THREE.Vector3[],
        nodeScales: [] as number[],
        mossPoints: [] as THREE.Vector3[],
        mossScales: [] as number[],
        mossCardNormals: [] as THREE.Vector3[],
        mossCardScales: [] as number[],
        mossCardRolls: [] as number[],
        mossCardRadii: [] as number[],
        leafNormals: [] as THREE.Vector3[],
        leafScales: [] as number[],
        leafRolls: [] as number[],
        leafRadii: [] as number[],
        surfaceRadius: 1.02,
      };
    }

    const rng = mulberry32(seed);
    const up = new THREE.Vector3(0, 1, 0);
    const patchField = (dir: THREE.Vector3) =>
      fbm3(
        new THREE.Vector3(
          dir.x * 3.2 + seedNorm * 0.17,
          dir.y * 3.2 + seedNorm * 0.29,
          dir.z * 3.2 + seedNorm * 0.41,
        ),
      );
    const creaseField = (dir: THREE.Vector3) =>
      fbm3(
        new THREE.Vector3(
          dir.x * 5.2 + seedNorm * 0.33,
          dir.y * 5.2 + seedNorm * 0.21,
          dir.z * 5.2 + seedNorm * 0.47,
        ),
      );
    const colonyCount = Math.round(6 + 6 * smoothstep(0.2, 0.75, age));
    const colonyCenters = Array.from({ length: colonyCount }, () => {
      const center = randomUnitVector(rng);
      if (rng() < 0.7) {
        return center.lerp(up, 0.25 + 0.35 * rng()).normalize();
      }
      return center;
    });
    const clusterFactorForDir = (dir: THREE.Vector3) => {
      let nearest = -1;
      for (let i = 0; i < colonyCenters.length; i += 1) {
        nearest = Math.max(nearest, dir.dot(colonyCenters[i]));
      }
      return smoothstep(0.2, 0.85, nearest);
    };
    const vineCount = Math.round(16 + 28 * stage + 18 * lateStage);
    const segmentCount = Math.round(22 + 40 * stage + 16 * lateStage);
    const baseSurfaceRadius = 1.0;
    const vineOffset = 0.02 + 0.03 * growth;
    const mossOffset = 0.015 + 0.02 * growth;
    const leafOffset = 0.018 + 0.025 * growth;
    const vineGeometries: THREE.TubeGeometry[] = [];
    const nodePoints: THREE.Vector3[] = [];
    const nodeScales: number[] = [];

    for (let i = 0; i < vineCount; i += 1) {
      const colony = colonyCenters[Math.floor(rng() * colonyCenters.length)];
      let normal = colony
        .clone()
        .lerp(randomUnitVector(rng), 0.25 + 0.25 * rng())
        .normalize();
      if (normal.dot(up) < -0.15 && rng() < 0.7) {
        normal = normal.lerp(up, 0.35).normalize();
      }
      let tangent = new THREE.Vector3().crossVectors(up, normal);
      if (tangent.lengthSq() < 1e-4) {
        tangent = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), normal);
      }
      tangent.normalize();
      const randomTangent = randomUnitVector(rng).cross(normal).normalize();
      tangent.lerp(randomTangent, 0.35).normalize();
      const points: THREE.Vector3[] = [];
      for (let s = 0; s < segmentCount; s += 1) {
        const step = 0.05 + 0.1 * rng();
        const randVec = randomUnitVector(rng);
        const tangentJitter = randVec.sub(normal.clone().multiplyScalar(randVec.dot(normal)));
        tangent.addScaledVector(tangentJitter, 0.35).normalize();
        normal.addScaledVector(tangent, step).normalize();
        const surfaceRadius = sampleSurfaceRadius(normal, seedNorm, cycle, age);
        const surfaceDisplacement = surfaceRadius - baseSurfaceRadius;
        const radius = baseSurfaceRadius + surfaceDisplacement + vineOffset;
        const jitter = randomUnitVector(rng);
        jitter.sub(normal.clone().multiplyScalar(jitter.dot(normal)));
        if (jitter.lengthSq() > 1e-6) {
          jitter.normalize();
        }
        const jitterScale = (0.002 + 0.004 * growth) * (0.4 + 0.6 * rng());
        points.push(
          normal
            .clone()
            .multiplyScalar(radius)
            .add(jitter.multiplyScalar(jitterScale)),
        );
        if (enableNodes && s % 5 === 0 && rng() < 0.7) {
          nodePoints.push(normal.clone().multiplyScalar(radius + 0.006));
          nodeScales.push(0.026 + 0.04 * rng() * (0.5 + 0.5 * mature));
        }
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const geom = new THREE.TubeGeometry(
        curve,
        points.length * 8,
        0.004 + 0.003 * stage + 0.002 * lateStage,
        10,
        false,
      );
      const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
      const uvAttr = geom.getAttribute("uv") as THREE.BufferAttribute;
      const tempPos = new THREE.Vector3();
      const center = new THREE.Vector3();
      for (let v = 0; v < posAttr.count; v += 1) {
        const u = uvAttr.getX(v);
        center.copy(curve.getPointAt(u));
        tempPos.fromBufferAttribute(posAttr, v);
        const radial = tempPos.clone().sub(center);
        const radialLen = radial.length();
        if (radialLen > 0.0001) {
          const taper = lerp(1.0, 0.3, u);
          const offset = 0.002 + 0.002 * mature;
          radial.normalize().multiplyScalar(radialLen * taper + offset);
          tempPos.copy(center).add(radial);
          posAttr.setXYZ(v, tempPos.x, tempPos.y, tempPos.z);
        }
      }
      posAttr.needsUpdate = true;
      geom.computeVertexNormals();
      vineGeometries.push(geom);
    }

    const mossPoints: THREE.Vector3[] = [];
    const mossScales: number[] = [];
    const mossCardNormals: THREE.Vector3[] = [];
    const mossCardScales: number[] = [];
    const mossCardRolls: number[] = [];
    const mossCardRadii: number[] = [];
    const mossCardCount = Math.round(80 + 380 * stage + 160 * lateStage);
    const mossBudCount = Math.round(7 + 36 * stage + 18 * lateStage);
    for (let i = 0; i < mossCardCount; i += 1) {
      const dir = randomUnitVector(rng);
      const lightBias = clamp(dir.dot(up) * 0.5 + 0.5, 0, 1);
      const gravityBias = clamp(1.0 - lightBias, 0, 1);
      const topBias = lightBias * lightBias;
      const patch = patchField(dir);
      const clusterFactor = clusterFactorForDir(dir);
      const crease = smoothstep(0.25, 0.75, creaseField(dir));
      const mossChance =
        (0.15 + 0.85 * topBias) *
        (0.35 + 0.65 * clusterFactor) *
        (0.4 + 0.6 * stage) *
        (0.5 + 0.5 * crease) *
        (1.0 - gravityBias * 0.55);
      if (rng() > mossChance) {
        continue;
      }
      if (patch < 0.42) {
        continue;
      }
      const surfaceRadius = sampleSurfaceRadius(dir, seedNorm, cycle, age);
      const surfaceDisplacement = surfaceRadius - baseSurfaceRadius;
      mossCardNormals.push(dir);
      mossCardScales.push(0.04 + 0.07 * rng() * (0.6 + 0.4 * mature));
      mossCardRolls.push(rng() * Math.PI * 2);
      mossCardRadii.push(baseSurfaceRadius + surfaceDisplacement + mossOffset);
    }
    for (let i = 0; i < mossBudCount; i += 1) {
      const dir = randomUnitVector(rng);
      const lightBias = clamp(dir.dot(up) * 0.5 + 0.5, 0, 1);
      const gravityBias = clamp(1.0 - lightBias, 0, 1);
      const topBias = lightBias * lightBias;
      const patch = patchField(dir);
      const clusterFactor = clusterFactorForDir(dir);
      const mossChance =
        (0.18 + 0.82 * topBias) *
        (0.35 + 0.65 * clusterFactor) *
        (0.35 + 0.65 * stage) *
        (1.0 - gravityBias * 0.6);
      if (rng() > mossChance) {
        continue;
      }
      if (patch < 0.46) {
        continue;
      }
      const surfaceRadius = sampleSurfaceRadius(dir, seedNorm, cycle, age);
      const surfaceDisplacement = surfaceRadius - baseSurfaceRadius;
      const radius = baseSurfaceRadius + surfaceDisplacement + mossOffset;
      mossPoints.push(dir.clone().multiplyScalar(radius));
      mossScales.push(0.008 + 0.022 * rng() * (0.7 + 0.3 * mature));
    }

    const leafNormals: THREE.Vector3[] = [];
    const leafScales: number[] = [];
    const leafRolls: number[] = [];
    const leafRadii: number[] = [];
    const leafCount = leafEnabled
      ? Math.round(120 + 520 * stage + 300 * lateStage)
      : 0;
    for (let i = 0; i < leafCount; i += 1) {
      const dir = randomUnitVector(rng);
      const lightBias = clamp(dir.dot(up) * 0.5 + 0.5, 0, 1);
      const gravityBias = clamp(1.0 - lightBias, 0, 1);
      const patch = patchField(dir);
      const clusterFactor = clusterFactorForDir(dir);
      const leafChance =
        (0.15 + 0.85 * lightBias * lightBias) *
        (0.25 + 0.75 * clusterFactor) *
        (0.2 + 0.8 * stage) *
        (1.0 - gravityBias * 0.75);
      if (rng() > leafChance) {
        continue;
      }
      if (patch < 0.48) {
        continue;
      }
      leafNormals.push(dir);
      leafScales.push(
        0.035 + 0.06 * rng() * (0.65 + 0.35 * mature),
      );
      leafRolls.push(rng() * Math.PI * 2);
      const surfaceRadius = sampleSurfaceRadius(dir, seedNorm, cycle, age);
      const surfaceDisplacement = surfaceRadius - baseSurfaceRadius;
      leafRadii.push(baseSurfaceRadius + surfaceDisplacement + leafOffset);
    }

    return {
      vineGeometries,
      nodePoints,
      nodeScales,
      mossPoints,
      mossScales,
      mossCardNormals,
      mossCardScales,
      mossCardRolls,
      mossCardRadii,
      leafNormals,
      leafScales,
      leafRolls,
      leafRadii,
      surfaceRadius: baseSurfaceRadius + vineOffset,
    };
  }, [seed, seedNorm, cycle, age, growth, mature, enableNodes]);

  const bioticDensity = useMemo(() => {
    const vineCount = overlayData.vineGeometries.length;
    const mossNear = overlayData.mossPoints.reduce(
      (acc, point) => acc + (point.y > 0.75 ? 1 : 0),
      0,
    );
    const mossCardNear = overlayData.mossCardNormals.reduce(
      (acc, normal) => acc + (normal.y > 0.75 ? 1 : 0),
      0,
    );
    const leafNear = overlayData.leafNormals.reduce(
      (acc, normal) => acc + (normal.y > 0.75 ? 1 : 0),
      0,
    );
    return clamp(vineCount * 0.02 + (mossNear + mossCardNear + leafNear) * 0.002, 0, 1);
  }, [overlayData]);

  useEffect(() => {
    lastBioticDensity = bioticDensity;
  }, [bioticDensity]);

  useEffect(() => {
    return () => {
      overlayData.vineGeometries.forEach((geom) => geom.dispose());
    };
  }, [overlayData]);

  const vineMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colorAgnostic ? "#cfcfcf" : "#6a3ea8",
        roughness: 0.92,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        depthWrite: true,
        transparent: true,
        opacity: 0.78,
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
        roughness: 0.98,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        depthWrite: true,
        transparent: true,
        opacity: 0.5,
      }),
    [colorAgnostic],
  );

  const mossTexture = useMemo(() => {
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
    const gradient = ctx.createRadialGradient(48, 48, 6, 48, 48, 44);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(48, 48, 40, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }, []);

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
      mossTexture?.dispose();
    };
  }, [leafTexture, mossTexture]);

  const leafMaterial = useMemo(() => {
    if (!leafTexture) {
      return null;
    }
    return new THREE.MeshStandardMaterial({
      color: colorAgnostic ? "#d8d8d8" : "#7ab570",
      map: leafTexture,
      alphaMap: leafTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.92,
      metalness: 0.0,
      opacity: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }, [leafTexture, colorAgnostic]);

  const mossCardMaterial = useMemo(() => {
    if (!mossTexture) {
      return null;
    }
    return new THREE.MeshStandardMaterial({
      color: colorAgnostic ? "#cfcfcf" : "#6fa66d",
      map: mossTexture,
      alphaMap: mossTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.92,
      metalness: 0.0,
      opacity: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }, [mossTexture, colorAgnostic]);

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
  const mossCardRef = useRef<THREE.InstancedMesh>(null);

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
      const scale = overlayData.leafScales[index] ?? 0.07;
      const roll = overlayData.leafRolls[index] ?? 0;
      const radius =
        overlayData.leafRadii[index] ?? overlayData.surfaceRadius ?? 1.02;
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
  }, [
    overlayData.leafNormals,
    overlayData.leafScales,
    overlayData.leafRolls,
    overlayData.leafRadii,
    overlayData.surfaceRadius,
  ]);

  useEffect(() => {
    if (!mossCardRef.current) {
      return;
    }
    const temp = new THREE.Object3D();
    const forward = new THREE.Vector3(0, 0, 1);
    overlayData.mossCardNormals.forEach((normal, index) => {
      const scale = overlayData.mossCardScales[index] ?? 0.06;
      const roll = overlayData.mossCardRolls[index] ?? 0;
      const radius =
        overlayData.mossCardRadii[index] ?? overlayData.surfaceRadius ?? 1.02;
      const position = normal.clone().multiplyScalar(radius);
      const quat = new THREE.Quaternion().setFromUnitVectors(forward, normal);
      const rollQuat = new THREE.Quaternion().setFromAxisAngle(normal, roll);
      quat.multiply(rollQuat);
      temp.position.copy(position);
      temp.quaternion.copy(quat);
      temp.scale.setScalar(scale);
      temp.updateMatrix();
      mossCardRef.current?.setMatrixAt(index, temp.matrix);
    });
    mossCardRef.current.instanceMatrix.needsUpdate = true;
  }, [
    overlayData.mossCardNormals,
    overlayData.mossCardScales,
    overlayData.mossCardRolls,
    overlayData.mossCardRadii,
    overlayData.surfaceRadius,
  ]);

  return (
    <group renderOrder={2}>
      {mossCardMaterial && overlayData.mossCardNormals.length > 0 ? (
        <instancedMesh
          ref={mossCardRef}
          args={[leafGeometry, mossCardMaterial, overlayData.mossCardNormals.length]}
          renderOrder={3}
        />
      ) : null}
      {leafMaterial && overlayData.leafNormals.length > 0 ? (
        <instancedMesh
          ref={leafRef}
          args={[leafGeometry, leafMaterial, overlayData.leafNormals.length]}
          renderOrder={4}
        />
      ) : null}
      {overlayData.vineGeometries.map((geom, index) => (
        <mesh
          key={`vine-${index}`}
          geometry={geom}
          material={vineMaterial}
          renderOrder={2}
        />
      ))}
      {enableNodes && overlayData.nodePoints.length > 0 ? (
        <instancedMesh
          ref={nodeRef}
          args={[nodeGeometry, nodeMaterial, overlayData.nodePoints.length]}
          renderOrder={2}
        />
      ) : null}
      {overlayData.mossPoints.length > 0 ? (
        <instancedMesh
          ref={mossRef}
          args={[mossGeometry, mossMaterial, overlayData.mossPoints.length]}
          renderOrder={2}
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
  const showTopologyDebug = false;
  const overlaySeed = useMemo(
    () => seedHash ^ (Math.floor(cycle / 400) * 0x9e3779b9),
    [seedHash, cycle],
  );

  const uniforms = useMemo<SymbioteUniforms>(
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
  const uniformsRef = useRef(uniforms);

  useEffect(() => {
    uniformsRef.current = uniforms;
  }, [uniforms]);

  useEffect(() => {
    if (!uniformsRef.current) {
      return;
    }
    uniformsRef.current.u_cycle.value = cycle;
  }, [cycle]);

  useEffect(() => {
    if (!uniformsRef.current) {
      return;
    }
    uniformsRef.current.u_age.value = age;
  }, [age]);

  useEffect(() => {
    if (!uniformsRef.current) {
      return;
    }
    uniformsRef.current.u_seed.value = seedNorm;
  }, [seedNorm]);

  useEffect(() => {
    if (!uniformsRef.current) {
      return;
    }
    uniformsRef.current.u_colorAgnostic.value = colorAgnostic ? 1 : 0;
  }, [colorAgnostic]);

  useEffect(() => {
    const currentUniforms = uniformsRef.current;
    if (!currentUniforms) {
      return;
    }
    const bioticInfluence = lastBioticDensity;
    if (!snapshot) {
      currentUniforms.u_vitality.value = 0.6;
      currentUniforms.u_veinGrowth.value = 0.4;
      currentUniforms.u_moss.value = 0.35;
      currentUniforms.u_lichen.value = 0.3;
      currentUniforms.u_stiffness.value = clamp(
        0.5 * (1 - 0.08 * bioticInfluence),
        0,
        1,
      );
      currentUniforms.u_patchCoverage.value = Math.min(1, 0.35 + 0.8 * age);
      return;
    }
    currentUniforms.u_vitality.value = snapshot.uniforms.u_vitality ?? 0.6;
    currentUniforms.u_veinGrowth.value = Math.max(
      snapshot.uniforms.u_veinGrowth ?? 0.4,
      0.25 + 0.7 * age,
    );
    currentUniforms.u_moss.value = snapshot.plantWeightsRaw.moss ?? 0.35;
    currentUniforms.u_lichen.value = snapshot.uniforms.u_lichenCoverage ?? 0.3;
    currentUniforms.u_stiffness.value = clamp(
      (snapshot.uniforms.u_stiffness ?? 0.5) * (1 - 0.08 * bioticInfluence),
      0,
      1,
    );
    currentUniforms.u_patchCoverage.value = Math.min(
      1,
      Math.max(
        snapshot.plantWeightsRaw.moss ?? 0,
        snapshot.uniforms.u_lichenCoverage ?? 0,
        0.35 + 0.8 * age,
      ),
    );
  }, [snapshot, age]);

  useFrame((_, delta) => {
    const currentUniforms = uniformsRef.current;
    if (!currentUniforms) {
      return;
    }
    if (reducedMotion) {
      currentUniforms.u_time.value = 0;
      return;
    }
    currentUniforms.u_time.value += delta;
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
      {showTopologyDebug ? <VeinShell uniforms={uniforms} scale={scale} /> : null}
      {age >= 0.15 ? (
        <BioticOverlays
          seed={overlaySeed}
          cycle={cycle}
          seedNorm={seedNorm}
          age={age}
          colorAgnostic={colorAgnostic}
        />
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
