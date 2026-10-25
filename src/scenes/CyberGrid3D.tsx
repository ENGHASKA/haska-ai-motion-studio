import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {clamp} from '../lib/motion';

export const CyberGrid3D: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const scale = interpolate(frame, [0, 30, 120, 149], [0.4, 1, 1, 0.4], clamp);

  return (
    <AbsoluteFill style={{backgroundColor: '#02060d'}}>
      <ThreeCanvas width={width} height={height} camera={{position: [0, 0, 7], fov: 42}}>
        <color attach="background" args={['#02060d']} />
        <ambientLight intensity={0.6} />
        <pointLight position={[3, 4, 5]} intensity={35} color="#53f6ff" />
        <pointLight position={[-4, -2, 3]} intensity={25} color="#00ffc7" />
        <mesh scale={scale} rotation={[frame * 0.012, frame * 0.019, frame * 0.006]}>
          <icosahedronGeometry args={[1.8, 2]} />
          <meshStandardMaterial color="#061a2a" emissive="#00a9b8" emissiveIntensity={0.3} metalness={0.85} roughness={0.24} wireframe />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, -frame * 0.012]}>
          <torusGeometry args={[2.8, 0.025, 12, 128]} />
          <meshBasicMaterial color="#53f6ff" />
        </mesh>
      </ThreeCanvas>
      <div className="three-label">THREAT TOPOLOGY // REAL-TIME</div>
    </AbsoluteFill>
  );
};
