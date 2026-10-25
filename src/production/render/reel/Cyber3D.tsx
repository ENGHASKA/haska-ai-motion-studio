import {ThreeCanvas} from '@remotion/three';
import {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import type {ShotProps} from '../types';
import {Chip, SpecText, Stage, W, H, rand, useReel, lerp} from './kit';

/** Position of orbiting node `i` at time t (shared by the dots and the links between them). */
const nodeAt = (i: number, t: number): [number, number, number] => {
  const node = NODES[i];
  const radius = 1.78 + (node.ring % 2) * 0.2;
  const tilt = node.ring % 2 === 0 ? 0.5 : -0.4;
  const a = node.phase + t * node.speed * (node.ring % 2 === 0 ? 1 : -1);
  const y0 = Math.sin(a) * radius;
  return [Math.cos(a) * radius, y0 * Math.sin(tilt) * -1, y0 * Math.cos(tilt)];
};

const linkPositions = (t: number) => {
  const out: number[] = [];
  for (let i = 0; i < NODES.length; i++) out.push(...nodeAt(i, t), ...nodeAt((i + 5) % NODES.length, t));
  return new Float32Array(out);
};

const shieldGeometry = () => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.6);
  shape.lineTo(1.25, 1.15);
  shape.lineTo(1.25, 0.1);
  shape.bezierCurveTo(1.25, -0.9, 0.6, -1.5, 0, -1.85);
  shape.bezierCurveTo(-0.6, -1.5, -1.25, -0.9, -1.25, 0.1);
  shape.lineTo(-1.25, 1.15);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 28});
  geometry.translate(0, 0, -0.15);
  return geometry;
};

const STARS = (() => {
  const positions = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) {
    const a = rand(i + 1) * Math.PI * 2;
    const b = Math.acos(2 * rand(i + 99) - 1);
    const radius = 3.2 + rand(i + 200) * 2.6;
    positions.set([radius * Math.sin(b) * Math.cos(a), radius * Math.sin(b) * Math.sin(a), radius * Math.cos(b) - 1], i * 3);
  }
  return positions;
})();

const NODES = Array.from({length: 18}, (_, i) => ({ring: i % 3, phase: (i / 18) * Math.PI * 2 * 3, speed: 0.35 + (i % 3) * 0.12}));

// "...and Cybersecurity: the safety valve of networks, systems, technology."
// A 3D scene: shield inside a wireframe network globe, with orbiting nodes. Motion is driven by the frame only.
export const ReelCyber3D: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {colors: c} = r;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const geometry = useMemo(shieldGeometry, []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 25), [geometry]);
  const intro = r.prog(0, 1.4);
  const chips = (shot.engineOptions?.chips as string[] | undefined) ?? [];
  const chipAt = (shot.engineOptions?.chipAt as number[] | undefined) ?? [3.2, 5.4, 6.4, 7.0];
  const dolly = lerp(1.06, 0.94, r.lin(0, r.seconds)); // slow push-in/out so the shot is never static

  return (
    <Stage reel={r} light={false}>
      <ThreeCanvas width={W} height={H} camera={{position: [0, 0, 9], fov: 40}} style={{position: 'absolute', inset: 0}}>
        <ambientLight intensity={0.55} />
        <pointLight position={[3, 4, 6]} intensity={60} color={c.primary} />
        <pointLight position={[-4, -3, 4]} intensity={55} color={c.accent} />
        <group position={[0, 0.62, 0]} scale={0.62 * intro * dolly} rotation={[0.12 * Math.sin(t * 0.5), 0, 0]}>
          <mesh rotation={[t * 0.12, t * 0.2, 0]}>
            <icosahedronGeometry args={[1.62, 2]} />
            <meshBasicMaterial color={c.primary} wireframe transparent opacity={0.42} />
          </mesh>
          <group position={[0, Math.sin(t * 1.4) * 0.05, 0]} rotation={[0, Math.sin(t * 0.7) * 0.5, 0]} scale={0.62}>
            {/* orange rim: a slightly larger, thinner copy behind the navy face */}
            <mesh geometry={geometry} scale={[1.1, 1.08, 0.55]} position={[0, -0.02, -0.12]}>
              <meshBasicMaterial color={c.accent} />
            </mesh>
            <mesh geometry={geometry}>
              <meshStandardMaterial color="#1b4fb8" metalness={0.5} roughness={0.35} emissive="#0b2f80" emissiveIntensity={0.3} />
            </mesh>
            <lineSegments geometry={edges} position={[0, 0, 0.01]}>
              <lineBasicMaterial color="#ffd2a8" />
            </lineSegments>
            {/* check mark emblem on the face */}
            <group position={[0, 0.05, 0.42]}>
              <mesh position={[-0.3, -0.1, 0]} rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.2, 0.62, 0.12]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
              </mesh>
              <mesh position={[0.2, 0.1, 0]} rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[0.2, 1.08, 0.12]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
              </mesh>
            </group>
          </group>
          {[1.8, 2.0].map((radius, i) => (
            <mesh key={radius} rotation={[Math.PI / 2 + (i === 0 ? 0.5 : -0.4), 0, t * (i === 0 ? 0.3 : -0.22)]}>
              <torusGeometry args={[radius, 0.012, 8, 160]} />
              <meshBasicMaterial color={i === 0 ? c.primary : c.accent} transparent opacity={0.8} />
            </mesh>
          ))}
          {/* a scan ring sweeping through the globe */}
          <mesh position={[0, Math.sin(t * 1.1) * 1.45, 0]} rotation={[Math.PI / 2, 0, 0]} scale={Math.sqrt(Math.max(0.02, 1 - (Math.sin(t * 1.1) * 1.45 / 1.62) ** 2))}>
            <torusGeometry args={[1.62, 0.014, 8, 128]} />
            <meshBasicMaterial color={c.accent} transparent opacity={0.75} />
          </mesh>
          <points>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[STARS, 3]} />
            </bufferGeometry>
            <pointsMaterial color={c.primary} size={0.035} transparent opacity={0.55} sizeAttenuation />
          </points>
          <lineSegments key={Math.floor(t * 20)}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[linkPositions(t), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={c.primary} transparent opacity={0.3} />
          </lineSegments>
          {NODES.map((_, i) => (
            <mesh key={i} position={nodeAt(i, t)}>
              <sphereGeometry args={[0.055 + (i % 4 === 0 ? 0.03 : 0), 12, 12]} />
              <meshBasicMaterial color={i % 4 === 0 ? c.accent : '#ffffff'} />
            </mesh>
          ))}
        </group>
      </ThreeCanvas>
      <SpecText shot={shot} reel={r} name="head" at={r.cue('head', 0.3)} mode="line" color={c.text} />
      {chips.map((label, i) => (
        <Chip key={label} reel={r} x={70 + (i % 2) * 480} y={1085 + Math.floor(i / 2) * 100} w={460} h={84} label={label} color={i === 0 ? c.accent : c.primary} size={42} opacity={r.prog(chipAt[i] ?? 3 + i, 0.5)} scale={0.9 + 0.1 * r.prog(chipAt[i] ?? 3 + i, 0.5)} glow={i === 0} />
      ))}
    </Stage>
  );
};
