import {withAlpha} from '../../../motion/style';
import type {ShotProps} from '../types';
import {Chip, FullSvg, SpecText, Stage, rand, useReel} from './kit';

const LINES = Array.from({length: 9}, (_, i) => ({w: 180 + rand(i + 3) * 520, indent: (i % 3) * 36, hue: i % 4}));

// "...at least for now AI isn't ahead in some things because of the mistakes it makes sometimes."
export const ReelGlitch: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {t, colors: c} = r;
  const errors = r.option<number[]>('errors', [3.6, 6.6, 8.4, 10.0]);
  const panel = r.prog(0.3, 0.9);
  const active = errors.findIndex((at) => t >= at && t < at + 0.7);
  const since = active >= 0 ? t - errors[active] : 99;
  const glitch = since < 0.28; // brief RGB-split + shake right at each error
  const shake = glitch ? Math.sin(since * 120) * 9 * (1 - since / 0.28) : 0;
  const row = (i: number) => 540 + 96 + i * 56;

  const Card = ({dx, color, o}: {dx: number; color: string; o: number}) => (
    <rect x={90 + dx} y={540} width={900} height={640} rx={32} fill="none" stroke={color} strokeWidth={4} opacity={o} />
  );

  return (
    <Stage reel={r}>
      <FullSvg glowId="gl-glow" style={{transform: `translateX(${shake}px)`}}>
        <g opacity={panel} transform={`translate(0 ${(1 - panel) * 60})`}>
          <rect x={90} y={540} width={900} height={640} rx={32} fill={withAlpha(c.surface, 0.82)} />
          <Card dx={0} color={withAlpha(c.accent, 0.8)} o={1} />
          {glitch ? <><Card dx={-12} color={withAlpha(c.primary, 0.9)} o={0.8} /><Card dx={12} color={withAlpha(c.danger ?? c.accent, 0.9)} o={0.8} /></> : null}
          <rect x={90} y={540} width={900} height={64} rx={32} fill={withAlpha(c.accent, 0.18)} />
          {[0, 1, 2].map((i) => <circle key={i} cx={140 + i * 36} cy={572} r={9} fill={[c.danger ?? c.accent, c.accent, c.primary][i]} />)}
          {LINES.map((line, i) => {
            const typed = r.lin(0.8 + i * 0.35, 0.9);
            const bad = errors.some((at, k) => i === [2, 4, 6, 7][k] && t >= at);
            const pulse = bad ? 0.6 + 0.4 * Math.sin(t * 14) : 0;
            return (
              <g key={i} opacity={r.prog(0.7 + i * 0.35, 0.3)}>
                {bad ? <rect x={110} y={row(i) - 28} width={860} height={52} rx={12} fill={withAlpha(c.danger ?? c.accent, 0.16 + 0.12 * pulse)} /> : null}
                <rect x={140 + line.indent} y={row(i) - 10} width={line.w * typed} height={16} rx={8} fill={bad ? c.danger ?? c.accent : [c.primary, c.text, c.secondary ?? c.primary, c.accent][line.hue]} opacity={bad ? 1 : 0.75} />
                {bad ? (
                  <g transform={`translate(930 ${row(i) - 2})`} filter="url(#gl-glow)">
                    <path d="M-14 -14 L14 14 M14 -14 L-14 14" stroke={c.danger ?? c.accent} strokeWidth={8} strokeLinecap="round" />
                  </g>
                ) : null}
              </g>
            );
          })}
          <rect x={140} y={1120} width={13} height={30} fill={c.text} opacity={Math.sin(t * 6) > 0 ? 1 : 0.15} />
        </g>
      </FullSvg>
      <SpecText shot={shot} reel={r} name="head" at={r.cue('head', 0.15)} mode="line" color={c.text} />
      <Chip reel={r} x={742} y={550} w={96} h={44} label="AI" color={c.accent} size={24} opacity={panel} />
      <Chip reel={r} x={852} y={550} w={122} h={44} label="ERROR" color={c.danger ?? c.accent} size={22} opacity={active >= 0 || t > errors[0] ? 1 : 0} glow={glitch} />
      <SpecText shot={shot} reel={r} name="sub" at={r.cue('sub', 6.4)} mode="line" color={c.mutedText} />
    </Stage>
  );
};
