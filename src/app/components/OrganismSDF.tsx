import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RenderNode } from '../../lib/rendering/types';
import { Genome, Phenotype } from '../../lib/simulation/types';
import { sdfVertexShader, sdfFragmentShader } from '../../lib/rendering/sdfShader';

interface OrganismSDFProps {
    rootNode: RenderNode;
    phenotype: Phenotype;
    genome: Genome;
}

// Fixed size arrays for shader uniforms
const MAX_BLOBS = 50;
const MAX_CAPSULES = 50;
const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

export default function OrganismSDF({ rootNode, phenotype, genome }: OrganismSDFProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const legsRef = useRef<THREE.InstancedMesh>(null);
    const { camera } = useThree();
    const segmentationEnabled = genome.segmentation > 0.6;
    const legsEnabled = genome.limbCount > 0.6 && genome.locomotionMode > 0.6;
    const segmentCount = Math.max(1, phenotype.segmentCount);
    const segmentSpacing = phenotype.axialScale[0] * 1.8;
    const bodyRadius = Math.max(rootNode.scale.y, rootNode.scale.x * 0.35) * 0.5;
    const ringThickness = Math.max(0.12, bodyRadius * 0.12);

    const uniforms = useMemo(() => ({
        u_time: { value: 0 },
        u_cameraPos: { value: new THREE.Vector3() },
        u_color: { value: new THREE.Color('#bdc3c7') },

        u_blobs: { value: Array.from({ length: MAX_BLOBS }, () => new THREE.Vector4(0, 0, 0, 0)) },
        u_blobCount: { value: 0 },

        u_capsulesA: { value: Array.from({ length: MAX_CAPSULES }, () => new THREE.Vector3(0, 0, 0)) },
        u_capsulesB: { value: Array.from({ length: MAX_CAPSULES }, () => new THREE.Vector4(0, 0, 0, 0)) },
        u_capsuleCount: { value: 0 },

        u_blendStrength: { value: 0.6 }, // High blend for gooey organic look
        u_limbBlendStrength: { value: 0.15 }, // Low blend for sharp limbs
        u_noiseStrength: { value: 0.1 },
        u_breath: { value: 0.0 },

        u_skinScale: { value: 20.0 },
        u_skinRoughness: { value: 0.5 },
        u_wetness: { value: 0.0 }
    }), []);

    const ringGeometry = useMemo(() => {
        if (!segmentationEnabled) {
            return null;
        }
        return new THREE.CylinderGeometry(bodyRadius, bodyRadius, ringThickness, 18, 1, true);
    }, [segmentationEnabled, bodyRadius, ringThickness]);

    const ringMaterial = useMemo(() => {
        const color = new THREE.Color(rootNode.color).multiplyScalar(0.75);
        return new THREE.MeshStandardMaterial({
            color,
            roughness: 0.85,
            metalness: 0.05,
            transparent: true,
            opacity: 0.85
        });
    }, [rootNode.color]);

    const legGeometry = useMemo(() => {
        if (!legsEnabled) {
            return null;
        }
        return new THREE.CylinderGeometry(1, 1, 1, 10, 1);
    }, [legsEnabled]);

    const legMaterial = useMemo(() => {
        const color = new THREE.Color(rootNode.color).multiplyScalar(0.55);
        return new THREE.MeshStandardMaterial({
            color,
            roughness: 0.9,
            metalness: 0.05
        });
    }, [rootNode.color]);

    useEffect(() => {
        return () => {
            ringGeometry?.dispose();
        };
    }, [ringGeometry]);

    useEffect(() => {
        return () => {
            ringMaterial.dispose();
        };
    }, [ringMaterial]);

    useEffect(() => {
        return () => {
            legGeometry?.dispose();
        };
    }, [legGeometry]);

    useEffect(() => {
        return () => {
            legMaterial.dispose();
        };
    }, [legMaterial]);

    const ringPositions = useMemo(() => {
        if (!segmentationEnabled) {
            return [];
        }
        return Array.from({ length: segmentCount }, (_, index) => index * segmentSpacing);
    }, [segmentationEnabled, segmentCount, segmentSpacing]);

    const legMatrices = useMemo(() => {
        if (!legsEnabled) {
            return [];
        }
        const totalLegs = clamp(
            Math.round(6 + ((genome.limbCount - 0.6) / 0.4) * 4),
            6,
            10
        );
        const legPairs = Math.max(3, Math.floor(totalLegs / 2));
        const legLength = Math.max(1.2, phenotype.limbLength * 0.6);
        const legRadius = Math.max(0.12, phenotype.limbThickness * 0.35);
        const legYOffset = -bodyRadius - legLength * 0.5;
        const legZOffset = bodyRadius * 0.55;

        const temp = new THREE.Object3D();
        const matrices: THREE.Matrix4[] = [];

        for (let i = 0; i < legPairs; i += 1) {
            const segmentIndex = i % segmentCount;
            const x = segmentSpacing * (segmentIndex + 0.5);
            for (const side of [-1, 1]) {
                temp.position.set(x, legYOffset, side * legZOffset);
                temp.rotation.set(0, 0, 0);
                temp.scale.set(legRadius, legLength, legRadius);
                temp.updateMatrix();
                matrices.push(temp.matrix.clone());
            }
        }
        return matrices;
    }, [
        legsEnabled,
        genome.limbCount,
        phenotype.limbLength,
        phenotype.limbThickness,
        bodyRadius,
        segmentCount,
        segmentSpacing
    ]);

    useEffect(() => {
        if (!legsRef.current) {
            return;
        }
        legMatrices.forEach((matrix, index) => {
            legsRef.current?.setMatrixAt(index, matrix);
        });
        legsRef.current.instanceMatrix.needsUpdate = true;
    }, [legMatrices]);

    // DEBUG: Log counts occasionally
    useFrame((state) => {
        if (state.clock.elapsedTime % 1.0 < 0.1 && uniforms.u_blobCount.value > 0) {
            console.log("RENDERER: Blobs:", uniforms.u_blobCount.value, "Capsules:", uniforms.u_capsuleCount.value);
        }
    })

    useFrame((state) => {
        if (!meshRef.current) return;

        const t = state.clock.elapsedTime;
        uniforms.u_time.value = t;
        uniforms.u_cameraPos.value.copy(camera.position);

        // --- flatten Tree to Arrays ---
        let blobCount = 0;
        let capsuleCount = 0;

        // Recursive helper to traverse and flatten
        // We must compute WORLD positions.
        // Simple approach: Pass accumulate transform down.
        const traverse = (node: RenderNode, parentMatrix: THREE.Matrix4) => {
            if (blobCount >= MAX_BLOBS || capsuleCount >= MAX_CAPSULES) return;

            // Compute local matrix
            // Note: node.position is relative. node.rotation is Z-axis only in our 2D-ish sim, 
            // but we might want full 3D later. For now, assume simple hierarchy.
            const localMatrix = new THREE.Matrix4();
            localMatrix.compose(
                new THREE.Vector3(node.position.x, node.position.y, 0),
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), node.rotation),
                new THREE.Vector3(node.scale.x, node.scale.y, node.scale.x)
            );

            // World Matrix = Parent * Local
            const worldMatrix = parentMatrix.clone().multiply(localMatrix);
            const worldPos = new THREE.Vector3();
            const worldScale = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion(); // unused here but needed for decompose
            worldMatrix.decompose(worldPos, worldQuat, worldScale);

            // Apply Animation (Wiggle) - crude approach, applying to position
            // Ideally we'd animate the Matrix, but we'll cheat for the SDF positions
            if (node.animationTag?.includes('limit')) {
                // Amplify 'limit' -> likely typo for limb? 
                // Wait, assembler.ts generates 'limb_X_Y'. Check assembler.ts lines 158.
                // Indeed, assembler generates 'limb_...' or 'seg_...'.
                // My animation check above was 'limit'?? That explains why it looked static!
                // Fixing to 'limb' and boosting range.
                const speed = phenotype.gaitRate * 5.0;
                const offset = worldPos.x * 0.5;
                worldPos.z += Math.sin(t * speed + offset) * 0.5; // Significant Z swipe
                worldPos.y += Math.cos(t * speed + offset) * 0.3; // Circular motion
            } else if (node.animationTag?.includes('seg')) {
                // Spine wiggle (Segments)
                worldPos.y += Math.sin(t * phenotype.gaitRate * 3.0 + worldPos.x) * 0.2;
            } else if (node.animationTag?.includes('tentacle')) {
                const speed = phenotype.gaitRate * 3.0;
                worldPos.x += Math.sin(t * speed + worldPos.y) * 0.3;
                worldPos.z += Math.cos(t * speed + worldPos.y) * 0.3;
            }

            // Decide Primitive Type based on Shape
            // 'circle'/'oval' -> Sphere (Blob)
            // 'rect'/'path' -> Capsule (connecting to parent?) 
            // For now, let's treat everything as Blobs except Limbs which are Capsules?
            // Actually, to make limbs look connected, we need start/end. 
            // Our tree is Node -> Children. 
            // A node is a "Joint". A "Limb" is the connection between Parent and Node?
            // Or a "Limb" is a node that is long?

            // Simpler organic logic:
            // Every Node is a Sphere blob.
            // If Node has parent, draw Capsule between ParentPos and NodePos?
            // Let's stick to Node = Shape for now.

            if (node.shape === 'path' || node.shape === 'rect' || node.shape === 'triangle') {
                // Render as Capsules (Limbs, Segments)
                // Assume Y-axis is the length in Local Space (standard for limbs in assembler)
                // Start: (0, -Len/2, 0) -> World
                // End:   (0, +Len/2, 0) -> World

                // Radius is X scale (thickness)
                // FORCE THICKER LIMBS: Multiply by 2.0 to ensure visibility against SDF blend
                const radius = Math.max(0.15, worldScale.x * 0.8); // Min thickness 0.15, scale multiplier increased
                const len = worldScale.y; // Length

                // We need to construct the two endpoints in WORLD space.
                // Center is 'worldPos'. 
                // Direction is 'worldQuat' * (0,1,0).

                const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
                const halfLen = len * 0.5;

                const posA = worldPos.clone().addScaledVector(up, -halfLen);
                const posB = worldPos.clone().addScaledVector(up, halfLen);

                if (capsuleCount < MAX_CAPSULES) {
                    uniforms.u_capsulesA.value[capsuleCount].set(posA.x, posA.y, posA.z);
                    uniforms.u_capsulesB.value[capsuleCount].set(posB.x, posB.y, posB.z, radius);
                    capsuleCount++;
                }

            } else {
                // Sphere (Core, simple blobs)
                const r = Math.max(worldScale.x, worldScale.y) * 0.5; // Fit to size
                if (blobCount < MAX_BLOBS) {
                    uniforms.u_blobs.value[blobCount].set(worldPos.x, worldPos.y, worldPos.z, r);
                    blobCount++;
                }
            }

            // Recurse
            node.children.forEach(child => traverse(child, worldMatrix));
        };

        const rootMatrix = new THREE.Matrix4(); // Identity
        traverse(rootNode, rootMatrix);

        uniforms.u_blobCount.value = blobCount;
        uniforms.u_capsuleCount.value = capsuleCount;

        // Update Color
        uniforms.u_color.value.set(rootNode.color);
        // Body blend: smooth organic merging
        uniforms.u_blendStrength.value = 0.3 + (1.0 - phenotype.rigidity) * 0.3;
        // Limb blend: sharp distinct appendages
        uniforms.u_limbBlendStrength.value = 0.1 + phenotype.rigidity * 0.1; // 0.1-0.2 range for sharpness
        uniforms.u_noiseStrength.value = phenotype.roughness * 0.2;

        // Breathing Cycle
        const breathCycle = Math.sin(t * (phenotype.breathRate * 5.0)); // Faster rate
        uniforms.u_breath.value = breathCycle * phenotype.breathAmplitude;

        // Fidelity Mapping
        // Skin Scale: High roughness = smaller, denser details? Or larger plates?
        // Let's say high roughness = larger scale (lower frequency) for plates.
        uniforms.u_skinScale.value = 15.0 + (1.0 - phenotype.roughness) * 20.0; // 15 to 35

        uniforms.u_skinRoughness.value = phenotype.roughness;

        // Wetness based on skin type
        let wetness = 0.2;
        if (phenotype.skinType === 'slimy' || phenotype.skinType === 'soft') wetness = 0.8;
        if (phenotype.skinType === 'plated') wetness = 0.1;
        if (phenotype.skinType === 'scaly') wetness = 0.3;

        // Override wetness if we have specific 'wetSheen' trait
        if (phenotype.wetSheen > 0.5) wetness = Math.max(wetness, phenotype.wetSheen);

        uniforms.u_wetness.value = wetness;



    });

    return (
        <group>
            <mesh ref={meshRef} position={[0, 0, 0]}>
                <boxGeometry args={[40, 40, 40]} />
                <shaderMaterial
                    vertexShader={sdfVertexShader}
                    fragmentShader={sdfFragmentShader}
                    uniforms={uniforms}
                    transparent={true}
                    depthWrite={true}
                    side={THREE.BackSide}
                />
            </mesh>
            {segmentationEnabled && ringGeometry ? (
                <group>
                    {ringPositions.map((x, index) => (
                        <mesh
                            key={`segment-ring-${index}`}
                            geometry={ringGeometry}
                            material={ringMaterial}
                            position={[x, 0, 0]}
                            rotation={[0, 0, Math.PI / 2]}
                        />
                    ))}
                </group>
            ) : null}
            {legsEnabled && legGeometry && legMatrices.length > 0 ? (
                <instancedMesh
                    key={`legs-${legMatrices.length}`}
                    ref={legsRef}
                    args={[legGeometry, legMaterial, legMatrices.length]}
                />
            ) : null}
        </group>
    );
}
