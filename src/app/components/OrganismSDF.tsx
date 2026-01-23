import React, { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RenderNode } from "../../lib/rendering/types";
import { Genome, Phenotype } from "../../lib/simulation/types";
import { sdfVertexShader, sdfFragmentShader } from "../../lib/rendering/sdfShader";

interface OrganismSDFProps {
  rootNode: RenderNode;
  phenotype: Phenotype;
  genome: Genome;
}

/**
 * FIX STRATEGY:
 * - Do NOT "inject" matrices into meshes.
 * - Render the RenderNode tree as real nested groups:
 *     <group position/rotation/scale> ...children...
 * - This makes limbs actually attach and stops the “tubes and blobs” look.
 *
 * SDF is kept as an optional toggle, but default OFF.
 */

// Fixed size arrays for shader uniforms (only used if SDF is enabled)
const MAX_BLOBS = 80;
const MAX_CAPSULES = 120;

const isBodyLike = (node: RenderNode) =>
  node.type === "core" || node.type === "body_segment";

const isLimbLike = (node: RenderNode) =>
  node.type === "limb" ||
  node.animationTag?.includes("limb") ||
  node.animationTag?.includes("leg") ||
  node.animationTag?.includes("tentacle");

const isSensorLike = (node: RenderNode) =>
  node.type === "sensor" ||
  node.animationTag?.includes("eye") ||
  node.animationTag?.includes("mouth");

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function OrganismSDF({ rootNode, phenotype }: OrganismSDFProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  /**
   * IMPORTANT DEFAULTS:
   * If you want to see "creatures" (not blobs/tubes), keep SDF OFF.
   */
  const USE_OVERLAY_TREE = true;
  const USE_SDF_BODY = false; // ✅ default OFF

  // Optional segmentation rings
  const segmentationEnabled = false;

  const segmentCount = Math.max(1, phenotype.segmentCount);
  const segmentSpacing = phenotype.axialScale[0] * 1.25;
  const bodyRadius = Math.max(rootNode.scale.y, rootNode.scale.x * 0.35) * 0.5;
  const ringThickness = Math.max(0.12, bodyRadius * 0.12);

  const uniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_cameraPos: { value: new THREE.Vector3() },
      u_color: { value: new THREE.Color("#bdc3c7") },

      u_blobs: {
        value: Array.from({ length: MAX_BLOBS }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
      u_blobCount: { value: 0 },

      u_capsulesA: {
        value: Array.from({ length: MAX_CAPSULES }, () => new THREE.Vector3(0, 0, 0)),
      },
      u_capsulesB: {
        value: Array.from({ length: MAX_CAPSULES }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
      u_capsuleCount: { value: 0 },

      u_blendStrength: { value: 0.55 },
      u_limbBlendStrength: { value: 0.12 },
      u_noiseStrength: { value: 0.12 },
      u_breath: { value: 0.0 },

      u_skinScale: { value: 20.0 },
      u_skinRoughness: { value: 0.5 },
      u_wetness: { value: 0.2 },
    }),
    [],
  );

  const ringGeometry = useMemo(() => {
    if (!segmentationEnabled) return null;
    return new THREE.CylinderGeometry(bodyRadius, bodyRadius, ringThickness, 18, 1, true);
  }, [segmentationEnabled, bodyRadius, ringThickness]);

  const ringMaterial = useMemo(() => {
    const color = new THREE.Color(rootNode.color).multiplyScalar(0.75);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 0.65,
    });
  }, [rootNode.color]);

  useEffect(() => {
    return () => {
      ringGeometry?.dispose();
      ringMaterial.dispose();
    };
  }, [ringGeometry, ringMaterial]);

  const ringPositions = useMemo(() => {
    if (!segmentationEnabled) return [];
    return Array.from({ length: segmentCount }, (_, index) => index * segmentSpacing);
  }, [segmentationEnabled, segmentCount, segmentSpacing]);

  /**
   * Shared geometries for the overlay tree.
   * These are unit shapes; we scale them per node via group scale.
   */
  const overlayGeoms = useMemo(() => {
    const sphere = new THREE.SphereGeometry(0.5, 18, 14); // unit-ish
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1);
    const triCone = new THREE.ConeGeometry(0.6, 1.2, 3, 1);
    return { sphere, box, cyl, triCone };
  }, []);

  useEffect(() => {
    return () => {
      overlayGeoms.sphere.dispose();
      overlayGeoms.box.dispose();
      overlayGeoms.cyl.dispose();
      overlayGeoms.triCone.dispose();
    };
  }, [overlayGeoms]);

  /**
   * Simple material helper.
   */
  const getMatProps = (node: RenderNode) => {
    const kind: "body" | "limb" | "sensor" =
      isSensorLike(node) ? "sensor" : isLimbLike(node) ? "limb" : "body";

    const roughness = kind === "sensor" ? 0.25 : kind === "limb" ? 0.75 : 0.65;
    const metalness = kind === "sensor" ? 0.08 : 0.02;

    return { color: node.color, roughness, metalness };
  };

  /**
   * BIG FIX: render node tree as actual nested transforms.
   * This removes the “matrix injection” failure mode completely.
   */
  const RenderNodeTree = ({ node }: { node: RenderNode }) => {
    // Depth: give everything a sane Z thickness so it never collapses into “lines”
    const kind: "body" | "limb" | "sensor" =
      isSensorLike(node) ? "sensor" : isLimbLike(node) ? "limb" : "body";

    const sx = node.scale.x;
    const sy = node.scale.y;

    const sz =
      kind === "body"
        ? Math.max(0.35 * sy, 0.35) // body has real volume
        : kind === "sensor"
          ? Math.max(0.22 * sy, 0.18)
          : Math.max(0.16 * sy, 0.14); // limbs thin but visible

    // Pick a geometry that matches what assembler emits
    let geom: THREE.BufferGeometry = overlayGeoms.sphere;

    if (kind === "limb") {
      if (node.shape === "triangle") geom = overlayGeoms.triCone; // wings/fins
      else if (node.shape === "rect") geom = overlayGeoms.box; // legs
      else if (node.shape === "path") geom = overlayGeoms.cyl; // tentacles/tails
      else geom = overlayGeoms.sphere; // joints
    } else {
      // body + sensors are spheres/ovals in our simplified mesh set
      geom = overlayGeoms.sphere;
    }

    // For triangle limbs: orient them so they read as a fin/wing (not edge-on)
    const extraRotX =
      kind === "limb" && node.shape === "triangle" ? Math.PI / 2 : 0;

    // For cylinder limbs: cylinder is aligned to Y by default; our limbs are “length on Y” too => OK

    const mat = getMatProps(node);

    return (
      <group
        position={[node.position.x, node.position.y, 0]}
        rotation={[extraRotX, 0, node.rotation]}
        scale={[sx, sy, sz]}
      >
        <mesh geometry={geom} castShadow receiveShadow>
          <meshStandardMaterial
            color={mat.color}
            roughness={mat.roughness}
            metalness={mat.metalness}
          />
        </mesh>

        {node.children?.map((child) => (
          <RenderNodeTree key={child.id} node={child} />
        ))}
      </group>
    );
  };

  /**
   * OPTIONAL: SDF uniforms update (only if enabled)
   */
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    uniforms.u_time.value = t;
    uniforms.u_cameraPos.value.copy(camera.position);

    if (!USE_SDF_BODY || !meshRef.current) {
      uniforms.u_blobCount.value = 0;
      uniforms.u_capsuleCount.value = 0;
      return;
    }

    let blobCount = 0;
    let capsuleCount = 0;

    const traverse = (node: RenderNode, parentMatrix: THREE.Matrix4) => {
      if (blobCount >= MAX_BLOBS || capsuleCount >= MAX_CAPSULES) return;

      const localMatrix = new THREE.Matrix4();
      localMatrix.compose(
        new THREE.Vector3(node.position.x, node.position.y, 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), node.rotation),
        new THREE.Vector3(node.scale.x, node.scale.y, node.scale.x),
      );

      const worldMatrix = parentMatrix.clone().multiply(localMatrix);

      const worldPos = new THREE.Vector3();
      const worldScale = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      worldMatrix.decompose(worldPos, worldQuat, worldScale);

      if (isBodyLike(node)) {
        const r = Math.max(worldScale.x, worldScale.y) * 0.65 + 0.15;
        uniforms.u_blobs.value[blobCount].set(worldPos.x, worldPos.y, worldPos.z, r);
        blobCount += 1;
      } else if (isLimbLike(node)) {
        const radius = Math.max(0.08, worldScale.x * 0.35);
        const len = Math.max(0.25, worldScale.y);

        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
        const halfLen = len * 0.5;

        const posA = worldPos.clone().addScaledVector(up, -halfLen);
        const posB = worldPos.clone().addScaledVector(up, halfLen);

        if (capsuleCount < MAX_CAPSULES) {
          uniforms.u_capsulesA.value[capsuleCount].set(posA.x, posA.y, posA.z);
          uniforms.u_capsulesB.value[capsuleCount].set(posB.x, posB.y, posB.z, radius);
          capsuleCount += 1;
        }
      }

      node.children?.forEach((child) => traverse(child, worldMatrix));
    };

    traverse(rootNode, new THREE.Matrix4());

    uniforms.u_blobCount.value = blobCount;
    uniforms.u_capsuleCount.value = capsuleCount;

    uniforms.u_color.value.set(rootNode.color);
    uniforms.u_blendStrength.value = 0.25 + (1.0 - phenotype.rigidity) * 0.35;
    uniforms.u_limbBlendStrength.value = 0.08 + phenotype.rigidity * 0.1;
    uniforms.u_noiseStrength.value = clamp(phenotype.roughness * 0.22, 0.0, 0.35);

    const breathCycle = Math.sin(t * (phenotype.breathRate * 5.0));
    uniforms.u_breath.value = breathCycle * phenotype.breathAmplitude;

    uniforms.u_skinScale.value = 15.0 + (1.0 - phenotype.roughness) * 20.0;
    uniforms.u_skinRoughness.value = clamp(phenotype.roughness, 0.1, 1.0);

    let wetness = 0.2;
    if (phenotype.skinType === "slimy" || phenotype.skinType === "soft") wetness = 0.8;
    if (phenotype.skinType === "plated") wetness = 0.1;
    if (phenotype.skinType === "scaly") wetness = 0.3;
    if (phenotype.wetSheen > 0.5) wetness = Math.max(wetness, phenotype.wetSheen);
    uniforms.u_wetness.value = wetness;
  });

  return (
    <group>
      {/* Optional SDF body */}
      {USE_SDF_BODY ? (
        <mesh ref={meshRef} position={[0, 0, 0]}>
          <boxGeometry args={[40, 40, 40]} />
          <shaderMaterial
            vertexShader={sdfVertexShader}
            fragmentShader={sdfFragmentShader}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            side={THREE.BackSide}
          />
        </mesh>
      ) : null}

      {/* Optional segmentation rings */}
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

      {/* ✅ Real creature silhouette: render the RenderNode tree */}
      {USE_OVERLAY_TREE ? <RenderNodeTree node={rootNode} /> : null}
    </group>
  );
}
