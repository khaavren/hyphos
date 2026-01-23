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

// Fixed size arrays for shader uniforms
const MAX_BLOBS = 50;
const MAX_CAPSULES = 50;

type Mat2D = { a: number; b: number; c: number; d: number; tx: number; ty: number };

type CollectedNode = {
  node: RenderNode;
  worldMat: Mat2D;
  worldPos: { x: number; y: number; z: number };
  axisX: { x: number; y: number };
  axisY: { x: number; y: number };
  scaleX: number;
  scaleY: number;
  rotation: number;
  zIndex: number;
};

type PrimitiveCounts = {
  byType: Record<string, number>;
  byShape: Record<string, number>;
};

const Z_LAYER_SCALE = 0.002;
const SENSOR_Z_BIAS = 0.04;

const identityMat2D = (): Mat2D => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

const composeMat2D = (parent: Mat2D, local: Mat2D): Mat2D => ({
  a: parent.a * local.a + parent.c * local.b,
  b: parent.b * local.a + parent.d * local.b,
  c: parent.a * local.c + parent.c * local.d,
  d: parent.b * local.c + parent.d * local.d,
  tx: parent.a * local.tx + parent.c * local.ty + parent.tx,
  ty: parent.b * local.tx + parent.d * local.ty + parent.ty,
});

const makeLocalMat2D = (node: RenderNode): Mat2D => {
  const cos = Math.cos(node.rotation);
  const sin = Math.sin(node.rotation);
  return {
    a: cos * node.scale.x,
    b: sin * node.scale.x,
    c: -sin * node.scale.y,
    d: cos * node.scale.y,
    tx: node.position.x,
    ty: node.position.y,
  };
};

const transformPoint = (mat: Mat2D, x: number, y: number) => ({
  x: mat.a * x + mat.c * y + mat.tx,
  y: mat.b * x + mat.d * y + mat.ty,
});

const normalize2 = (v: { x: number; y: number }) => {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
};

const getTypePriority = (type: RenderNode["type"]) => {
  switch (type) {
    case "core":
      return 0;
    case "body_segment":
      return 1;
    case "limb":
      return 2;
    case "sensor":
      return 3;
    default:
      return 0;
  }
};

const flattenTree = (root: RenderNode): CollectedNode[] => {
  const out: CollectedNode[] = [];
  const visit = (node: RenderNode, parentMat: Mat2D) => {
    const localMat = makeLocalMat2D(node);
    const worldMat = composeMat2D(parentMat, localMat);
    const axisX = { x: worldMat.a, y: worldMat.b };
    const axisY = { x: worldMat.c, y: worldMat.d };
    const scaleX = Math.hypot(axisX.x, axisX.y);
    const scaleY = Math.hypot(axisY.x, axisY.y);
    const rotation = Math.atan2(axisX.y, axisX.x);
    const zIndex = node.zIndex ?? 0;
    const z = zIndex * Z_LAYER_SCALE + (node.type === "sensor" ? SENSOR_Z_BIAS : 0);
    out.push({
      node,
      worldMat,
      worldPos: { x: worldMat.tx, y: worldMat.ty, z },
      axisX,
      axisY,
      scaleX,
      scaleY,
      rotation,
      zIndex,
    });
    node.children.forEach((child) => visit(child, worldMat));
  };

  visit(root, identityMat2D());
  out.sort((a, b) => {
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
    return getTypePriority(a.node.type) - getTypePriority(b.node.type);
  });
  return out;
};

export default function OrganismSDF({ rootNode, phenotype, genome: _genome }: OrganismSDFProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const debugPointsRef = useRef<THREE.Points>(null);
  const debugLinesRef = useRef<THREE.LineSegments>(null);
  const debugSDF = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debugSDF") === "1";
  }, []);

  void _genome;

  /**
   * Renderer should follow phenotype (renderer input),
   * not re-derive thresholds from genome.
   */
  const segmentationEnabled = phenotype.segmentCount >= 2;

  const segmentCount = Math.max(1, phenotype.segmentCount);

  // Tighter spacing reads more like segmentation than floating hoops.
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

      u_blendStrength: { value: 0.6 }, // gooey organic look
      u_limbBlendStrength: { value: 0.15 }, // sharper limbs
      u_noiseStrength: { value: 0.1 },
      u_breath: { value: 0.0 },

      u_skinScale: { value: 20.0 },
      u_skinRoughness: { value: 0.5 },
      u_wetness: { value: 0.0 },
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
      opacity: 0.85,
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

  const ringPositions = useMemo(() => {
    if (!segmentationEnabled) return [];
    return Array.from({ length: segmentCount }, (_, index) => index * segmentSpacing);
  }, [segmentationEnabled, segmentCount, segmentSpacing]);

  const flattenedNodes = useMemo(() => flattenTree(rootNode), [rootNode]);

  useFrame((state) => {
    if (!meshRef.current) return;

    const t = state.clock.elapsedTime;
    uniforms.u_time.value = t;
    uniforms.u_cameraPos.value.copy(camera.position);

    let blobCount = 0;
    let capsuleCount = 0;

    const counts: PrimitiveCounts = {
      byType: { core: 0, body_segment: 0, limb: 0, sensor: 0 },
      byShape: { circle: 0, oval: 0, rect: 0, triangle: 0, path: 0 },
    };

    const addBlob = (x: number, y: number, z: number, r: number) => {
      if (blobCount >= MAX_BLOBS) return;
      uniforms.u_blobs.value[blobCount].set(x, y, z, r);
      blobCount += 1;
    };

    const addCapsule = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      r: number,
    ) => {
      if (capsuleCount >= MAX_CAPSULES) return;
      uniforms.u_capsulesA.value[capsuleCount].set(ax, ay, az);
      uniforms.u_capsulesB.value[capsuleCount].set(bx, by, bz, r);
      capsuleCount += 1;
    };

    const animatePosition = (pos: { x: number; y: number; z: number }, tag?: string) => {
      const next = { ...pos };
      if (tag?.includes("limb") || tag?.includes("leg") || tag?.includes("feeler")) {
        const speed = phenotype.gaitRate * 5.0;
        const offset = pos.x * 0.5;
        next.z += Math.sin(t * speed + offset) * 0.5;
        next.y += Math.cos(t * speed + offset) * 0.3;
      } else if (tag?.includes("seg")) {
        next.y += Math.sin(t * phenotype.gaitRate * 3.0 + pos.x) * 0.2;
      } else if (tag?.includes("tentacle")) {
        const speed = phenotype.gaitRate * 3.0;
        next.x += Math.sin(t * speed + pos.y) * 0.3;
        next.z += Math.cos(t * speed + pos.y) * 0.3;
      }
      return next;
    };

    const addEllipticalBlobChain = (
      pos: { x: number; y: number; z: number },
      axis: { x: number; y: number },
      major: number,
      minor: number,
    ) => {
      const radius = minor * 0.5;
      const halfLen = Math.max(0, major * 0.5 - radius);
      if (halfLen <= 0.001) {
        addBlob(pos.x, pos.y, pos.z, major * 0.5);
        return;
      }
      const dir = normalize2(axis);
      const dx = dir.x * halfLen;
      const dy = dir.y * halfLen;
      addBlob(pos.x, pos.y, pos.z, radius);
      addBlob(pos.x + dx, pos.y + dy, pos.z, radius);
      addBlob(pos.x - dx, pos.y - dy, pos.z, radius);
    };

    flattenedNodes.forEach((entry) => {
      const { node, worldMat, worldPos, axisX, axisY, scaleX, scaleY } = entry;
      counts.byType[node.type] = (counts.byType[node.type] ?? 0) + 1;
      counts.byShape[node.shape] = (counts.byShape[node.shape] ?? 0) + 1;

      const pos = animatePosition(worldPos, node.animationTag);
      const animDx = pos.x - worldPos.x;
      const animDy = pos.y - worldPos.y;
      const major = Math.max(scaleX, scaleY);
      const minor = Math.min(scaleX, scaleY);

      switch (node.shape) {
        case "circle": {
          const radius = Math.max(scaleX, scaleY) * 0.5;
          addBlob(pos.x, pos.y, pos.z, radius);
          break;
        }
        case "oval": {
          const axis = scaleX >= scaleY ? axisX : axisY;
          addEllipticalBlobChain(pos, axis, major, minor);
          break;
        }
        case "rect": {
          const axis = scaleX >= scaleY ? axisX : axisY;
          addEllipticalBlobChain(pos, axis, major, minor);
          break;
        }
        case "path": {
          const axis = normalize2(axisY);
          const halfLen = Math.max(0.001, scaleY * 0.5);
          const radius = Math.max(0.06, scaleX * 0.5);
          const ax = pos.x - axis.x * halfLen;
          const ay = pos.y - axis.y * halfLen;
          const bx = pos.x + axis.x * halfLen;
          const by = pos.y + axis.y * halfLen;
          addCapsule(ax, ay, pos.z, bx, by, pos.z, radius);
          break;
        }
        case "triangle": {
          const v0 = transformPoint(worldMat, 0, scaleY * 0.5);
          const v1 = transformPoint(worldMat, -scaleX * 0.5, -scaleY * 0.5);
          const v2 = transformPoint(worldMat, scaleX * 0.5, -scaleY * 0.5);
          v0.x += animDx;
          v0.y += animDy;
          v1.x += animDx;
          v1.y += animDy;
          v2.x += animDx;
          v2.y += animDy;
          const radius = Math.max(0.04, Math.min(scaleX, scaleY) * 0.08);
          addCapsule(v0.x, v0.y, pos.z, v1.x, v1.y, pos.z, radius);
          addCapsule(v1.x, v1.y, pos.z, v2.x, v2.y, pos.z, radius);
          addCapsule(v2.x, v2.y, pos.z, v0.x, v0.y, pos.z, radius);
          break;
        }
        default:
          break;
      }
    });

    uniforms.u_blobCount.value = blobCount;
    uniforms.u_capsuleCount.value = capsuleCount;

    if (debugSDF) {
      // eslint-disable-next-line no-console
      console.log("[SDF] primitives", counts.byType, counts.byShape);
    }

    if (debugSDF && debugPointsRef.current && debugLinesRef.current) {
      const pointPositions = new Float32Array(flattenedNodes.length * 3);
      const linePositions = new Float32Array(flattenedNodes.length * 6);
      flattenedNodes.forEach((entry, index) => {
        const pos = animatePosition(entry.worldPos, entry.node.animationTag);
        const axis = normalize2(entry.axisX);
        const length = Math.max(entry.scaleX, entry.scaleY) * 0.5;
        pointPositions[index * 3] = pos.x;
        pointPositions[index * 3 + 1] = pos.y;
        pointPositions[index * 3 + 2] = pos.z;
        linePositions[index * 6] = pos.x;
        linePositions[index * 6 + 1] = pos.y;
        linePositions[index * 6 + 2] = pos.z;
        linePositions[index * 6 + 3] = pos.x + axis.x * length;
        linePositions[index * 6 + 4] = pos.y + axis.y * length;
        linePositions[index * 6 + 5] = pos.z;
      });

      const pointsGeom = debugPointsRef.current.geometry as THREE.BufferGeometry;
      const linesGeom = debugLinesRef.current.geometry as THREE.BufferGeometry;
      pointsGeom.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));
      linesGeom.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    }

    // Material controls
    uniforms.u_color.value.set(rootNode.color);
    uniforms.u_blendStrength.value = 0.3 + (1.0 - phenotype.rigidity) * 0.3;
    uniforms.u_limbBlendStrength.value = 0.1 + phenotype.rigidity * 0.1;
    uniforms.u_noiseStrength.value = phenotype.roughness * 0.2;

    // Breathing
    const breathCycle = Math.sin(t * (phenotype.breathRate * 5.0));
    uniforms.u_breath.value = breathCycle * phenotype.breathAmplitude;

    // Skin fidelity
    uniforms.u_skinScale.value = 15.0 + (1.0 - phenotype.roughness) * 20.0;
    uniforms.u_skinRoughness.value = phenotype.roughness;

    // Wetness
    let wetness = 0.2;
    if (phenotype.skinType === "slimy" || phenotype.skinType === "soft") wetness = 0.8;
    if (phenotype.skinType === "plated") wetness = 0.1;
    if (phenotype.skinType === "scaly") wetness = 0.3;
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
          depthWrite={false}
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

      {debugSDF ? (
        <group>
          <points ref={debugPointsRef}>
            <bufferGeometry />
            <pointsMaterial size={0.12} color="#ff4fd8" depthTest={false} depthWrite={false} />
          </points>
          <lineSegments ref={debugLinesRef}>
            <bufferGeometry />
            <lineBasicMaterial color="#34d8ff" depthTest={false} depthWrite={false} />
          </lineSegments>
        </group>
      ) : null}
    </group>
  );
}
