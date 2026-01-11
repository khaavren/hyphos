import type { IRenderer, RendererResources, Uniforms } from "../IRenderer";

const VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 POSITIONS[3] = vec2[](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
out vec2 v_uv;
void main() {
  vec2 pos = POSITIONS[gl_VertexID];
  v_uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform sampler2D u_noiseTex;
uniform sampler2D u_plantTex;

uniform float u_time;
uniform float u_timeScale;
uniform float u_circadianPhase;
uniform float u_noiseScale1;
uniform float u_noiseScale2;
uniform float u_noiseScale3;
uniform float u_noiseSpeed1;
uniform float u_noiseSpeed2;
uniform float u_noiseSpeed3;
uniform float u_noiseAmp1_px;
uniform float u_noiseAmp2_px;
uniform float u_noiseAmp3_px;
uniform float u_stiffness;
uniform float u_normalStrength;
uniform float u_specular;
uniform float u_roughness;
uniform float u_subsurface;
uniform float u_wrap;
uniform float u_tempShift;
uniform float u_greenBias;
uniform float u_blueBias;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_grainStrength;
uniform float u_grainScale;
uniform float u_grainDriftSpeed;
uniform float u_vitality;

uniform float u_veinDensity;
uniform float u_veinThickness_px;
uniform float u_veinContrast;
uniform float u_veinGrowth;
uniform float u_veinWander;
uniform float u_myceliumDensity;
uniform float u_myceliumThickness_px;
uniform float u_myceliumPulseHz;
uniform float u_myceliumSpread;
uniform float u_myceliumAnisotropy;
uniform float u_lichenCoverage;
uniform float u_lichenPatchScale;
uniform float u_lichenEdgeFeather_px;
uniform float u_lichenMatte;

uniform float u_pulseCount;
uniform float u_pulseSpeed;
uniform float u_pulseWidth_px;
uniform float u_pulseEnergy;
uniform float u_pulseInterference;

uniform float u_fractureOn;
uniform float u_fractureSeed;
uniform float u_fractureMagnitude_px;
uniform float u_chromaSplit_px;
uniform float u_healTime_s;

float remap(float value, float inMin, float inMax, float outMin, float outMax) {
  float t = clamp((value - inMin) / (inMax - inMin), 0.0, 1.0);
  return mix(outMin, outMax, t);
}

vec3 rnmBlend(vec3 n1, vec3 n2) {
  vec3 t = n1 + vec3(0.0, 0.0, 1.0);
  vec3 u = n2 * vec3(-1.0, -1.0, 1.0);
  return normalize(t * dot(t, u) - u * t.z);
}

float heightAt(vec2 uv, float time) {
  vec2 uv3 = uv * u_noiseScale3 + vec2(time * u_noiseSpeed3, -time * u_noiseSpeed3);
  float h = texture(u_noiseTex, uv3).b * 2.0 - 1.0;
  return h * u_noiseAmp3_px;
}

void main() {
  float time = u_time * u_timeScale;
  vec2 resolution = max(u_resolution, vec2(1.0));
  vec2 pxToUv = 1.0 / resolution;

  vec2 uv1 = v_uv * u_noiseScale1 + vec2(time * u_noiseSpeed1, -time * u_noiseSpeed1);
  vec2 uv2 = v_uv * u_noiseScale2 + vec2(-time * u_noiseSpeed2, time * u_noiseSpeed2 * 0.8);
  vec2 uv3 = v_uv * u_noiseScale3 + vec2(time * u_noiseSpeed3, -time * u_noiseSpeed3);

  float n1 = texture(u_noiseTex, uv1).r * 2.0 - 1.0;
  float n2 = texture(u_noiseTex, uv2).g * 2.0 - 1.0;
  float n3 = texture(u_noiseTex, uv3).b * 2.0 - 1.0;

  float stiffness = mix(1.0, 0.45, u_stiffness);
  vec2 displacementPx = vec2(n1 * u_noiseAmp1_px, n2 * u_noiseAmp2_px) * stiffness;
  vec2 displacedUv = (v_uv * resolution + displacementPx) / resolution;

  float height = n3 * u_noiseAmp3_px;
  float heightL = heightAt(v_uv - vec2(pxToUv.x, 0.0), time);
  float heightR = heightAt(v_uv + vec2(pxToUv.x, 0.0), time);
  float heightD = heightAt(v_uv - vec2(0.0, pxToUv.y), time);
  float heightU = heightAt(v_uv + vec2(0.0, pxToUv.y), time);

  vec2 grad = vec2(heightR - heightL, heightU - heightD);
  vec3 normal = normalize(vec3(-grad * u_normalStrength, 1.0));

  vec2 plantUv = displacedUv * (1.0 + u_veinWander * 0.35)
    + vec2(time * 0.02, -time * 0.018) * u_veinWander;
  vec4 plant = texture(u_plantTex, plantUv);

  float minRes = min(resolution.x, resolution.y);
  float veinEdge = (u_veinThickness_px / minRes) * 1.25;
  float mycEdge = (u_myceliumThickness_px / minRes) * 1.35;
  float lichenEdge = (u_lichenEdgeFeather_px / minRes) * 1.4;

  float veinMask = smoothstep(0.35 - veinEdge, 0.35 + veinEdge, plant.r * u_veinDensity);
  float mycPulse = 0.5 + 0.5 * sin(time * 6.2831 * u_myceliumPulseHz + plant.g * 6.2831);
  float mycMask = smoothstep(
    0.45 - mycEdge,
    0.45 + mycEdge,
    (plant.g * u_myceliumDensity + mycPulse * u_myceliumSpread) * 0.9
  );
  float lichenMask = smoothstep(
    u_lichenCoverage - lichenEdge,
    u_lichenCoverage + lichenEdge,
    plant.b * u_lichenPatchScale
  );

  float veinWeight = veinMask * u_veinGrowth * u_veinContrast;
  float mycWeight = mycMask * u_myceliumAnisotropy;
  float lichenWeight = lichenMask * u_lichenMatte;

  veinWeight = veinWeight > 0.12 ? veinWeight : 0.0;
  mycWeight = mycWeight > 0.12 ? mycWeight : 0.0;
  lichenWeight = lichenWeight > 0.12 ? lichenWeight : 0.0;
  float weightSum = veinWeight + mycWeight + lichenWeight;
  if (weightSum > 0.0) {
    veinWeight /= weightSum;
    mycWeight /= weightSum;
    lichenWeight /= weightSum;
  }

  float plantHeight = (plant.a * 2.0 - 1.0) * u_noiseAmp3_px * 0.35;
  float heightBlend = clamp(
    height + plantHeight * (veinWeight + mycWeight + lichenWeight),
    -u_noiseAmp3_px,
    u_noiseAmp3_px
  );
  float heightFactor = remap(heightBlend, -u_noiseAmp3_px, u_noiseAmp3_px, -0.03, 0.03);

  vec2 veinGrad = vec2(dFdx(veinMask), dFdy(veinMask));
  vec2 mycGrad = vec2(dFdx(mycMask), dFdy(mycMask));
  vec2 lichenGrad = vec2(dFdx(lichenMask), dFdy(lichenMask));
  vec3 veinNormal = normalize(vec3(-veinGrad * 0.6, 1.0));
  vec3 mycNormal = normalize(vec3(-mycGrad * 0.55, 1.0));
  vec3 lichenNormal = normalize(vec3(-lichenGrad * 0.45, 1.0));

  normal = mix(normal, rnmBlend(normal, veinNormal), veinWeight);
  normal = mix(normal, rnmBlend(normal, mycNormal), mycWeight);
  normal = mix(normal, rnmBlend(normal, lichenNormal), lichenWeight);

  vec3 lightDir = normalize(vec3(0.35, 0.5, 1.0));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float ndl = dot(normal, lightDir);
  float wrap = clamp((ndl + u_wrap) / (1.0 + u_wrap), 0.0, 1.0);
  float diff = mix(0.25, 1.0, wrap);
  float roughness = clamp(u_roughness + lichenWeight * 0.12, 0.05, 1.0);
  float specPower = mix(64.0, 12.0, roughness);
  float spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), specPower) * u_specular;
  float subsurface = pow(clamp(1.0 - ndl, 0.0, 1.0), 2.0) * u_subsurface;

  float dayShift = sin(u_circadianPhase * 6.2831) * 0.5 + 0.5;
  vec3 baseColor = mix(vec3(0.2, 0.34, 0.3), vec3(0.36, 0.62, 0.52), dayShift);
  baseColor *= 0.9 + u_vitality * 0.2;

  vec3 color = baseColor * (diff + subsurface * 0.35) + vec3(spec);
  color += vec3(heightFactor);
  color = mix(color, color * 0.92 + vec3(0.05, 0.08, 0.05), veinWeight * 0.6);
  color = mix(color, color * 0.95 + vec3(0.03, 0.04, 0.02), mycWeight * 0.4);
  color = mix(color, color * 0.98 + vec3(0.05), lichenWeight * 0.35);

  float ao = mix(1.0, 0.85, veinWeight * 0.4 + mycWeight * 0.3);
  color *= ao;

  float pulse = 0.0;
  for (int i = 0; i < 3; i += 1) {
    float fi = float(i);
    float active = step(fi, u_pulseCount - 0.5);
    vec2 center = vec2(0.5) + vec2(
      cos(time * 0.15 + fi * 2.1),
      sin(time * 0.13 + fi * 1.8)
    ) * 0.22;
    float distPx = length((displacedUv - center) * resolution);
    float wave = abs(distPx - (time * (40.0 + fi * 20.0) * u_pulseSpeed));
    float ring = smoothstep(u_pulseWidth_px, 0.0, wave);
    float interference = sin(distPx * 0.06 + time * u_pulseSpeed * 4.0 + fi) * 0.5 + 0.5;
    pulse += ring * mix(1.0, interference, u_pulseInterference) * active;
  }
  pulse = clamp(pulse * (u_pulseEnergy / max(1.0, u_pulseCount)), 0.0, 0.6);
  color += vec3(0.06, 0.09, 0.08) * pulse;

  float fractureIntensity = u_fractureOn / (1.0 + u_healTime_s);
  if (fractureIntensity > 0.001) {
    vec2 fracUv = displacedUv * 2.2 + vec2(u_fractureSeed, -u_fractureSeed);
    float crack = smoothstep(0.65, 0.94, texture(u_noiseTex, fracUv).g);
    float fractureScale = clamp(u_fractureMagnitude_px / 2.0, 0.0, 1.0);
    float vignette = smoothstep(0.9, 0.2, length(displacedUv - 0.5));
    float fractureMask = mix(vignette, crack, fractureScale);
    float tint = fractureIntensity * mix(0.03, 0.08, fractureScale);
    vec2 fractureOffset = (crack * u_fractureMagnitude_px) * pxToUv;
    vec2 chromaUv = displacedUv + fractureOffset * 0.5 + (crack * u_chromaSplit_px) * pxToUv;
    float chroma = texture(u_noiseTex, chromaUv).b * 0.5;
    color *= 1.0 - tint * fractureMask;
    color += vec3(0.08, 0.02, 0.04) * tint * fractureMask;
    color += vec3(chroma * 0.01, -chroma * 0.005, chroma * 0.008);
  }

  float grain = texture(u_noiseTex, displacedUv * u_grainScale + time * u_grainDriftSpeed).a;
  color += (grain - 0.5) * u_grainStrength;

  color.r += u_tempShift;
  color.g += u_greenBias;
  color.b += u_blueBias;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, u_saturation);
  color = (color - 0.5) * u_contrast + 0.5;

  color = clamp(color, 0.0, 1.0);
  outColor = vec4(color, 1.0);
}
`;

const UNIFORM_NAMES: (keyof Uniforms)[] = [
  "u_time",
  "u_timeScale",
  "u_circadianPhase",
  "u_noiseScale1",
  "u_noiseScale2",
  "u_noiseScale3",
  "u_noiseSpeed1",
  "u_noiseSpeed2",
  "u_noiseSpeed3",
  "u_noiseAmp1_px",
  "u_noiseAmp2_px",
  "u_noiseAmp3_px",
  "u_stiffness",
  "u_normalStrength",
  "u_specular",
  "u_roughness",
  "u_subsurface",
  "u_wrap",
  "u_tempShift",
  "u_greenBias",
  "u_blueBias",
  "u_saturation",
  "u_contrast",
  "u_grainStrength",
  "u_grainScale",
  "u_grainDriftSpeed",
  "u_vitality",
  "u_veinDensity",
  "u_veinThickness_px",
  "u_veinContrast",
  "u_veinGrowth",
  "u_veinWander",
  "u_myceliumDensity",
  "u_myceliumThickness_px",
  "u_myceliumPulseHz",
  "u_myceliumSpread",
  "u_myceliumAnisotropy",
  "u_lichenCoverage",
  "u_lichenPatchScale",
  "u_lichenEdgeFeather_px",
  "u_lichenMatte",
  "u_pulseCount",
  "u_pulseSpeed",
  "u_pulseWidth_px",
  "u_pulseEnergy",
  "u_pulseInterference",
  "u_fractureOn",
  "u_fractureSeed",
  "u_fractureMagnitude_px",
  "u_chromaSplit_px",
  "u_healTime_s",
];

const createShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
};

const createProgram = (gl: WebGL2RenderingContext) => {
  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create program");
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
};

export class WebGL2Renderer implements IRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniformLocations = new Map<string, WebGLUniformLocation>();
  private textures: WebGLTexture[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private cssWidth = 1;
  private cssHeight = 1;

  init(canvas: HTMLCanvasElement, resources: RendererResources): void {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      throw new Error("WebGL2 not available");
    }
    this.gl = gl;
    this.canvas = canvas;
    this.program = createProgram(gl);
    this.vao = gl.createVertexArray();
    if (!this.vao) {
      throw new Error("Failed to create VAO");
    }

    gl.bindVertexArray(this.vao);
    gl.useProgram(this.program);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    const noiseLocation = gl.getUniformLocation(this.program, "u_noiseTex");
    const plantLocation = gl.getUniformLocation(this.program, "u_plantTex");
    if (noiseLocation) {
      gl.uniform1i(noiseLocation, 0);
    }
    if (plantLocation) {
      gl.uniform1i(plantLocation, 1);
    }

    UNIFORM_NAMES.forEach((name) => {
      const location = gl.getUniformLocation(this.program as WebGLProgram, name);
      if (location) {
        this.uniformLocations.set(name, location);
      }
    });
    const resolutionLocation = gl.getUniformLocation(
      this.program,
      "u_resolution",
    );
    if (resolutionLocation) {
      this.uniformLocations.set("u_resolution", resolutionLocation);
    }

    this.textures = resources.textures.map((texture, index) => {
      const glTexture = gl.createTexture();
      if (!glTexture) {
        throw new Error("Failed to create texture");
      }
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, glTexture);
      const format = texture.channels === 1 ? gl.RED : gl.RGBA;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        format,
        texture.width,
        texture.height,
        0,
        format,
        gl.UNSIGNED_BYTE,
        texture.data,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return glTexture;
    });
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.gl || !this.canvas) {
      return;
    }
    const pixelWidth = Math.max(1, Math.floor(width * dpr));
    const pixelHeight = Math.max(1, Math.floor(height * dpr));
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  render(uniforms: Uniforms): void {
    if (!this.gl || !this.program) {
      return;
    }
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    this.uniformLocations.forEach((location, name) => {
      if (name === "u_resolution") {
        gl.uniform2f(location, this.cssWidth, this.cssHeight);
        return;
      }
      const key = name as keyof Uniforms;
      const value = uniforms[key];
      if (value !== undefined) {
        gl.uniform1f(location, value);
      }
    });

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    if (!this.gl) {
      return;
    }
    this.textures.forEach((texture) => this.gl?.deleteTexture(texture));
    if (this.program) {
      this.gl.deleteProgram(this.program);
    }
    if (this.vao) {
      this.gl.deleteVertexArray(this.vao);
    }
    this.textures = [];
    this.program = null;
    this.vao = null;
    this.gl = null;
  }
}
