import {withAlpha} from '../../../motion/style';
import type {ShotProps} from '../types';
import {FullSvg, SpecText, Stage, pop, useReel} from './kit';

// "...but human expertise stays necessary - present in everything."
export const ReelHuman: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {t, colors: c} = r;
  const humanAt = r.cue('human', 0.5);
  const okAt = r.cue('ok', 3.4);
  const h = r.prog(humanAt, 1.0);
  const ok = r.prog(okAt, 0.7);

  return (
    <Stage reel={r}>
      <FullSvg glowId="hm-glow">
        <g transform="translate(540 765)">
          {/* AI badges orbit but never cross the person */}
          <g transform={`rotate(${t * 22})`} opacity={r.prog(humanAt + 0.5, 0.8)}>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i} transform={`rotate(${i * 72}) translate(248 0) rotate(${-t * 22 - i * 72})`}>
                <circle r={46} fill={withAlpha(c.accent, 0.16)} stroke={c.accent} strokeWidth={3} />
                <text y={12} textAnchor="middle" fontSize={32} fontWeight={700} fill={c.accent} fontFamily={r.fonts.display}>AI</text>
              </g>
            ))}
          </g>
          <circle r={200 + 7 * Math.sin(t * 2.2)} fill={withAlpha(c.primary, 0.07)} stroke={withAlpha(c.primary, 0.55)} strokeWidth={3} opacity={h} />
          <g opacity={h} transform={`scale(${0.85 + 0.15 * pop(h)})`} filter="url(#hm-glow)">
            <circle cy={-70} r={78} fill={c.surface} stroke={c.primary} strokeWidth={7} />
            <path d="M-150 150 Q-150 30 0 30 Q150 30 150 150 Z" fill={c.surface} stroke={c.primary} strokeWidth={7} strokeLinejoin="round" />
            <circle cy={-70} r={26} fill={withAlpha(c.primary, 0.35)} />
          </g>
        </g>
        <g transform="translate(540 1150)" opacity={ok}>
          <circle r={44 * pop(ok)} fill={withAlpha(c.primary, 0.16)} stroke={c.primary} strokeWidth={5} filter="url(#hm-glow)" />
          <path d="M-18 2 L-5 16 L20 -14" fill="none" stroke={c.primary} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - r.lin(okAt + 0.1, 0.5)} />
        </g>
      </FullSvg>
      <SpecText shot={shot} reel={r} name="head" at={r.cue('head', 0.15)} mode="word" />
      <SpecText shot={shot} reel={r} name="ok" at={okAt + 0.2} mode="line" color={c.primary} />
    </Stage>
  );
};
