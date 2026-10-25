import {useCurrentFrame} from 'remotion';

const values = ['A7', '0X', '11', 'E4', '9F', 'C2', '77', 'D0', '3B', '8C'];

export const DataStream: React.FC<{x: number; delay: number}> = ({x, delay}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - delay);

  return (
    <div
      className="data-stream"
      style={{left: x, transform: `translateY(${(local * 8) % 980 - 780}px)`}}
    >
      {values.map((value, index) => (
        <span key={`${value}-${index}`} style={{opacity: 0.22 + index * 0.055}}>
          {value}
        </span>
      ))}
    </div>
  );
};
