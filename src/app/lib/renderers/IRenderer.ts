export type BackendPreference = "auto" | "webgpu" | "webgl2";
export type BackendKind = "webgpu" | "webgl2";

export type PackedTexture = {
  name: string;
  width: number;
  height: number;
  channels: 1 | 4;
  format: "r8" | "rgba8";
  data: Uint8Array;
};

export type RendererResources = {
  textures: PackedTexture[];
};

export type Uniforms = {
  u_time: number;
  u_timeScale: number;
  u_circadianPhase: number;
  u_noiseScale1: number;
  u_noiseScale2: number;
  u_noiseScale3: number;
  u_noiseSpeed1: number;
  u_noiseSpeed2: number;
  u_noiseSpeed3: number;
  u_noiseAmp1_px: number;
  u_noiseAmp2_px: number;
  u_noiseAmp3_px: number;
  u_stiffness: number;
  u_normalStrength: number;
  u_specular: number;
  u_roughness: number;
  u_subsurface: number;
  u_wrap: number;
  u_tempShift: number;
  u_greenBias: number;
  u_blueBias: number;
  u_saturation: number;
  u_contrast: number;
  u_grainStrength: number;
  u_grainScale: number;
  u_grainDriftSpeed: number;
  u_vitality: number;
  u_veinDensity: number;
  u_veinThickness_px: number;
  u_veinContrast: number;
  u_veinGrowth: number;
  u_veinWander: number;
  u_myceliumDensity: number;
  u_myceliumThickness_px: number;
  u_myceliumPulseHz: number;
  u_myceliumSpread: number;
  u_myceliumAnisotropy: number;
  u_lichenCoverage: number;
  u_lichenPatchScale: number;
  u_lichenEdgeFeather_px: number;
  u_lichenMatte: number;
  u_pulseCount: number;
  u_pulseSpeed: number;
  u_pulseWidth_px: number;
  u_pulseEnergy: number;
  u_pulseInterference: number;
  u_fractureOn: number;
  u_fractureSeed: number;
  u_fractureMagnitude_px: number;
  u_chromaSplit_px: number;
  u_healTime_s: number;
};

export interface IRenderer {
  init(
    canvas: HTMLCanvasElement,
    resources: RendererResources,
  ): Promise<void> | void;
  resize(width: number, height: number, dpr: number): void;
  render(uniforms: Uniforms): void;
  dispose(): void;
}
