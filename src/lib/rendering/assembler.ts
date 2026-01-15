// src/lib/rendering/assembler.ts
import { Phenotype, LimbType } from "../simulation/types";
import { RenderNode, ShapeType } from "./types";
import { v4 as uuidv4 } from "uuid";

/**
 * Assemble a RenderNode tree from a Phenotype.
 * Visual-first: phenotype invariants should read clearly in silhouette.
 * Deterministic where possible (avoid Math.random for stable outputs).
 */
export function assembleOrganism(phenotype: Phenotype): RenderNode {
  const rng = makeRngFromPhenotype(phenotype);
  const baseColor = getBaseColor(phenotype);

  // NOTE: Keep core as the origin anchor. For most plans we build a forward chain
  // so that "front" is +X and "down" is -Y (matches the renderer assumptions).
  const core: RenderNode = {
    id: uuidv4(),
    type: "core",
    shape: phenotype.bodyPlan === "ovoid_generalist" ? "circle" : "oval",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: phenotype.axialScale[0] * 2, y: phenotype.axialScale[1] * 2 },
    color: baseColor,
    opacity: 1.0,
    zIndex: 100,
    children: [],
    animationTag: "core",
  };

  switch (phenotype.bodyPlan) {
    case "arthropod_walker":
      buildArthropod(core, phenotype, baseColor);
      break;

    case "segmented_crawler":
      buildSegmentedCrawler(core, phenotype, baseColor);
      break;

    case "cephalopod_swimmer":
      buildCephalopodBody(core, phenotype, baseColor);
      break;

    case "sessile_reef":
      buildReefBody(core, phenotype, baseColor, rng);
      break;

    case "ovoid_generalist":
    default:
      buildOvoid(core, phenotype, baseColor);
      break;
  }

  // Add a tiny directional cue so it never reads as “just a ball”
  addFaceCue(core, phenotype, baseColor);

  return core;
}

/* ------------------------------ Body Plans ------------------------------ */

function buildOvoid(core: RenderNode, p: Phenotype, color: string) {
  // Keep it simple but readable: a tail + feelers so it isn't just a blob.
  addTail(core, p, color);

  if (p.limbPairs > 0) {
    // Use non-walker limb layout (radial fins/tentacles).
    addRadialLimbs(core, p, color, 0);
  } else {
    addFeelers(core, p, color);
  }
}

function buildSegmentedCrawler(core: RenderNode, p: Phenotype, color: string) {
  // A single chain of tapered segments extending in +X
  const segCount = Math.max(2, p.segmentCount);
  const stepX = p.axialScale[0] * 1.35;

  let current = core;
  for (let i = 0; i < segCount; i += 1) {
    const taper = 1.0 - (i / Math.max(1, segCount - 1)) * 0.55;

    const segment: RenderNode = {
      id: uuidv4(),
      type: "body_segment",
      shape: "circle",
      position: { x: stepX, y: 0 },
      rotation: 0,
      scale: {
        x: p.axialScale[0] * 1.2 * taper,
        y: p.axialScale[1] * 0.95 * taper,
      },
      color,
      opacity: 1.0,
      zIndex: 98 - i,
      children: [],
      animationTag: `seg_${i}`,
    };

    // Add small ventral cilia "feet" for crawling read
    addCrawlerCilia(segment, p, color, i);

    current.children.push(segment);
    current = segment;
  }

  addTail(current, p, color);
}

function buildArthropod(core: RenderNode, p: Phenotype, color: string) {
  // Build a single readable chain:
  // head -> thorax -> abdomen -> tail segments...
  const stepX = p.axialScale[0] * 1.25;

  const head: RenderNode = {
    id: uuidv4(),
    type: "body_segment",
    shape: "oval",
    position: { x: stepX * 0.4, y: 0 },
    rotation: 0,
    scale: { x: p.axialScale[0] * 1.0, y: p.axialScale[1] * 0.75 },
    color,
    opacity: 1.0,
    zIndex: 112,
    children: [],
    animationTag: "seg_head",
  };

  const thorax: RenderNode = {
    id: uuidv4(),
    type: "body_segment",
    shape: "oval",
    position: { x: stepX * 1.25, y: 0 },
    rotation: 0,
    scale: { x: p.axialScale[0] * 1.65, y: p.axialScale[1] * 1.05 },
    color,
    opacity: 1.0,
    zIndex: 110,
    children: [],
    animationTag: "seg_thorax",
  };

  const abdomen: RenderNode = {
    id: uuidv4(),
    type: "body_segment",
    shape: "oval",
    position: { x: stepX * 1.25, y: 0 },
    rotation: 0,
    scale: { x: p.axialScale[0] * 1.55, y: p.axialScale[1] * 0.9 },
    color,
    opacity: 1.0,
    zIndex: 108,
    children: [],
    animationTag: "seg_abdomen",
  };

  core.children.push(head);
  head.children.push(thorax);
  thorax.children.push(abdomen);

  // Legs should primarily be on thorax (classic arthropod read).
  addWalkerLegPairs(thorax, p, color);

  // Add a couple of smaller abdominal segments (tapering) to make it read as articulated.
  const extraSegs = clampInt(Math.max(0, p.segmentCount - 3), 2, 6);
  let current = abdomen;
  for (let i = 0; i < extraSegs; i += 1) {
    const taper = 1.0 - (i / Math.max(1, extraSegs)) * 0.65;

    const seg: RenderNode = {
      id: uuidv4(),
      type: "body_segment",
      shape: "oval",
      position: { x: stepX * 1.05, y: 0 },
      rotation: 0,
      scale: {
        x: p.axialScale[0] * 1.25 * taper,
        y: p.axialScale[1] * 0.75 * taper,
      },
      color,
      opacity: 1.0,
      zIndex: 104 - i,
      children: [],
      animationTag: `seg_${i}`,
    };

    // Optional small rear legs for some species; keep subtle
    if (i === 0 && p.limbPairs >= 4) {
      addWalkerLegPairOnSegment(seg, p, color, 2);
    }

    current.children.push(seg);
    current = seg;
  }

  addTail(current, p, color);

  // Antennae/feelers attached to head
  addFeelers(head, p, color);
}

function buildCephalopodBody(core: RenderNode, p: Phenotype, color: string) {
  // Head is the core. Tentacles radiate around it.
  const totalArms = Math.max(6, p.limbPairs * 2);

  for (let i = 0; i < totalArms; i += 1) {
    const angle = (i / totalArms) * Math.PI * 2;

    // Attach around lower-front half for a more animal-like read
    const frontBias = 0.65;
    const attachX = Math.cos(angle) * p.axialScale[0] * 0.6 + p.axialScale[0] * frontBias;
    const attachY = Math.sin(angle) * p.axialScale[1] * 0.85;

    const tentacle: RenderNode = {
      id: uuidv4(),
      type: "limb",
      shape: "path",
      position: { x: attachX, y: attachY },
      rotation: angle,
      // IMPORTANT: position tentacle center so it starts at the joint
      // Capsule is centered on node; offset by -len/2 along its local +Y axis.
      scale: { x: Math.max(0.12, p.limbThickness), y: Math.max(1.2, p.limbLength) },
      color: darken(color, 18),
      opacity: 1.0,
      zIndex: 90,
      children: [],
      animationTag: `tentacle_${i}`, // OrganismSDF animates by "tentacle"
    };

    core.children.push(tentacle);
  }
}

function buildReefBody(core: RenderNode, p: Phenotype, color: string, rng: () => number) {
  const count = Math.max(6, p.segmentCount * 3);

  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * p.axialScale[0] * 2;

    const size = 0.12 + rng() * 0.22;

    const polyp: RenderNode = {
      id: uuidv4(),
      type: "body_segment",
      shape: "circle",
      position: { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist },
      rotation: 0,
      scale: { x: size, y: size },
      color,
      opacity: 0.85,
      zIndex: 100,
      children: [],
      animationTag: `polyp_${i}`,
    };

    // Tiny cilia to avoid pure spheres
    if (i % 2 === 0) {
      polyp.children.push(
        makeCapsuleLimb({
          x: 0,
          y: -size * 0.6,
          rot: -Math.PI / 2,
          thickness: 0.08,
          length: 0.45,
          color: darken(color, 12),
          tag: `limb_cilia_${i}`,
          shape: "path",
        }),
      );
    }

    core.children.push(polyp);
  }
}

/* ------------------------------ Limbs ------------------------------ */

/**
 * Walker legs: create bilateral ventral legs on thorax.
 * Use capsule limbs and position them so they START at the joint.
 */
function addWalkerLegPairs(thorax: RenderNode, p: Phenotype, color: string) {
  const pairs = clampInt(p.limbPairs, 3, 6);

  // Spread legs along thorax x-span (local)
  const spreadX = thorax.scale.x * 0.55;
  for (let i = 0; i < pairs; i += 1) {
    const t = pairs === 1 ? 0.5 : i / (pairs - 1);
    const x = lerp(-spreadX * 0.35, spreadX * 0.35, t);
    addWalkerLegPairOnSegment(thorax, p, color, i, x);
  }
}

/**
 * Attach a single leg pair to a segment-like node.
 * `xOverride` lets us distribute legs along thorax.
 */
function addWalkerLegPairOnSegment(
  parent: RenderNode,
  p: Phenotype,
  color: string,
  pairIndex: number,
  xOverride?: number,
) {
  const down = -(parent.scale.y * 0.65);
  const lateral = parent.scale.y * 0.55;

  const legThk = Math.max(0.12, p.limbThickness * 0.7);
  const legLen = Math.max(parent.scale.y * 1.35, p.limbLength * 0.55);

  const upperLen = legLen * 0.6;
  const lowerLen = legLen * 0.55;

  // Joint (hip) position in parent-local
  const hipXBase = xOverride ?? 0;

  // If extremely asymmetric, only one side
  const sides = p.asymmetry > 0.85 ? [1] : [-1, 1];

  for (const side of sides) {
    const hipX = hipXBase + side * lateral;

    // Hip blob helps the SDF read joints
    const hip: RenderNode = {
      id: `hip-${uuidv4()}`,
      type: "limb",
      shape: "circle",
      position: { x: hipX, y: down },
      rotation: 0,
      scale: { x: legThk * 1.15, y: legThk * 1.15 },
      color: darken(color, 12),
      opacity: 1.0,
      zIndex: 60,
      children: [],
      animationTag: `limb_${pairIndex}_${side > 0 ? "R" : "L"}_hip`,
    };

    // Upper leg capsule: IMPORTANT—center is offset so it starts at hip
    const upperRot = -Math.PI / 2 + side * 0.18 + (pairIndex * 0.03);
    const upper = makeCapsuleLimb({
      x: 0,
      y: -upperLen * 0.5, // start at hip, extend downward
      rot: upperRot,
      thickness: legThk,
      length: upperLen,
      color: darken(color, 20),
      tag: `limb_${pairIndex}_${side > 0 ? "R" : "L"}_upper`,
      shape: "rect",
    });

    // Knee blob
    const knee: RenderNode = {
      id: `knee-${uuidv4()}`,
      type: "limb",
      shape: "circle",
      position: { x: 0, y: -upperLen },
      rotation: 0,
      scale: { x: legThk * 0.95, y: legThk * 0.95 },
      color: darken(color, 22),
      opacity: 1.0,
      zIndex: 58,
      children: [],
      animationTag: `limb_${pairIndex}_${side > 0 ? "R" : "L"}_knee`,
    };

    // Lower leg capsule: starts at knee, extends downward
    const lowerRot = -Math.PI / 2 + side * 0.06 - 0.25;
    const lower = makeCapsuleLimb({
      x: 0,
      y: -lowerLen * 0.5,
      rot: lowerRot,
      thickness: legThk * 0.9,
      length: lowerLen,
      color: darken(color, 26),
      tag: `limb_${pairIndex}_${side > 0 ? "R" : "L"}_lower`,
      shape: "rect",
    });

    // Foot (tiny toe) helps read ground contact
    const foot: RenderNode = {
      id: `foot-${uuidv4()}`,
      type: "limb",
      shape: "oval",
      position: { x: 0, y: -lowerLen },
      rotation: 0,
      scale: { x: legThk * 1.25, y: legThk * 0.85 },
      color: darken(color, 30),
      opacity: 1.0,
      zIndex: 56,
      children: [],
      animationTag: `limb_${pairIndex}_${side > 0 ? "R" : "L"}_foot`,
    };

    // Assemble hierarchy: hip -> upper -> knee -> lower -> foot
    lower.children.push(foot);
    knee.children.push(lower);
    upper.children.push(knee);
    hip.children.push(upper);

    parent.children.push(hip);
  }
}

/**
 * Non-walker limb layout (fins/tentacles) for generalists / crawlers.
 * Keep radial distribution for non-walk locomotion.
 */
function addRadialLimbs(parent: RenderNode, p: Phenotype, color: string, index: number) {
  const isAsymmetric = p.asymmetry > 0.5;
  const pairCount = isAsymmetric ? 1 : 2;

  const segmentRadius = p.axialScale[1] * 1.2;
  const angleOffset = index * Math.PI * 0.3;

  for (let s = 0; s < pairCount; s += 1) {
    const angle = (s / pairCount) * Math.PI * 2 + angleOffset;

    const attachX = Math.cos(angle) * segmentRadius * 0.35;
    const attachY = Math.sin(angle) * segmentRadius;

    const limb = makeCapsuleLimb({
      x: attachX,
      y: attachY,
      rot: angle + Math.PI / 2,
      thickness: Math.max(0.10, p.limbThickness),
      length: Math.max(0.8, p.limbLength),
      color: darken(color, 18),
      tag: `limb_${index}_${s}`,
      shape: getLimbShape(p.limbType),
    });

    parent.children.push(limb);
  }
}

function addCrawlerCilia(parent: RenderNode, p: Phenotype, color: string, index: number) {
  const count = clampInt(Math.round(2 + p.limbPairs), 2, 6);
  const len = clamp(Math.max(0.5, p.limbLength * 0.35), 0.5, 1.4);
  const thick = clamp(Math.max(0.08, p.limbThickness * 0.35), 0.08, 0.16);

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const x = lerp(-parent.scale.x * 0.25, parent.scale.x * 0.25, t);

    parent.children.push(
      makeCapsuleLimb({
        x,
        y: -(parent.scale.y * 0.75),
        rot: -Math.PI / 2,
        thickness: thick,
        length: len,
        color: darken(color, 16),
        tag: `limb_cilia_${index}_${i}`,
        shape: "path",
      }),
    );
  }
}

function addTail(parent: RenderNode, p: Phenotype, color: string) {
  const len = clamp(p.axialScale[0] * 1.25, 0.9, 3.2);
  const thick = clamp(p.axialScale[1] * 0.22, 0.10, 0.28);

  parent.children.push(
    makeCapsuleLimb({
      x: p.axialScale[0] * 0.55,
      y: 0,
      rot: 0,
      thickness: thick,
      length: len,
      color: darken(color, 10),
      tag: "limb_tail",
      shape: "path",
    }),
  );
}

function addFeelers(parent: RenderNode, p: Phenotype, color: string) {
  // Small antennae/feelers to avoid "ball with nothing"
  const len = clamp(p.limbLength * 0.45 + 0.9, 0.9, 2.6);
  const thick = clamp(Math.max(0.08, p.limbThickness * 0.35), 0.08, 0.16);

  for (let i = 0; i < 2; i += 1) {
    const angle = -Math.PI / 4 + i * (Math.PI / 2);

    // IMPORTANT: center offset so it starts at attachment point
    parent.children.push(
      makeCapsuleLimb({
        x: parent.scale.x * 0.55,
        y: (i === 0 ? 1 : -1) * parent.scale.y * 0.18,
        rot: angle,
        thickness: thick,
        length: len,
        color: darken(color, 12),
        tag: `limb_feeler_${i}`,
        shape: "path",
      }),
    );
  }
}

/* ------------------------------ Node factories ------------------------------ */

function makeCapsuleLimb(args: {
  x: number;
  y: number;
  rot: number;
  thickness: number;
  length: number;
  color: string;
  tag: string;
  shape: ShapeType;
}): RenderNode {
  return {
    id: `limb-${uuidv4()}`,
    type: "limb",
    shape: args.shape,
    position: { x: args.x, y: args.y },
    rotation: args.rot,
    // In OrganismSDF the capsule is centered on this node, aligned to its local +Y.
    // We handle "start at joint" by positioning the node at -len/2 where appropriate.
    scale: { x: args.thickness, y: args.length },
    color: args.color,
    opacity: 1.0,
    zIndex: 55,
    children: [],
    // MUST include "limb" substring for OrganismSDF's limb animation logic
    animationTag: args.tag.includes("limb") ? args.tag : `limb_${args.tag}`,
  };
}

function addFaceCue(core: RenderNode, p: Phenotype, color: string) {
  const ox = core.scale.x * 0.45;
  const oy = core.scale.y * 0.16;

  const eyeA: RenderNode = {
    id: uuidv4(),
    type: "detail",
    shape: "circle",
    position: { x: ox, y: oy },
    rotation: 0,
    scale: { x: 0.10, y: 0.10 },
    color: darken(color, 35),
    opacity: 1.0,
    zIndex: 120,
    children: [],
    animationTag: "eye_a",
  };

  const eyeB: RenderNode = {
    id: uuidv4(),
    type: "detail",
    shape: "circle",
    position: { x: ox, y: -oy },
    rotation: 0,
    scale: { x: 0.10, y: 0.10 },
    color: darken(color, 35),
    opacity: 1.0,
    zIndex: 120,
    children: [],
    animationTag: "eye_b",
  };

  core.children.push(eyeA, eyeB);

  if (p.locomotion !== "sessile") {
    const mouth: RenderNode = {
      id: uuidv4(),
      type: "detail",
      shape: "oval",
      position: { x: ox * 1.05, y: 0 },
      rotation: 0,
      scale: { x: 0.10, y: 0.07 },
      color: darken(color, 28),
      opacity: 1.0,
      zIndex: 119,
      children: [],
      animationTag: "mouth",
    };
    core.children.push(mouth);
  }
}

/* ------------------------------ Misc helpers ------------------------------ */

function getLimbShape(type: LimbType): ShapeType {
  if (type === "fin") return "triangle";
  if (type === "wing") return "triangle";
  if (type === "tentacle") return "path";
  if (type === "cilia") return "path";
  return "rect"; // leg
}

function getBaseColor(p: Phenotype): string {
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

function makeRngFromPhenotype(p: Phenotype): () => number {
  const seed = hashToUint32(stableStringify(p));
  return mulberry32(seed);
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function hashToUint32(input: string): number {
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

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
