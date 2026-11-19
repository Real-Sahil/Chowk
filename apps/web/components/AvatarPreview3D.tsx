"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

export const SKIN = { "tone-1": "#f3d2b3", "tone-2": "#e0ac84", "tone-3": "#c68b5e", "tone-4": "#8d5a3b", "tone-5": "#5b3a29" } as const;
export const OUTFIT = { terracotta: "#c2410c", teal: "#0f766e", saffron: "#d97706", indigo: "#4338ca", cream: "#e7dcc3" } as const;
export type Look = { skin: keyof typeof SKIN; outfit: keyof typeof OUTFIT; accessory: "none" | "cap" | "scarf" | "glasses" };

function Figure({ look }: { look: Look }) {
  const g = useRef<Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.6; });
  return (
    <group ref={g} position={[0, -1.2, 0]}>
      <mesh position={[0, 0.9, 0]}><capsuleGeometry args={[0.42, 0.9, 6, 16]} /><meshStandardMaterial color={OUTFIT[look.outfit]} /></mesh>
      <mesh position={[0, 1.95, 0]}><sphereGeometry args={[0.38, 24, 24]} /><meshStandardMaterial color={SKIN[look.skin]} /></mesh>
      {look.accessory === "cap" && <mesh position={[0, 2.2, 0]}><sphereGeometry args={[0.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#1f2937" /></mesh>}
      {look.accessory === "scarf" && <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.36, 0.1, 12, 24]} /><meshStandardMaterial color="#b91c1c" /></mesh>}
      {look.accessory === "glasses" && <mesh position={[0, 1.98, 0.34]}><boxGeometry args={[0.55, 0.12, 0.05]} /><meshStandardMaterial color="#111827" /></mesh>}
    </group>
  );
}

/** Loaded lazily and only on the onboarding screen so the map and the rest of the app stay light on low-end phones. */
export default function AvatarPreview3D({ look }: { look: Look }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 5], fov: 40 }} aria-label="Character preview">
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <Figure look={look} />
    </Canvas>
  );
}
