
'use client';

import React from 'react';
import { RenderNode } from '../../lib/rendering/types';

interface OrganismRendererProps {
    rootNode: RenderNode;
    width?: number;
    height?: number;
}

const RenderNodeComponent: React.FC<{ node: RenderNode }> = ({ node }) => {
    // Recursively render children
    return (
        <g transform={`translate(${node.position.x * 20}, ${node.position.y * 20}) rotate(${node.rotation * 180 / Math.PI}) scale(${node.scale.x}, ${node.scale.y})`}>
            {/* Draw current node */}
            {node.shape === 'circle' && (
                <circle r="10" fill={node.color} opacity={node.opacity} />
            )}
            {node.shape === 'oval' && (
                <ellipse rx="12" ry="8" fill={node.color} opacity={node.opacity} />
            )}
            {node.shape === 'rect' && (
                <rect x="-5" y="-15" width="10" height="30" fill={node.color} opacity={node.opacity} rx="2" />
            )}
            {node.shape === 'triangle' && (
                <polygon points="0,-10 10,10 -10,10" fill={node.color} opacity={node.opacity} />
            )}

            {/* Children */}
            {node.children.map(child => (
                <RenderNodeComponent key={child.id} node={child} />
            ))}
        </g>
    );
};

export default function OrganismRenderer({ rootNode, width = 400, height = 400 }: OrganismRendererProps) {
    return (
        <div className="flex items-center justify-center border border-gray-700 bg-gray-900 rounded-lg p-4">
            <svg width={width} height={height} viewBox={`-100 -100 200 200`}>
                <RenderNodeComponent node={rootNode} />
            </svg>
        </div>
    );
}
