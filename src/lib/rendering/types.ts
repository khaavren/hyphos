
export type NodeType = 'body_segment' | 'limb' | 'sensor' | 'core';
export type ShapeType = 'circle' | 'oval' | 'rect' | 'triangle' | 'path';

export interface RenderNode {
    id: string;
    type: NodeType;
    shape: ShapeType;

    // Relative transform from parent
    position: { x: number; y: number };
    rotation: number; // in radians
    scale: { x: number; y: number };

    // Style
    color: string;
    opacity: number;
    zIndex: number;

    // Children nodes
    children: RenderNode[];

    // Metadata for animation
    animationTag?: string; // e.g., 'leg_left', 'tail_segment_3'
}
