import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RenderNode } from '../../lib/rendering/types';
import { getOrganicMaterial } from '../../lib/rendering/organicShader';
import { Phenotype } from '../../lib/simulation/types';

interface Organism3DProps {
    rootNode: RenderNode;
    phenotype: Phenotype;
}

const RenderNode3D: React.FC<{ node: RenderNode; phenotype: Phenotype }> = ({ node, phenotype }) => {
    const meshRef = useRef<THREE.Mesh>(null);

    // Dynamic Organic Material
    const material = useMemo(() => {
        return getOrganicMaterial(node.color, phenotype, 0);
    }, [node.color, phenotype]);

    // Geometry based on shape
    // We map 2D shapes to 3D equivalents
    const geometry = useMemo(() => {
        switch (node.shape) {
            case 'circle': return new THREE.SphereGeometry(1, 32, 32);
            case 'oval': return new THREE.SphereGeometry(1, 32, 32).scale(1, 0.6, 0.6); // Oblate spheroid
            case 'rect': return new THREE.BoxGeometry(1, 1, 1); // Or Cylinder? Box for plates
            case 'triangle': return new THREE.ConeGeometry(0.5, 2, 32);
            case 'path': return new THREE.CylinderGeometry(0.1, 0.05, 2, 8); // Tentacle-ish
            default: return new THREE.SphereGeometry(1, 16, 16);
        }
    }, [node.shape]);

    useFrame((state) => {
        if (meshRef.current) {
            // Add subtle life-like breathing/motion
            const t = state.clock.elapsedTime;

            // Local animation based on tag
            if (node.animationTag?.includes('limit')) {
                meshRef.current.rotation.z = Math.sin(t * phenotype.gaitRate) * 0.5;
            } else if (node.animationTag?.includes('tail')) {
                meshRef.current.rotation.y = Math.sin(t * phenotype.gaitRate + node.position.x) * 0.2;
            }

            // Material Uniform updates
            const shader = meshRef.current.material as THREE.ShaderMaterial | undefined;
            if (shader?.uniforms?.u_time) {
                shader.uniforms.u_time.value = t;
            }
        }
    });

    return (
        <group
            position={[node.position.x, node.position.y, 0]}
            rotation={[0, 0, node.rotation]}
            scale={[node.scale.x, node.scale.y, node.scale.x]} // Assume Z scale matches X for now
        >
            <mesh ref={meshRef} geometry={geometry} material={material} />

            {/* Children */}
            {node.children.map(child => (
                <RenderNode3D key={child.id} node={child} phenotype={phenotype} />
            ))}
        </group>
    );
};

export default function Organism3D({ rootNode, phenotype }: Organism3DProps) {
    return (
        <group>
            {/* Ambient Lighting + Rim lights setup done in parent Canvas usually, but adding local lights here to be safe */}
            <pointLight position={[10, 10, 10]} intensity={1.5} color="#ffd" />
            <pointLight position={[-10, -5, 5]} intensity={0.5} color="#40f" />
            <ambientLight intensity={0.2} />

            <RenderNode3D node={rootNode} phenotype={phenotype} />
        </group>
    );
}
