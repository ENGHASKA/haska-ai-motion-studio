import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {StoryboardScene} from './types';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

const NetworkVisual: React.FC<{progress: number}> = ({progress}) => (
  <svg className="semantic-network" viewBox="0 0 800 520" aria-hidden="true">
    {[[400, 260], [120, 110], [680, 120], [160, 410], [650, 410], [400, 70]].map(([x, y], index) => (
      <g key={index} opacity={Math.min(1, progress * 1.6 - index * 0.09)}>
        {index > 0 ? <line x1="400" y1="260" x2={x} y2={y} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} /> : null}
        <circle cx={x} cy={y} r={index === 0 ? 26 : 13} />
      </g>
    ))}
  </svg>
);

const ShieldVisual: React.FC<{progress: number}> = ({progress}) => (
  <svg className="semantic-shield" viewBox="0 0 420 500" aria-hidden="true">
    <path d="M210 24 380 88v130c0 122-72 210-170 254C112 428 40 340 40 218V88Z" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} />
    <path d="m132 247 52 52 112-126" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} />
  </svg>
);

const ReciprocityVisual: React.FC<{progress: number}> = ({progress}) => (
  <div className="semantic-reciprocity" aria-hidden="true">
    <div style={{translate: `${(1 - progress) * -90}px 0px`}}>YOU</div>
    <span style={{scale: progress}}>⇄</span>
    <div style={{translate: `${(1 - progress) * 90}px 0px`}}>COMMUNITY</div>
  </div>
);

export const SemanticScene: React.FC<{scene: StoryboardScene; index: number}> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const progress = interpolate(frame, [0, Math.min(22, fps), Math.max(23, durationInFrames - 12), durationInFrames], [0, 1, 1, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const drift = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  const vertical = height > width;

  return (
    <div className={`semantic-scene semantic-scene--${scene.visualKind}`}>
      <div className="semantic-index">{String(index + 1).padStart(2, '0')}</div>
      <div className="semantic-orbit" style={{rotate: `${drift * 28}deg`, scale: 0.9 + progress * 0.1}} />
      <div className="semantic-copy" dir={/[\u0590-\u08FF]/.test(scene.onScreenText) ? 'rtl' : 'ltr'} style={{opacity: progress, translate: `0px ${(1 - progress) * 50}px`}}>
        <div className="semantic-kicker">AUDIO / SEMANTIC SCENE</div>
        <h2 style={{fontSize: vertical ? 82 : 92}}>{scene.onScreenText}</h2>
        <div className="semantic-rule" style={{scale: `${progress} 1`}} />
      </div>
      <div className="semantic-visual" style={{opacity: progress, scale: 0.88 + progress * 0.12}}>
        {scene.visualKind === 'shield' ? <ShieldVisual progress={progress} /> : null}
        {scene.visualKind === 'reciprocity' ? <ReciprocityVisual progress={progress} /> : null}
        {scene.visualKind === 'network' || scene.visualKind === 'signal' || scene.visualKind === 'process' ? <NetworkVisual progress={progress} /> : null}
        {scene.visualKind === 'metric' ? <div className="semantic-metric">{scene.onScreenText.match(/[\d.,%]+/)?.[0] ?? '01'}</div> : null}
        {scene.visualKind === 'editorial' ? <div className="semantic-editorial-mark">“</div> : null}
      </div>
    </div>
  );
};
