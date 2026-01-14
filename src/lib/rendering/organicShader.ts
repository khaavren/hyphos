import * as THREE from "three";
import type { Phenotype } from "../simulation/types";

export const organicVertexShader = `
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
  varying vec2 vUv;

  // Simplified noise functions for cleaner code (inlined for portability)
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
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
               mix(mix(n001, n101, f.x), mix(n011, n101, f.x), f.y), f.z);
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

  void main() {
    vUv = uv;
    vec3 pos = position;
    
    // Organic displacement based on noise
    float disp = fbm(pos * 2.0 + u_time * 0.1) * 0.1 * (1.0 - u_stiffness);
    pos += normal * disp;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vPos = pos;
    vWorld = world.xyz;
    vNormal = normalize(normalMatrix * normal); // Approximation after displacement

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const organicFragmentShader = `
  precision highp float;
  precision highp int;
  uniform float u_time;
  uniform vec3 u_baseColor;
  uniform float u_roughness;
  uniform float u_veinVisibility;
  uniform float u_wetSheen;

  varying vec3 vNormal;
  varying vec3 vWorld;
  
  // Reuse noise functions
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
               mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
               mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v=0.0; float a=0.5;
    for(int i=0; i<4; i++){ v+=a*noise(p); p*=2.0; a*=0.5; }
    return v;
  }
  float ridge(float n) { return 1.0 - abs(n * 2.0 - 1.0); }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    
    // Base organic texture
    float pNoise = fbm(vWorld * 5.0);
    vec3 color = u_baseColor;
    
    // Veins
    float veinMap = ridge(fbm(vWorld * 4.0 + vec3(0, u_time*0.05, 0)));
    float isVein = smoothstep(0.7, 0.8, veinMap);
    vec3 veinColor = vec3(0.4, 0.1, 0.1);
    color = mix(color, veinColor, isVein * u_veinVisibility);

    // Wet sheen (specular)
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 32.0 * (1.0 - u_roughness));
    color += vec3(1.0) * spec * u_wetSheen;

    // Frensel rim
    float rim = 1.0 - max(dot(viewDir, n), 0.0);
    color += u_baseColor * pow(rim, 3.0) * 0.5;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function getOrganicMaterial(
    baseColor: string,
    phenotype: Phenotype,
    cycleTime: number
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: organicVertexShader,
        fragmentShader: organicFragmentShader,
        uniforms: {
            u_time: { value: cycleTime },
            u_baseColor: { value: new THREE.Color(baseColor) },
            u_stiffness: { value: phenotype.rigidity || 0.5 },
            u_veinVisibility: { value: phenotype.veinVisibility || 0.0 },
            u_wetSheen: { value: phenotype.wetSheen || 0.0 },
            u_roughness: { value: phenotype.roughness || 0.5 }
        }
    });
}
