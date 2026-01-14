import { Phenotype, LimbType } from '../simulation/types';
import { RenderNode, ShapeType } from './types';
import { v4 as uuidv4 } from 'uuid';

export function assembleOrganism(phenotype: Phenotype): RenderNode {
    // Root node creation based on Body Plan

    // Base color determination (simple mapping for now)
    const baseColor = getBaseColor(phenotype);

    const core: RenderNode = {
        id: uuidv4(),
        type: 'core',
        shape: phenotype.bodyPlan === 'ovoid_generalist' ? 'circle' : 'oval',
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: {
            x: phenotype.axialScale[0] * 2,
            y: phenotype.axialScale[1] * 2
        },
        color: baseColor,
        opacity: 1.0,
        zIndex: 100,
        children: []
    };

    // Construct body based on plan
    switch (phenotype.bodyPlan) {
        case 'segmented_crawler':
        case 'arthropod_walker':
            buildSegmentedBody(core, phenotype, baseColor);
            break;
        case 'cephalopod_swimmer':
            buildCephalopodBody(core, phenotype, baseColor);
            break;
        case 'sessile_reef':
            buildReefBody(core, phenotype, baseColor);
            break;
        case 'ovoid_generalist':
        default:
            // Just the core with maybe some simple appendages
            if (phenotype.limbPairs > 0) {
                addLimbs(core, phenotype, baseColor, 0);
            }
            // Start with "feelers" if no limbs, so it's not a ball
            if (phenotype.limbPairs === 0) {
                addFeelers(core, phenotype, baseColor);
            }
            break;
    }

    return core;
}

function buildSegmentedBody(core: RenderNode, p: Phenotype, color: string) {
    let currentSegment = core;

    for (let i = 0; i < p.segmentCount; i++) {
        // Tapering scale
        const taper = 1.0 - (i / p.segmentCount) * 0.6;

        const segment: RenderNode = {
            id: uuidv4(),
            type: 'body_segment',
            shape: 'circle', // SPHERE in SDF (not capsule!) for proper limb attachment
            position: { x: (p.axialScale[0] * 1.8), y: 0 }, // Chain along X with stable spacing
            rotation: 0,
            scale: {
                x: p.axialScale[0] * taper,
                y: p.axialScale[1] * taper
            },
            color: color,
            opacity: 1.0,
            zIndex: 100 - i,
            children: [],
            animationTag: `seg_${i}`
        };

        // Add limbs to this segment?
        // Arthropods: limbs on most segments
        // Crawlers: maybe only some, or small ones
        if (i < p.limbPairs) {
            addLimbs(segment, p, color, i);
        }

        currentSegment.children.push(segment);
        currentSegment = segment;
    }
}

function buildCephalopodBody(core: RenderNode, p: Phenotype, color: string) {
    // Head is the core.
    // Tentacles radiate from the bottom/front.
    // We treat "limbs" as tentacles here.

    // Cephalopod tentacles usually attach to the head directly
    for (let i = 0; i < p.limbPairs * 2; i++) { // Pairs * 2 = total arms
        const angle = (i / (p.limbPairs * 2)) * Math.PI * 2;
        const tentacleBase: RenderNode = {
            id: uuidv4(),
            type: 'limb',
            shape: 'path', // Flexible
            position: {
                x: Math.cos(angle) * p.axialScale[0],
                y: Math.sin(angle) * p.axialScale[1]
            },
            rotation: angle,
            scale: { x: p.limbThickness, y: p.limbLength },
            color: color,
            opacity: 1.0,
            zIndex: 90,
            children: [],
            animationTag: `tentacle_${i}`
        };
        core.children.push(tentacleBase);
    }
}

function buildReefBody(core: RenderNode, p: Phenotype, color: string) {
    // Sessile: Just clusters of shapes
    for (let i = 0; i < p.segmentCount * 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * p.axialScale[0] * 2;

        const polyp: RenderNode = {
            id: uuidv4(),
            type: 'body_segment',
            shape: 'circle',
            position: {
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist
            },
            rotation: 0,
            scale: { x: 0.2, y: 0.2 },
            color: color,
            opacity: 0.8,
            zIndex: 100,
            children: [],
            animationTag: `polyp_${i}`
        };
        core.children.push(polyp);
    }
}

function addLimbs(parent: RenderNode, p: Phenotype, color: string, index: number) {
    const isAsymmetric = p.asymmetry > 0.5;
    const pairCount = isAsymmetric ? 1 : 2;

    // Radial distribution: spread limbs around the segment circumference
    // This creates a tentacle-like appearance
    const segmentRadius = p.axialScale[1] * 1.2; // Distance from center to attach point
    const angleOffset = (index * Math.PI * 0.3); // Rotate pattern per segment for organic look

    for (let s = 0; s < pairCount; s++) {
        const angle = (s / pairCount) * Math.PI * 2 + angleOffset;

        // Position limb attachment point on the circumference
        const attachX = Math.cos(angle) * segmentRadius * 0.3; // Pull closer to core
        const attachY = Math.sin(angle) * segmentRadius;

        // Limb extends outward from this point
        const limb: RenderNode = {
            id: `limb-${uuidv4()}`,
            type: 'limb',
            shape: getLimbShape(p.limbType),
            position: { x: attachX, y: attachY },
            rotation: angle + Math.PI / 2, // Point outward radially
            scale: { x: p.limbThickness, y: p.limbLength }, // Now using enhanced scaling from phenotype
            color: darken(color, 20),
            opacity: 1.0,
            zIndex: 50,
            children: [],
            animationTag: `limb_${index}_${s}`
        };
        parent.children.push(limb);
    }
}

function addFeelers(parent: RenderNode, p: Phenotype, color: string) {
    // Small antennae
    for (let i = 0; i < 2; i++) {
        const angle = -Math.PI / 4 + (i * Math.PI / 2);
        const feeler: RenderNode = {
            id: uuidv4(),
            type: 'limb',
            shape: 'path',
            position: { x: p.axialScale[0] * 0.8, y: (i === 0 ? 1 : -1) * p.axialScale[1] * 0.3 },
            rotation: angle,
            scale: { x: 0.1, y: 0.8 },
            color: color,
            opacity: 1.0,
            zIndex: 95,
            children: [],
            animationTag: `feeler_${i}`
        };
        parent.children.push(feeler);
    }
}

function getLimbShape(type: LimbType): ShapeType {
    if (type === 'fin') return 'triangle';
    if (type === 'wing') return 'triangle'; // larger
    if (type === 'tentacle') return 'path';
    return 'rect'; // leg
}

function getBaseColor(p: Phenotype): string {
    // Map metabolic rate / aggression to color
    // High Energy/Aggression -> Red/Orange
    // Low Energy / Water -> Blue/Green

    // Detailed mapping:
    // Photosynthesis (green)
    if (p.patchCoverage > 0.7) return '#2ECC71';

    if (p.motionIntensity > 0.8) return '#E74C3C'; // Aggressive Red
    if (p.locomotion === 'swim') return '#3498DB'; // Aquatic Blue
    if (p.bodyPlan === 'arthropod_walker') return '#D35400'; // Chitin Brown

    return '#BDC3C7'; // Neutral Grey
}

function darken(hex: string, percent: number): string {
    if (!hex.startsWith('#')) {
        return hex;
    }
    const raw = hex.slice(1);
    const expanded = raw.length === 3
        ? raw.split('').map((c) => `${c}${c}`).join('')
        : raw;
    if (expanded.length !== 6) {
        return hex;
    }
    const num = parseInt(expanded, 16);
    if (Number.isNaN(num)) {
        return hex;
    }
    const factor = Math.max(0, Math.min(1, 1 - percent / 100));
    const r = Math.round(((num >> 16) & 0xff) * factor);
    const g = Math.round(((num >> 8) & 0xff) * factor);
    const b = Math.round((num & 0xff) * factor);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
