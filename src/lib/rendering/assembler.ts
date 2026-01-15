// src/lib/rendering/assembler.ts
import { Phenotype, LimbType } from "../simulation/types";
import { RenderNode, ShapeType } from "./types";
import { v4 as uuidv4 } from "uuid";

/**
 * Assemble a RenderNode tree from a Phenotype.
 * Notes:
 * - This file is intentionally "visual-first": phenotype invariants should read clearly in silhouette.
 * - We avoid Math.random() where possible to keep results stable across runs.
 */
export function assembleOrganism(phenotype: Phenotype): RenderNode {
  // Deterministic-ish RNG seeded from phenotype (keeps reef clusters stable)
  const rng = makeRngFromPhenotype(phenotype);

  // Base color determination (simple mapping for now)
  const baseColor = getBaseColor(phenotype);

  const core: RenderNode = {
    id: uuidv4(),
    type: "core",
    // Prefer oval core for non-ovoid plans so the silhouette is less "perfect ball"
    shape: phenotype.bodyPlan === "ovoid_generalist" ? "circle" : "oval",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: {
      x: phenotype.axialScale[0] * 2,
      y: phenotype.axialScale[1] * 2,
    },
    color: baseColor,
    opacity: 1.0,
    zIndex: 100,
    children: [],
  };

  // Construct body based on plan
  switch (phenotype.bodyPlan) {
    case "segmented_crawler":
    case "arthropod_walker":
      buildSegmentedBody(core, phenotype, baseColor);
      break;

    case "cephalopod_swimmer":
      buildCephalopodBody(core, phenotype, baseColor);
      break;

    case "sessile_reef":
      buildReefBody(core, phenotype, baseColor, rng);
      break;

    case "ovoid_generalist":
    default:
      // Simple appendages so it isn't just a ball
      if (phenotype.limbPairs > 0) {
        addLimbs(core, phenotype, baseColor, 0);
      }
      if (phenotype.limbPairs === 0) {
        addFeelers(core, phenotype, baseColor);
      }
      break;
  }

  return core;
}

function buildSegmentedBody(core: RenderNode, p: Phenotype, color: string) {
  let currentSegment = core;

  // Tighter segment spacing reads more like "segmentation" than a long chain of spheres.
  const stepX = p.axialScale[0] * (p.bodyPlan === "arthropod_walker" ? 1.25 : 1.4);

  for (let i = 0; i < p.segmentCount; i += 1) {
    // Taper toward the tail
    const taper = 1.0 - (i / Math.max(1, p.segmentCount)) * 0.6;

    // Arthropods read better with slightly flattened plates
    const isArthropod = p.bodyPlan === "arthropod_walker";
    const segShape: ShapeType = isArthropod ? "oval" : "circle";

    const segment: RenderNode = {
      id: uuidv4(),
      type: "body_segment",
      shape: segShape,
      position: { x: stepX, y: 0 },
      rotation: 0,
      scale: {
        x: p.axialScale[0] * taper,
        y: p.axialScale[1] * taper * (isArthropod ? 0.75 : 1.0),
      },
      color,
      opacity: 1.0,
      zIndex: 100 - i,
      children: [],
      animationTag: `seg_${i}`,
    };

    // Add limbs to segments (walkers: most segments; crawlers: fewer)
    if (i < p.limbPairs) {
      addLimbs(segment, p, color, i);
    }

    currentSegment.children.push(segment);
    currentSegment = segment;
  }
}

function buildCephalopodBody(core: RenderNode, p: Phenotype, color: string) {
  // Head is the core. Tentacles radiate around it.
  const totalArms = Math.max(2, p.limbPairs * 2);

  for (let i = 0; i < totalArms; i += 1) {
    const angle = (i / totalArms) * Math.PI * 2;
    const tentacleBase: RenderNode = {
      id: uuidv4(),
      type: "limb",
      shape: "path",
      position: {
        x: Math.cos(angle) * p.axialScale[0],
        y: Math.sin(angle) * p.axialScale[1],
      },
      rotation: angle,
      scale: { x: p.limbThickness, y: p.limbLength },
      color,
      opacity: 1.0,
      zIndex: 90,
      children: [],
      animationTag: `tentacle_${i}`,
    };
    core.children.push(tentacleBase);
  }
}

function buildReefBody(core: RenderNode, p: Phenotype, color: string, rng: () => number) {
  // Sessile: clusters of polyps. Use deterministic RNG so this doesn't flicker across runs.
  const count = Math.max(3, p.segmentCount * 3);

  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * p.axialScale[0] * 2;

    const size = 0.12 + rng() * 0.22;

    const polyp: RenderNode = {
      id: uuidv4(),
      type: "body_segment",
      shape: "circle",
      position: {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
      },
      rotation: 0,
      scale: { x: size, y: size },
      color,
      opacity: 0.85,
      zIndex: 100,
      children: [],
      animationTag: `polyp_${i}`,
    };
    core.children.push(polyp);
  }
}

function addLimbs(parent: RenderNode, p: Phenotype, color: string, index: number) {
  // IMPORTANT: walkers need ventral bilateral legs, NOT radial "tentacles".
  const isWalkerLegs = p.limbType === "leg" && p.locomotion === "walk";

  if (isWalkerLegs) {
    // Two legs per segment (left/right), attached below the body.
    const lateral = p.axialScale[0] * 0.35; // left/right spread
    const down = -p.axialScale[1] * 0.95; // under-body attach
    const splay = 0.28 + 0.12 * (index % 2); // alternating stance for gait feel

    // Prevent "tentacle legs": keep legs proportional to body height.
    const legLen = Math.min(p.limbLength, Math.max(0.6, p.axialScale[1] * 1.35));
    const legThk = Math.max(p.limbThickness, 0.18);

    parent.children.push({
      id: `limb-${uuidv4()}`,
      type: "limb",
      shape: "rect",
      position: { x: +lateral, y: down },
      rotation: -Math.PI / 2 + splay, // mostly downward
      scale: { x: legThk, y: legLen },
      color: darken(color, 20),
      opacity: 1.0,
      zIndex: 50,
      children: [],
      animationTag: `leg_${index}_L`,
    });

    parent.children.push({
      id: `limb-${uuidv4()}`,
      type: "limb",
      shape: "rect",
      position: { x: -lateral, y: down },
      rotation: -Math.PI / 2 - splay,
      scale: { x: legThk, y: legLen },
      color: darken(color, 20),
      opacity: 1.0,
      zIndex: 50,
      children: [],
      animationTag: `leg_${index}_R`,
    });

    return;
  }

  // Existing radial appendage logic for fins/tentacles/cilia/etc.
  const isAsymmetric = p.asymmetry > 0.5;
  const pairCount = isAsymmetric ? 1 : 2;

  const segmentRadius = p.axialScale[1] * 1.2;
  const angleOffset = index * Math.PI * 0.3;

  for (let s = 0; s < pairCount; s += 1) {
    const angle = (s / pairCount) * Math.PI * 2 + angleOffset;

    const attachX = Math.cos(angle) * segmentRadius * 0.3;
    const attachY = Math.sin(angle) * segmentRadius;

    const limb: RenderNode = {
      id: `limb-${uuidv4()}`,
      type: "limb",
      shape: getLimbShape(p.limbType),
      position: { x: attachX, y: attachY },
      rotation: angle + Math.PI / 2,
      scale: { x: p.limbThickness, y: p.limbLength },
      color: darken(color, 20),
      opacity: 1.0,
      zIndex: 50,
      children: [],
      animationTag: `limb_${index}_${s}`,
    };
    parent.children.push(limb);
  }
}

function addFeelers(parent: RenderNode, p: Phenotype, color: string) {
  // Small antennae/feelers to avoid "ball with nothing"
  for (let i = 0; i < 2; i += 1) {
    const angle = -Math.PI / 4 + i * (Math.PI / 2);
    const feeler: RenderNode = {
      id: uuidv4(),
      type: "limb",
      shape: "path",
      position: {
        x: p.axialScale[0] * 0.8,
        y: (i === 0 ? 1 : -1) * p.axialScale[1] * 0.3,
      },
      rotation: angle,
      scale: { x: 0.1, y: 0.8 },
      color,
      opacity: 1.0,
      zIndex: 95,
      children: [],
      animationTag: `feeler_${i}`,
    };
    parent.children.push(feeler);
  }
}

function getLimbShape(type: LimbType): ShapeType {
  if (type === "fin") return "triangle";
  if (type === "wing") return "triangle";
  if (type === "tentacle") return "path";
  if (type === "cilia") return "path";
  return "rect"; // leg
}

function getBaseColor(p: Phenotype): string {
  // Simple mapping:
  // - High patchCoverage -> green
  // - High motionIntensity -> red
  // - Swim -> blue
  // - Arthropod -> chitin brown
  if (p.patchCoverage > 0.7) return "#2ECC71";
  if (p.motionIntensity > 0.8) return "#E74C3C";
  if (p.locomotion === "swim") return "#3498DB";
  if (p.bodyPlan === "arthropod_walker") return "#D35400";
  return "#BDC3C7";
}

function darken(hex: string, percent: number): string {
  if (!hex.startsWith("#")) return hex;

  const raw = hex.slice(1);
  const expanded =
    raw.length === 3 ? raw.split("").map((c) => `${c}${c}`).join("") : raw;

  if (expanded.length !== 6) return hex;

  const num = parseInt(expanded, 16);
  if (Number.isNaN(num)) return hex;

  const factor = Math.max(0, Math.min(1, 1 - percent / 100));
  const r = Math.round(((num >> 16) & 0xff) * factor);
  const g = Math.round(((num >> 8) & 0xff) * factor);
  const b = Math.round((num & 0xff) * factor);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Create a deterministic RNG from phenotype values so "reef" clusters
 * don't flicker across rerenders.
 */
function makeRngFromPhenotype(p: Phenotype): () => number {
  const seed = hashToUint32(stableStringify(p));
  return mulberry32(seed);
}

function stableStringify(value: unknown): string {
  try {
    // Phenotype is a simple POJO; JSON.stringify is stable enough here.
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function hashToUint32(input: string): number {
  // FNV-1a-ish
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
