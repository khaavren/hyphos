import type { IRenderer, RendererResources, Uniforms } from "../IRenderer";

const WGSL_SHADER = `
struct Uniforms {
  u_time: f32,
  u_timeScale: f32,
  u_circadianPhase: f32,
  u_noiseScale1: f32,
  u_noiseScale2: f32,
  u_noiseScale3: f32,
  u_noiseSpeed1: f32,
  u_noiseSpeed2: f32,
  u_noiseSpeed3: f32,
  u_noiseAmp1_px: f32,
  u_noiseAmp2_px: f32,
  u_noiseAmp3_px: f32,
  u_stiffness: f32,
  u_normalStrength: f32,
  u_specular: f32,
  u_roughness: f32,
  u_subsurface: f32,
  u_wrap: f32,
  u_tempShift: f32,
  u_greenBias: f32,
  u_blueBias: f32,
  u_saturation: f32,
  u_contrast: f32,
  u_grainStrength: f32,
  u_grainScale: f32,
  u_grainDriftSpeed: f32,
  u_vitality: f32,
  u_veinDensity: f32,
  u_veinThickness_px: f32,
  u_veinContrast: f32,
  u_veinGrowth: f32,
  u_veinWander: f32,
  u_myceliumDensity: f32,
  u_myceliumThickness_px: f32,
  u_myceliumPulseHz: f32,
  u_myceliumSpread: f32,
  u_myceliumAnisotropy: f32,
  u_lichenCoverage: f32,
  u_lichenPatchScale: f32,
  u_lichenEdgeFeather_px: f32,
  u_lichenMatte: f32,
  u_pulseCount: f32,
  u_pulseSpeed: f32,
  u_pulseWidth_px: f32,
  u_pulseEnergy: f32,
  u_pulseInterference: f32,
  u_fractureOn: f32,
  u_fractureSeed: f32,
  u_fractureMagnitude_px: f32,
  u_chromaSplit_px: f32,
  u_healTime_s: f32,
  _pad0: f32,
  u_resolution: vec2<f32>,
  _pad1: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_noiseTex: texture_2d<f32>;
@group(0) @binding(3) var u_plantTex: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn rnmBlend(n1: vec3<f32>, n2: vec3<f32>) -> vec3<f32> {
  let t = n1 + vec3<f32>(0.0, 0.0, 1.0);
  let u = n2 * vec3<f32>(-1.0, -1.0, 1.0);
  return normalize(t * dot(t, u) - u * t.z);
}

fn heightAt(uv: vec2<f32>, time: f32) -> f32 {
  let uv3 = uv * uniforms.u_noiseScale3 + vec2<f32>(time * uniforms.u_noiseSpeed3, -time * uniforms.u_noiseSpeed3);
  let h = textureSample(u_noiseTex, u_sampler, uv3).b * 2.0 - 1.0;
  return h * uniforms.u_noiseAmp3_px;
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out: VertexOut;
  let pos = positions[vertexIndex];
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2<f32>(0.5, 0.5);
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let time = uniforms.u_time * uniforms.u_timeScale;
  let resolution = max(uniforms.u_resolution, vec2<f32>(1.0, 1.0));
  let pxToUv = 1.0 / resolution;

  let uv1 = in.uv * uniforms.u_noiseScale1 + vec2<f32>(time * uniforms.u_noiseSpeed1, -time * uniforms.u_noiseSpeed1);
  let uv2 = in.uv * uniforms.u_noiseScale2 + vec2<f32>(-time * uniforms.u_noiseSpeed2, time * uniforms.u_noiseSpeed2 * 0.8);
  let uv3 = in.uv * uniforms.u_noiseScale3 + vec2<f32>(time * uniforms.u_noiseSpeed3, -time * uniforms.u_noiseSpeed3);

  let n1 = textureSample(u_noiseTex, u_sampler, uv1).r * 2.0 - 1.0;
  let n2 = textureSample(u_noiseTex, u_sampler, uv2).g * 2.0 - 1.0;
  let n3 = textureSample(u_noiseTex, u_sampler, uv3).b * 2.0 - 1.0;
  let height = n3 * uniforms.u_noiseAmp3_px;

  let stiffness = mix(1.0, 0.45, uniforms.u_stiffness);
  let displacementPx = vec2<f32>(n1 * uniforms.u_noiseAmp1_px, n2 * uniforms.u_noiseAmp2_px) * stiffness;
  let displacedUv = (in.uv * resolution + displacementPx) / resolution;

  let heightL = heightAt(in.uv - vec2<f32>(pxToUv.x, 0.0), time);
  let heightR = heightAt(in.uv + vec2<f32>(pxToUv.x, 0.0), time);
  let heightD = heightAt(in.uv - vec2<f32>(0.0, pxToUv.y), time);
  let heightU = heightAt(in.uv + vec2<f32>(0.0, pxToUv.y), time);
  let grad = vec2<f32>(heightR - heightL, heightU - heightD);
  var normal = normalize(vec3<f32>(-grad * uniforms.u_normalStrength, 1.0));

  let plantUv = displacedUv * (1.0 + uniforms.u_veinWander * 0.35)
    + vec2<f32>(time * 0.02, -time * 0.018) * uniforms.u_veinWander;
  let plant = textureSample(u_plantTex, u_sampler, plantUv);

  let minRes = min(resolution.x, resolution.y);
  let veinEdge = (uniforms.u_veinThickness_px / minRes) * 1.25;
  let mycEdge = (uniforms.u_myceliumThickness_px / minRes) * 1.35;
  let lichenEdge = (uniforms.u_lichenEdgeFeather_px / minRes) * 1.4;

  let veinMask = smoothstep(0.35 - veinEdge, 0.35 + veinEdge, plant.r * uniforms.u_veinDensity);
  let mycPulse = 0.5 + 0.5 * sin(time * 6.2831 * uniforms.u_myceliumPulseHz + plant.g * 6.2831);
  let mycMask = smoothstep(
    0.45 - mycEdge,
    0.45 + mycEdge,
    (plant.g * uniforms.u_myceliumDensity + mycPulse * uniforms.u_myceliumSpread) * 0.9
  );
  let lichenMask = smoothstep(
    uniforms.u_lichenCoverage - lichenEdge,
    uniforms.u_lichenCoverage + lichenEdge,
    plant.b * uniforms.u_lichenPatchScale
  );

  var veinWeight = veinMask * uniforms.u_veinGrowth * uniforms.u_veinContrast;
  var mycWeight = mycMask * uniforms.u_myceliumAnisotropy;
  var lichenWeight = lichenMask * uniforms.u_lichenMatte;

  veinWeight = select(0.0, veinWeight, veinWeight > 0.12);
  mycWeight = select(0.0, mycWeight, mycWeight > 0.12);
  lichenWeight = select(0.0, lichenWeight, lichenWeight > 0.12);
  let weightSum = veinWeight + mycWeight + lichenWeight;
  if (weightSum > 0.0) {
    veinWeight = veinWeight / weightSum;
    mycWeight = mycWeight / weightSum;
    lichenWeight = lichenWeight / weightSum;
  }

  let plantHeight = (plant.a * 2.0 - 1.0) * uniforms.u_noiseAmp3_px * 0.35;
  let heightBlend = clamp(
    height + plantHeight * (veinWeight + mycWeight + lichenWeight),
    -uniforms.u_noiseAmp3_px,
    uniforms.u_noiseAmp3_px
  );
  let heightFactor = mix(-0.03, 0.03, clamp(heightBlend / (uniforms.u_noiseAmp3_px * 2.0) + 0.5, 0.0, 1.0));

  let veinGrad = vec2<f32>(dpdx(veinMask), dpdy(veinMask));
  let mycGrad = vec2<f32>(dpdx(mycMask), dpdy(mycMask));
  let lichenGrad = vec2<f32>(dpdx(lichenMask), dpdy(lichenMask));
  let veinNormal = normalize(vec3<f32>(-veinGrad * 0.6, 1.0));
  let mycNormal = normalize(vec3<f32>(-mycGrad * 0.55, 1.0));
  let lichenNormal = normalize(vec3<f32>(-lichenGrad * 0.45, 1.0));

  normal = mix(normal, rnmBlend(normal, veinNormal), veinWeight);
  normal = mix(normal, rnmBlend(normal, mycNormal), mycWeight);
  normal = mix(normal, rnmBlend(normal, lichenNormal), lichenWeight);

  let lightDir = normalize(vec3<f32>(0.35, 0.5, 1.0));
  let viewDir = vec3<f32>(0.0, 0.0, 1.0);
  let ndl = dot(normal, lightDir);
  let wrap = clamp((ndl + uniforms.u_wrap) / (1.0 + uniforms.u_wrap), 0.0, 1.0);
  let diff = mix(0.25, 1.0, wrap);
  let roughness = clamp(uniforms.u_roughness + lichenWeight * 0.12, 0.05, 1.0);
  let specPower = mix(64.0, 12.0, roughness);
  let spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), specPower) * uniforms.u_specular;
  let subsurface = pow(clamp(1.0 - ndl, 0.0, 1.0), 2.0) * uniforms.u_subsurface;

  let dayShift = sin(uniforms.u_circadianPhase * 6.2831) * 0.5 + 0.5;
  var baseColor = mix(vec3<f32>(0.2, 0.34, 0.3), vec3<f32>(0.36, 0.62, 0.52), dayShift);
  baseColor = baseColor * (0.9 + uniforms.u_vitality * 0.2);

  var color = baseColor * (diff + subsurface * 0.35) + vec3<f32>(spec);
  color = color + vec3<f32>(heightFactor);
  color = mix(color, color * 0.92 + vec3<f32>(0.05, 0.08, 0.05), veinWeight * 0.6);
  color = mix(color, color * 0.95 + vec3<f32>(0.03, 0.04, 0.02), mycWeight * 0.4);
  color = mix(color, color * 0.98 + vec3<f32>(0.05), lichenWeight * 0.35);

  let ao = mix(1.0, 0.85, veinWeight * 0.4 + mycWeight * 0.3);
  color = color * ao;

  var pulse = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    let fi = f32(i);
    let active = select(0.0, 1.0, fi <= uniforms.u_pulseCount - 0.5);
    let center = vec2<f32>(0.5, 0.5) + vec2<f32>(
      cos(time * 0.15 + fi * 2.1),
      sin(time * 0.13 + fi * 1.8)
    ) * 0.22;
    let distPx = length((displacedUv - center) * resolution);
    let wave = abs(distPx - (time * (40.0 + fi * 20.0) * uniforms.u_pulseSpeed));
    let ring = smoothstep(uniforms.u_pulseWidth_px, 0.0, wave);
    let interference = sin(distPx * 0.06 + time * uniforms.u_pulseSpeed * 4.0 + fi) * 0.5 + 0.5;
    pulse = pulse + ring * mix(1.0, interference, uniforms.u_pulseInterference) * active;
  }
  pulse = clamp(pulse * (uniforms.u_pulseEnergy / max(1.0, uniforms.u_pulseCount)), 0.0, 0.6);
  color = color + vec3<f32>(0.06, 0.09, 0.08) * pulse;

  let fractureIntensity = uniforms.u_fractureOn / (1.0 + uniforms.u_healTime_s);
  if (fractureIntensity > 0.001) {
    let fracUv = displacedUv * 2.2 + vec2<f32>(uniforms.u_fractureSeed, -uniforms.u_fractureSeed);
    let crack = smoothstep(0.65, 0.94, textureSample(u_noiseTex, u_sampler, fracUv).g);
    let fractureScale = clamp(uniforms.u_fractureMagnitude_px / 2.0, 0.0, 1.0);
    let vignette = smoothstep(0.9, 0.2, length(displacedUv - 0.5));
    let fractureMask = mix(vignette, crack, fractureScale);
    let tint = fractureIntensity * mix(0.03, 0.08, fractureScale);
    let fractureOffset = (crack * uniforms.u_fractureMagnitude_px) * pxToUv;
    let chromaUv = displacedUv + fractureOffset * 0.5 + (crack * uniforms.u_chromaSplit_px) * pxToUv;
    let chroma = textureSample(u_noiseTex, u_sampler, chromaUv).b * 0.5;
    color = color * (1.0 - tint * fractureMask);
    color = color + vec3<f32>(0.08, 0.02, 0.04) * tint * fractureMask;
    color = color + vec3<f32>(chroma * 0.01, -chroma * 0.005, chroma * 0.008);
  }

  let grain = textureSample(u_noiseTex, u_sampler, displacedUv * uniforms.u_grainScale + time * uniforms.u_grainDriftSpeed).a;
  color = color + (grain - 0.5) * uniforms.u_grainStrength;

  color = color + vec3<f32>(uniforms.u_tempShift, uniforms.u_greenBias, uniforms.u_blueBias);
  let luma = dot(color, vec3<f32>(0.299, 0.587, 0.114));
  color = mix(vec3<f32>(luma), color, uniforms.u_saturation);
  color = (color - 0.5) * uniforms.u_contrast + 0.5;

  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(color, 1.0);
}
`;

const packUniforms = (
  uniforms: Uniforms,
  resolution: { width: number; height: number },
) => {
  const data = new Float32Array(56);
  const values = [
    uniforms.u_time,
    uniforms.u_timeScale,
    uniforms.u_circadianPhase,
    uniforms.u_noiseScale1,
    uniforms.u_noiseScale2,
    uniforms.u_noiseScale3,
    uniforms.u_noiseSpeed1,
    uniforms.u_noiseSpeed2,
    uniforms.u_noiseSpeed3,
    uniforms.u_noiseAmp1_px,
    uniforms.u_noiseAmp2_px,
    uniforms.u_noiseAmp3_px,
    uniforms.u_stiffness,
    uniforms.u_normalStrength,
    uniforms.u_specular,
    uniforms.u_roughness,
    uniforms.u_subsurface,
    uniforms.u_wrap,
    uniforms.u_tempShift,
    uniforms.u_greenBias,
    uniforms.u_blueBias,
    uniforms.u_saturation,
    uniforms.u_contrast,
    uniforms.u_grainStrength,
    uniforms.u_grainScale,
    uniforms.u_grainDriftSpeed,
    uniforms.u_vitality,
    uniforms.u_veinDensity,
    uniforms.u_veinThickness_px,
    uniforms.u_veinContrast,
    uniforms.u_veinGrowth,
    uniforms.u_veinWander,
    uniforms.u_myceliumDensity,
    uniforms.u_myceliumThickness_px,
    uniforms.u_myceliumPulseHz,
    uniforms.u_myceliumSpread,
    uniforms.u_myceliumAnisotropy,
    uniforms.u_lichenCoverage,
    uniforms.u_lichenPatchScale,
    uniforms.u_lichenEdgeFeather_px,
    uniforms.u_lichenMatte,
    uniforms.u_pulseCount,
    uniforms.u_pulseSpeed,
    uniforms.u_pulseWidth_px,
    uniforms.u_pulseEnergy,
    uniforms.u_pulseInterference,
    uniforms.u_fractureOn,
    uniforms.u_fractureSeed,
    uniforms.u_fractureMagnitude_px,
    uniforms.u_chromaSplit_px,
    uniforms.u_healTime_s,
  ];
  values.forEach((value, index) => {
    data[index] = value;
  });

  data[51] = 0;
  data[52] = resolution.width;
  data[53] = resolution.height;
  data[54] = 0;
  data[55] = 0;
  return data;
};

const alignBytes = (value: number, alignment: number) =>
  Math.ceil(value / alignment) * alignment;

const createTextureUpload = (texture: {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}) => {
  const bytesPerRow = texture.width * texture.channels;
  const alignedBytesPerRow = alignBytes(bytesPerRow, 256);

  if (bytesPerRow === alignedBytesPerRow) {
    return { data: texture.data, bytesPerRow };
  }

  const padded = new Uint8Array(alignedBytesPerRow * texture.height);
  for (let y = 0; y < texture.height; y += 1) {
    const rowStart = y * bytesPerRow;
    const rowEnd = rowStart + bytesPerRow;
    padded.set(texture.data.subarray(rowStart, rowEnd), y * alignedBytesPerRow);
  }
  return { data: padded, bytesPerRow: alignedBytesPerRow };
};

export class WebGPURenderer implements IRenderer {
  private device: GPUDevice;
  private adapter: GPUAdapter;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private sampler: GPUSampler | null = null;
  private textures: GPUTexture[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private format: GPUTextureFormat | null = null;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(device: GPUDevice, adapter: GPUAdapter) {
    this.device = device;
    this.adapter = adapter;
  }

  static async create(): Promise<WebGPURenderer | null> {
    if (typeof navigator === "undefined") {
      return null;
    }
    const gpu = navigator.gpu;
    if (!gpu) {
      return null;
    }
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        return null;
      }
      const device = await adapter.requestDevice();
      return new WebGPURenderer(device, adapter);
    } catch {
      return null;
    }
  }

  init(canvas: HTMLCanvasElement, resources: RendererResources): void {
    if (!this.device) {
      throw new Error("WebGPU device missing");
    }
    const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!context) {
      throw new Error("WebGPU context not available");
    }
    this.canvas = canvas;
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    if (!this.format) {
      throw new Error("WebGPU format not available");
    }

    const shaderModule = this.device.createShaderModule({
      code: WGSL_SHADER,
    });
    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.uniformBuffer = this.device.createBuffer({
      size: alignBytes(56 * 4, 256),
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });

    this.textures = resources.textures.map((texture) => {
      const format = texture.format === "r8" ? "r8unorm" : "rgba8unorm";
      const gpuTexture = this.device.createTexture({
        size: { width: texture.width, height: texture.height },
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      const upload = createTextureUpload(texture);
      const uploadData =
        upload.data.buffer instanceof ArrayBuffer
          ? (upload.data as Uint8Array<ArrayBuffer>)
          : new Uint8Array(upload.data);
      this.device.queue.writeTexture(
        { texture: gpuTexture },
        uploadData,
        { bytesPerRow: upload.bytesPerRow, rowsPerImage: texture.height },
        { width: texture.width, height: texture.height, depthOrArrayLayers: 1 },
      );
      return gpuTexture;
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.textures[0].createView() },
        { binding: 3, resource: this.textures[1].createView() },
      ],
    });
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.context || !this.canvas || !this.format) {
      return;
    }
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    const pixelWidth = Math.max(1, Math.floor(width * dpr));
    const pixelHeight = Math.max(1, Math.floor(height * dpr));
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  render(uniforms: Uniforms): void {
    if (!this.device || !this.context || !this.pipeline || !this.uniformBuffer) {
      return;
    }

    const packed = packUniforms(uniforms, {
      width: this.cssWidth,
      height: this.cssHeight,
    });
    this.device.queue.writeBuffer(this.uniformBuffer, 0, packed.buffer);

    const encoder = this.device.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.textures.forEach((texture) => texture.destroy());
    this.textures = [];
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.pipeline = null;
    this.sampler = null;
    this.context = null;
    this.canvas = null;
    if (this.device?.destroy) {
      this.device.destroy();
    }
  }
}
