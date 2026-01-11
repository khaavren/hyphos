import type { PackedTexture } from "./IRenderer";

let cachedTextures: PackedTexture[] | null = null;

const TEXTURE_SIZE = 256;

const fract = (value: number) => value - Math.floor(value);

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const hash2 = (x: number, y: number) =>
  fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);

const noise2 = (x: number, y: number) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smoothstep(0, 1, fract(x));
  const sy = smoothstep(0, 1, fract(y));

  const n00 = hash2(x0, y0);
  const n10 = hash2(x1, y0);
  const n01 = hash2(x0, y1);
  const n11 = hash2(x1, y1);

  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy;
};

export const getProceduralTextures = (): PackedTexture[] => {
  if (cachedTextures) {
    return cachedTextures;
  }

  const noiseData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const plantData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;

      const base = noise2(u * 6.0, v * 6.0);
      const detail = noise2(u * 28.0 + base * 2.0, v * 28.0 - base * 1.5);
      const ridged = 1.0 - Math.abs(detail * 2.0 - 1.0);
      const cellular = noise2(u * 18.0 + detail * 3.0, v * 18.0);

      const warp = noise2(u * 2.5, v * 2.5);
      const vein = 1.0 - Math.abs(noise2(u * 20.0 + warp * 2.0, v * 8.0) * 2 - 1);
      const mycelium = Math.abs(
        Math.sin((u + warp * 0.6) * 18.0 + v * 5.5),
      );
      const lichen = noise2(u * 3.0 - warp * 1.4, v * 3.0 + warp * 1.1);

      const veinMask = Math.pow(vein, 1.8);
      const myceliumMask = Math.pow(mycelium, 2.2);
      const lichenMask = Math.pow(lichen, 1.5);
      const height = smoothstep(0.15, 0.9, base + detail * 0.4);

      const idx = (y * TEXTURE_SIZE + x) * 4;
      noiseData[idx] = Math.round(base * 255);
      noiseData[idx + 1] = Math.round(ridged * 255);
      noiseData[idx + 2] = Math.round(detail * 255);
      noiseData[idx + 3] = Math.round(cellular * 255);

      plantData[idx] = Math.round(veinMask * 255);
      plantData[idx + 1] = Math.round(myceliumMask * 255);
      plantData[idx + 2] = Math.round(lichenMask * 255);
      plantData[idx + 3] = Math.round(height * 255);
    }
  }

  cachedTextures = [
    {
      name: "noise",
      width: TEXTURE_SIZE,
      height: TEXTURE_SIZE,
      channels: 4,
      format: "rgba8",
      data: noiseData,
    },
    {
      name: "plants",
      width: TEXTURE_SIZE,
      height: TEXTURE_SIZE,
      channels: 4,
      format: "rgba8",
      data: plantData,
    },
  ];

  return cachedTextures;
};
