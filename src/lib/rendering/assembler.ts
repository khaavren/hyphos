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
  const renderAxialScale: [number, number, number] = [
    clamp(phenotype.axialScale[0], 0.6, 3.2),
    clamp(phenotype.axialScale[1], 0.6, 3.2),
    clamp(phenotype.axialScale[2], 0.6, 3.2),
  ];
  const renderPhenotype: Phenotype = { ...phenotype, axialScale: renderAxialScale };
  const rng = makeRngFromPhenotype(renderPhenotype);
  const baseColor = getBaseColor(renderPhenotype);

  // NOTE: Keep core as the origin anchor. For most plans we build a forward chain
  // so that "front" is +X and "down" is -Y (matches the renderer assumptions).
  const core: RenderNode = {
    id: uuidv4(),
    type: "core",
    shape: renderPhenotype.bodyPlan === "ovoid_generalist" ? "circle" : "oval",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: renderPhenotype.axialScale[0] * 2, y: renderPhenotype.axialScale[1] * 2 },
    color: baseColor,
    opacity: 1.0,
    zIndex: 100,
    children: [],
    animationTag: "core",
  };

  switch (renderPhenotype.bodyPlan) {
    case "arthropod_walker":
      buildArthropod(core, renderPhenotype, baseColor);
      break;

    case "segmented_crawler":
      buildSegmentedCrawler(core, renderPhenotype, baseColor);
      break;

    case "cephalopod_swimmer":
      buildCephalopodBody(core, renderPhenotype, baseColor);
      break;

    case "sessile_reef":
      buildReefBody(core, renderPhenotype, baseColor, rng);
      break;

    case "ovoid_generalist":
    default:
      buildOvoid(core, renderPhenotype, baseColor);
      break;
  }

  // Add a tiny directional cue so it never reads as “just a ball”
  addFaceCue(core, renderPhenotype, baseColor);
  applyLocomotionAddons(core, renderPhenotype, baseColor);
  applyBiomeSurface(core, renderPhenotype, baseColor, rng);
  centerNodeTree(core);

  return core;
}

/* ------------------------------ Body Plans ------------------------------ */

function buildOvoid(core: RenderNode, p: Phenotype, color: string) {
  // Keep it simple but readable: a tail + feelers so it isn't just a blob.
  if (p.tailLength > 0.1) {
    addTail(core, p, color);
  }

  if (p.locomotion === "walk") {
    addWalkerLegPairs(core, p, color);
  } else if (p.locomotion === "fly" || p.locomotion === "glide") {
    // Flyers can still have legs (per your request), but wings are handled in applyLocomotionAddons.
    if (p.legPairs > 0) addWalkerLegPairs(core, p, color);
    addAntennae(core, p, color);
  } else if (p.limbPairs > 0) {
    // Use non-walker limb layout (radial fins/tentacles).
    addRadialLimbs(core, p, color, 0);
  } else {
    addAntennae(core, p, color);
    addWhiskers(core, p, color);
  }
}

function buildSegmentedCrawler(core: RenderNode, p: Phenotype, color: string) {
  // A single chain of tapered segments extending in +X
  const segCount = Math.max(2, p.segmentCount);
  const maxBodyLength = 18;
  const maxStep = maxBodyLength / segCount;
  const stepX = Math.min(p.axialScale[0] * 1.35, maxStep);

  let current = core;
  const segments: RenderNode[] = [];
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

    if (p.locomotion !== "walk" && (p.limbType === "cilia" || p.limbPairs === 0)) {
      // Add small ventral cilia "feet" for crawling read
      addCrawlerCilia(segment, p, color, i);
    }

    current.children.push(segment);
    current = segment;
    segments.push(segment);
  }

  if (p.locomotion === "walk" && segments.length > 0) {
    const pairCount = clampInt(p.legPairs, 3, 6);
    const legSegments = Math.min(segments.length, Math.max(3, pairCount));
    for (let i = 0; i < legSegments; i += 1) {
      const t = legSegments === 1 ? 0.5 : (i + 1) / (legSegments + 1);
      const idx = clamp(
        Math.round(lerp(segments.length * 0.2, segments.length * 0.8, t)),
        0,
        segments.length - 1,
      );
      addWalkerLegPairOnSegment(segments[idx], p, color, i);
    }
  }

  if (p.tailLength > 0.1) {
    addTail(current, p, color);
  }
}

function buildArthropod(core: RenderNode, p: Phenotype, color: string) {
  // Build a single readable chain:
  // head -> thorax -> abdomen -> tail segments...
  const segmentTotal = Math.max(3, Math.min(p.segmentCount, 5));
  const maxBodyLength = 18;
  const maxStep = maxBodyLength / segmentTotal;
  const stepX = Math.min(p.axialScale[0] * 1.25, maxStep);

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
  const extraSegs = clampInt(Math.max(0, segmentTotal - 3), 0, 2);
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

  if (p.tailLength > 0.1) {
    addTail(current, p, color);
  }

  // Antennae/feelers attached to head
  addAntennae(head, p, color);
  addWhiskers(head, p, color);
}

function buildCephalopodBody(core: RenderNode, p: Phenotype, color: string) {
  // Head is the core. Tentacles radiate around it.
  const totalArms = Math.max(0, p.tentaclePairs * 2);
  if (totalArms === 0) return;

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
      scale: { x: Math.max(0.12, p.limbThickness), y: Math.max(1.2, p.limbLength) },
      color: darken(color, 18),
      opacity: 1.0,
      zIndex: 90,
      children: [],
      animationTag: `tentacle_${i}`,
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

    // Tiny cilia only if phenotype invests in cilia
    if (p.limbType === "cilia" && i % 2 === 0) {
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

/* ------------------------------ Locomotion / Biome ------------------------------ */

function applyLocomotionAddons(core: RenderNode, p: Phenotype, color: string) {
  const thorax = findNodeByTag(core, "seg_thorax") ?? core;
  const abdomen = findNodeByTag(core, "seg_abdomen") ?? core;

  if (p.locomotion === "fly" || p.locomotion === "glide") {
    addWingPair(thorax, p, color);
    // Allow flyer legs too (if present)
    if (p.legPairs > 0 && p.bodyPlan !== "arthropod_walker") {
      addWalkerLegPairs(thorax, p, color);
    }
  }

  if (p.locomotion === "swim") {
    addSwimmerFins(thorax, p, color);
    addSwimmerTail(abdomen, p, color);
    if (p.tailFinSize > 0.1) {
      addTailFluke(abdomen, p, color);
    }
  } else if (p.limbType === "fin" && p.finPairs > 0) {
    addFinPair(thorax, p, color);
  }
}

function applyBiomeSurface(core: RenderNode, p: Phenotype, color: string, rng: () => number) {
  if (p.biome === "tundra" && p.furAmount > 0.2) {
    addInsulationNodes(core, p, color, rng);
  }
  if (p.biome === "desert" && p.armorPlates > 0.2) {
    addPlatingNodes(core, p, color, rng);
  }
  if (p.ornamentation > 0.35) {
    addOrnamentNodes(core, p, color, rng);
  }
}

function findNodeByTag(node: RenderNode, tag: string): RenderNode | null {
  if (node.animationTag?.includes(tag)) return node;
  for (const child of node.children) {
    const hit = findNodeByTag(child, tag);
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------ Wings / Fins / Tail ------------------------------ */

function addWingPair(parent: RenderNode, p: Phenotype, color: string) {
  const pairs = clampInt(Math.max(p.wingPairs, 1), 1, 3);
  const areaBoost = clamp(0.8 + p.wingArea * 2.4, 0.8, 3.2);
  const span = clamp(p.limbLength * (1.1 + p.wingArea * 2.6), 1.8, 6.8) * areaBoost;
  const thickness = clamp(p.limbThickness * 0.55, 0.18, 0.55);
  const offsetX = parent.scale.x * 0.15;
  const offsetY = parent.scale.y * 0.2;

  for (let i = 0; i < pairs; i += 1) {
    const t = pairs === 1 ? 0.5 : i / (pairs - 1);
    const x = lerp(offsetX * 0.6, offsetX * 1.4, t);
    [-1, 1].forEach((side, idx) => {
      parent.children.push(
        makeCapsuleLimb({
          x,
          y: side * offsetY,
          rot: side * 0.55 - 0.2,
          thickness,
          length: span,
          color: darken(color, 10),
          tag: `limb_wing_${i}_${idx}`,
          shape: "triangle",
        }),
      );
    });
  }
}

function addFinPair(parent: RenderNode, p: Phenotype, color: string) {
  const pairs = clampInt(p.finPairs, 1, 3);
  const span = clamp(p.limbLength * 0.6, 0.8, 3.2);
  const thickness = clamp(p.limbThickness * 0.5, 0.14, 0.35);
  const offsetX = parent.scale.x * 0.1;
  const offsetY = parent.scale.y * 0.25;

  for (let i = 0; i < pairs; i += 1) {
    const t = pairs === 1 ? 0.5 : i / (pairs - 1);
    const x = lerp(offsetX * 0.4, offsetX * 1.3, t);
    [-1, 1].forEach((side, idx) => {
      parent.children.push(
        makeCapsuleLimb({
          x,
          y: side * offsetY,
          rot: side * 0.4 + 0.15,
          thickness,
          length: span,
          color: darken(color, 14),
          tag: `limb_fin_${i}_${idx}`,
          shape: "triangle",
        }),
      );
    });
  }
}

function addTailFluke(parent: RenderNode, p: Phenotype, color: string) {
  const span = clamp(p.limbLength * (0.4 + p.tailFinSize * 0.8), 0.9, 3.6);
  const thickness = clamp(p.limbThickness * 0.55, 0.16, 0.4);
  const offsetX = parent.scale.x * 0.65;

  [-1, 1].forEach((side, idx) => {
    parent.children.push(
      makeCapsuleLimb({
        x: offsetX,
        y: side * parent.scale.y * 0.1,
        rot: side * 0.55,
        thickness,
        length: span,
        color: darken(color, 16),
        tag: `limb_fluke_${idx}`,
        shape: "triangle",
      }),
    );
  });
}

function addSwimmerFins(parent: RenderNode, p: Phenotype, color: string) {
  const pairs = clampInt(Math.max(p.finPairs, 1), 1, 3);
  const span = clamp(p.limbLength * (0.75 + p.tailFinSize * 0.6), 1.0, 3.8);
  const thickness = clamp(p.limbThickness * 0.55, 0.16, 0.45);
  const offsetX = parent.scale.x * 0.15;
  const offsetY = parent.scale.y * 0.3;

  for (let i = 0; i < pairs; i += 1) {
    const t = pairs === 1 ? 0.5 : i / (pairs - 1);
    const x = lerp(offsetX * 0.4, offsetX * 1.35, t);
    [-1, 1].forEach((side, idx) => {
      parent.children.push(
        makeCapsuleLimb({
          x,
          y: side * offsetY,
          rot: side * 0.4 + 0.1,
          thickness,
          length: span,
          color: darken(color, 12),
          tag: `limb_swim_fin_${i}_${idx}`,
          shape: "triangle",
        }),
      );
    });
  }
}

function addSwimmerTail(parent: RenderNode, p: Phenotype, color: string) {
  const segments = clampInt(Math.round(2 + p.tailLength * 2), 2, 4);
  const baseLen = clamp(p.axialScale[0] * (0.9 + p.tailLength), 1.4, 5.0);
  const segmentLen = baseLen / segments;
  const startX = parent.scale.x * 0.55;

  for (let i = 0; i < segments; i += 1) {
    const taper = 1 - (i / Math.max(1, segments)) * 0.5;
    const thickness = clamp(p.axialScale[1] * 0.22 * taper, 0.08, 0.28);
    parent.children.push(
      makeCapsuleLimb({
        x: startX + segmentLen * 0.5 + i * segmentLen * 0.7,
        y: 0,
        rot: Math.PI / 2,
        thickness,
        length: segmentLen,
        color: darken(color, 12 + i * 4),
        tag: `limb_tail_seg_${i}`,
        shape: "path",
      }),
    );
  }
}

/* ------------------------------ Surface Extras ------------------------------ */

function addInsulationNodes(core: RenderNode, p: Phenotype, color: string, rng: () => number) {
  const count = clampInt(Math.round(6 + p.segmentCount * 0.6), 6, 14);
  const baseX = p.axialScale[0] * 0.65;
  const baseY = p.axialScale[1] * 0.7;

  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const size = 0.08 + rng() * 0.14;
    const node: RenderNode = {
      id: `fuzz-${uuidv4()}`,
      type: "body_segment",
      shape: "circle",
      position: { x: Math.cos(angle) * baseX, y: Math.sin(angle) * baseY },
      rotation: 0,
      scale: { x: size * 1.05, y: size },
      color: darken(color, 6),
      opacity: 0.9,
      zIndex: 96,
      children: [],
      animationTag: `fuzz_${i}`,
    };
    core.children.push(node);
  }
}

function addPlatingNodes(core: RenderNode, p: Phenotype, color: string, rng: () => number) {
  const count = clampInt(Math.round(4 + p.segmentCount * 0.5), 4, 10);
  const span = p.axialScale[0] * 1.15;
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = lerp(-p.axialScale[0] * 0.1, span, t) + (rng() - 0.5) * 0.2;
    const y = p.axialScale[1] * 0.35 + (rng() - 0.5) * 0.15;
    const plate: RenderNode = {
      id: `plate-${uuidv4()}`,
      type: "body_segment",
      shape: "oval",
      position: { x, y },
      rotation: (rng() - 0.5) * 0.3,
      scale: { x: 0.25 + rng() * 0.2, y: 0.12 + rng() * 0.1 },
      color: darken(color, 18),
      opacity: 0.95,
      zIndex: 102,
      children: [],
      animationTag: `plate_${i}`,
    };
    core.children.push(plate);
  }
}

function addOrnamentNodes(core: RenderNode, p: Phenotype, color: string, rng: () => number) {
  const count = clampInt(Math.round(2 + p.ornamentation * 6), 2, 8);
  const span = p.axialScale[0] * 0.9;
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = lerp(-p.axialScale[0] * 0.2, span, t);
    const y = p.axialScale[1] * (0.4 + rng() * 0.4);
    const size = 0.06 + rng() * 0.12;
    core.children.push({
      id: `ornament-${uuidv4()}`,
      type: "body_segment",
      shape: "circle",
      position: { x, y },
      rotation: 0,
      scale: { x: size * 1.2, y: size },
      color: darken(color, 8),
      opacity: 0.9,
      zIndex: 120,
      children: [],
      animationTag: `ornament_${i}`,
    });
  }
}

/* ------------------------------ Limbs ------------------------------ */

/**
 * Walker legs: create bilateral ventral legs on thorax.
 * Use capsule limbs and position them so they START at the joint.
 */
function addWalkerLegPairs(thorax: RenderNode, p: Phenotype, color: string) {
  const pairs = clampInt(p.legPairs, 3, 6);

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
 *
 * KEY FIX: widen lateral offset so legs don’t sit on the centerline.
 */
function addWalkerLegPairOnSegment(
  parent: RenderNode,
  p: Phenotype,
  color: string,
  pairIndex: number,
  xOverride?: number,
) {
  const down = -(parent.scale.y * 0.65);

  // ✅ FIX: legs were too close to center; use a stronger lateral based on both axes
  const lateral = Math.max(parent.scale.y * 0.85, parent.scale.x * 0.35);

  const biomeLegScale = p.biome === "tundra" ? 1.15 : 1.0;
  const legThk = Math.max(0.16, p.limbThickness * 0.7) * biomeLegScale;
  const legLen = Math.max(parent.scale.y * 1.55, p.limbLength * 0.65);

  const upperLen = legLen * 0.6;
  const lowerLen = legLen * 0.55;

  // Joint (hip) position in parent-local
  const hipXBase = xOverride ?? 0;

  // If extremely asymmetric, only one side
  const sides = p.asymmetry > 0.85 ? [1] : [-1, 1];

  for (const side of sides) {
    const hipX = hipXBase + side * lateral;

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

    const upperRot = -Math.PI / 2 + side * 0.18 + pairIndex * 0.03;
    const upper = makeCapsuleLimb({
      x: 0,
      y: -upperLen * 0.5,
      rot: upperRot,
      thickness: legThk,
      length: upperLen,
      color: darken(color, 20),
      tag: `limb_${pairIndex}_${side > 0 ? "R" : "L"}_upper`,
      shape: "rect",
    });

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

    const footScale = p.biome === "tundra" ? 1.35 : 1.0;
    const foot: RenderNode = {
      id: `foot-${uuidv4()}`,
      type: "limb",
      shape: "oval",
      position: { x: 0, y: -lowerLen },
      rotation: 0,
      scale: { x: legThk * 1.25 * footScale, y: legThk * 0.85 * footScale },
      color: darken(color, 30),
      opacity: 1.0,
      zIndex: 56,
      children: [],
      animationTag: `limb_${pairIndex}_${side > 0 ? "R" : "L"}_foot`,
    };

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
      thickness: Math.max(0.1, p.limbThickness),
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
  const len = clamp(p.axialScale[0] * (0.6 + p.tailLength * 1.1), 0.9, 3.2);
  const thick = clamp(p.axialScale[1] * 0.22, 0.1, 0.28);

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

function addAntennae(parent: RenderNode, p: Phenotype, color: string) {
  if (p.antennaeCount <= 0) return;
  const len = clamp(p.limbLength * 0.45 + 0.8, 0.8, 2.4);
  const thick = clamp(Math.max(0.08, p.limbThickness * 0.3), 0.08, 0.15);
  const count = clampInt(p.antennaeCount, 1, 6);

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = lerp(-Math.PI / 3, Math.PI / 3, t);
    parent.children.push(
      makeCapsuleLimb({
        x: parent.scale.x * 0.55,
        y: lerp(-parent.scale.y * 0.2, parent.scale.y * 0.2, t),
        rot: angle,
        thickness: thick,
        length: len,
        color: darken(color, 12),
        tag: `limb_antenna_${i}`,
        shape: "path",
      }),
    );
  }
}

function addWhiskers(parent: RenderNode, p: Phenotype, color: string) {
  if (p.whiskerCount <= 0) return;
  const len = clamp(p.limbLength * 0.25 + 0.6, 0.6, 1.6);
  const thick = clamp(Math.max(0.06, p.limbThickness * 0.2), 0.06, 0.12);
  const count = clampInt(p.whiskerCount, 2, 8);

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = lerp(-Math.PI / 2, Math.PI / 2, t);
    parent.children.push(
      makeCapsuleLimb({
        x: parent.scale.x * 0.45,
        y: lerp(-parent.scale.y * 0.3, parent.scale.y * 0.3, t),
        rot: angle,
        thickness: thick,
        length: len,
        color: darken(color, 16),
        tag: `limb_whisker_${i}`,
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
    // Capsule centered on node, aligned to local +Y
    scale: { x: args.thickness, y: args.length },
    color: args.color,
    opacity: 1.0,
    zIndex: 55,
    children: [],
    animationTag: args.tag.includes("limb") ? args.tag : `limb_${args.tag}`,
  };
}

function addFaceCue(core: RenderNode, p: Phenotype, color: string) {
  const isWalker = p.bodyPlan === "arthropod_walker" || (p.locomotion === "walk" && p.limbType === "leg");
  const isSwimmer = p.locomotion === "swim";
  const isFlyer = p.locomotion === "fly" || p.locomotion === "glide";
  const anchor = isWalker ? findNodeByTag(core, "seg_head") ?? core : core;

  const minimumEyes = isWalker || isSwimmer || isFlyer ? 2 : 0;
  const eyeCount = Math.max(p.eyesCount, minimumEyes);

  const ox = anchor.scale.x * 0.55;
  const baseY = anchor.scale.y * 0.18;
  const spread = anchor.scale.y * 0.14;

  if (eyeCount > 0) {
    const maxEyes = isWalker || isSwimmer || isFlyer ? 3 : 4;
    const count = clampInt(eyeCount, 1, maxEyes);
    const size = clamp(0.06 + p.eyesSize * 0.18, 0.06, 0.22);

    const offsets = count === 1 ? [0] : count === 2 ? [-spread, spread] : [-spread, 0, spread];

    offsets.forEach((offset, index) => {
      anchor.children.push({
        id: uuidv4(),
        type: "sensor",
        shape: "circle",
        position: { x: ox, y: baseY + offset },
        rotation: 0,
        scale: { x: size, y: size },
        color: darken(color, 35),
        opacity: 1.0,
        zIndex: 120,
        children: [],
        animationTag: `eye_${index}`,
      });
    });
  }

  if (p.mouthPresence > 0.2) {
    anchor.children.push({
      id: uuidv4(),
      type: "sensor",
      shape: "oval",
      position: { x: ox * 1.05, y: 0 },
      rotation: 0,
      scale: { x: 0.08 + p.mouthPresence * 0.08, y: 0.06 + p.mouthPresence * 0.06 },
      color: darken(color, 28),
      opacity: 1.0,
      zIndex: 119,
      children: [],
      animationTag: "mouth",
    });
  }
}

/* ------------------------------ Misc helpers ------------------------------ */

function centerNodeTree(root: RenderNode) {
  const bounds = getNodeBounds(root);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;
  translateTree(root, -centerX, -centerY);
}

function getNodeBounds(root: RenderNode) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (node: RenderNode, px: number, py: number) => {
    const x = px + node.position.x;
    const y = py + node.position.y;
    const radius = Math.max(node.scale.x, node.scale.y) * 0.5;
    minX = Math.min(minX, x - radius);
    maxX = Math.max(maxX, x + radius);
    minY = Math.min(minY, y - radius);
    maxY = Math.max(maxY, y + radius);
    node.children.forEach((child) => visit(child, x, y));
  };

  visit(root, 0, 0);
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

function translateTree(node: RenderNode, dx: number, dy: number) {
  node.position.x += dx;
  node.position.y += dy;
  node.children.forEach((child) => translateTree(child, dx, dy));
}

function getLimbShape(type: LimbType): ShapeType {
  if (type === "fin") return "triangle";
  if (type === "wing") return "triangle";
  if (type === "tentacle") return "path";
  if (type === "cilia") return "path";
  return "rect";
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
  const expanded = raw.length === 3 ? raw.split("").map((c) => `${c}${c}`).join("") : raw;
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
