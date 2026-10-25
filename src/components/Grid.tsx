import {useCurrentFrame} from 'remotion';

export const Grid: React.FC = () => {
  const frame = useCurrentFrame();
  const offset = (frame * 1.2) % 80;

  return (
    <div
      className="perspective-grid"
      style={{
        backgroundPosition: `${offset}px ${offset}px`,
        opacity: 0.22 + Math.sin(frame / 18) * 0.04,
      }}
    />
  );
};
