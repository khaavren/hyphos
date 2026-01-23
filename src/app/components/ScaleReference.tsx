import { useMemo } from "react";
import * as THREE from "three";

export default function ScaleReference() {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6b7280",
        roughness: 0.9,
        metalness: 0,
      }),
    [],
  );

  return (
    <mesh position={[0, -5, 0]} material={material}>
      <boxGeometry args={[10, 0.05, 0.05]} />
    </mesh>
  );
}
