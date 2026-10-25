import {AbsoluteFill} from 'remotion';
import {withAlpha} from '../../../motion/style';
import type {ShotProps} from '../types';
import {FullSvg, SpecText, Stage, lerp, pop, useReel} from './kit';

const GROUND = 1120;
const CARD = {x: 560, y: 950, w: 320, h: 180};

const Graduate: React.FC<{x: number; y: number; stride: number; cap: {dx: number; dy: number; rot: number}; slump: number; shrug: number; color: string; accent: string}> = ({x, y, stride, cap, slump, shrug, color, accent}) => {
  const swing = Math.sin(stride) * 34;
  const arm = (side: number) => `M0 -140 L${side * (swing * 0.8 * (1 - shrug) + 62 * shrug)} ${-90 - 62 * shrug}`;
  return (
    <g transform={`translate(${x} ${y + slump * 14}) rotate(${slump * 8})`} stroke={color} strokeWidth={9} strokeLinecap="round" fill="none">
      <path d={`M0 -70 V-150 ${arm(-1)} ${arm(1)} M0 -70 L${-swing} 0 M0 -70 L${swing} 0`} />
      <circle cy={-190} r={36} fill={withAlpha(color, 0.18)} />
      <g transform={`translate(${cap.dx} ${-224 + cap.dy}) rotate(${cap.rot})`} stroke={accent}>
        <path d="M-46 0 L0 -22 L46 0 L0 22 Z" fill={withAlpha(accent, 0.3)} strokeWidth={6} strokeLinejoin="round" />
        <path d="M46 0 V28" strokeWidth={5} />
      </g>
    </g>
  );
};

// "But until when, God knows. Let us graduate and get hired before it takes the job. See you." - the gag lands in
// the pause after "the job": a claw lifts the offer away, an AI stamp slams down, the graduate's cap drops.
export const ReelFinale: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {t, colors: c} = r;
  const clockAt = r.cue('clock', 0.3);
  const raceAt = r.cue('race', 4.0);
  const grabAt = r.cue('grab', 6.9);
  const stampAt = r.cue('stamp', 7.35);
  const endAt = r.cue('end', 8.5);

  const clock = r.prog(clockAt, 0.7) * (1 - r.prog(raceAt - 0.5, 0.5, 'exit'));
  const run = r.prog(raceAt, 2.7, 'standard');
  const gx = lerp(150, 430, run);
  const stride = run < 1 ? t * 15 : 0;
  const claw = r.prog(grabAt - 0.5, 0.5, 'standard');
  const lift = r.prog(grabAt + 0.3, 0.8, 'standard');
  const clawY = lerp(-60, 905, claw) - lift * 1100;
  const cardLift = lift * 1100;
  const stamp = r.prog(stampAt, 0.28);
  const slump = r.prog(stampAt + 0.1, 0.5);
  const capFall = r.prog(stampAt + 0.1, 0.9, 'exit');
  const capBack = r.prog(endAt + 0.4, 0.7);
  const shake = r.lin(stampAt, 0.35) < 1 && t >= stampAt ? Math.sin((t - stampAt) * 90) * 12 * (1 - r.lin(stampAt, 0.35)) : 0;
  const capState = t < stampAt + 0.1 ? {dx: 0, dy: 0, rot: 0} : t < endAt + 0.4 ? {dx: lerp(0, 90, capFall), dy: lerp(0, 205, capFall), rot: lerp(0, 160, capFall)} : {dx: lerp(90, 0, capBack), dy: lerp(205, 0, capBack) - Math.sin(capBack * Math.PI) * 60, rot: lerp(160, 360, capBack)};
  const endAlpha = r.prog(endAt, 0.7);

  return (
    <Stage reel={r}>
      <FullSvg glowId="fn-glow" style={{transform: `translate(${shake}px, ${shake * 0.4}px)`}}>
        {/* suspense: a clock that will not stop */}
        <g transform="translate(540 700)" opacity={clock}>
          <circle r={190} fill={withAlpha(c.surface, 0.7)} stroke={c.primary} strokeWidth={6} filter="url(#fn-glow)" />
          <circle r={190} fill="none" stroke={c.accent} strokeWidth={10} strokeLinecap="round" strokeDasharray="260 934" transform={`rotate(${t * 90 - 90})`} filter="url(#fn-glow)" />
          {Array.from({length: 12}, (_, i) => <line key={i} x1={0} y1={-166} x2={0} y2={-148} stroke={withAlpha(c.text, 0.7)} strokeWidth={5} transform={`rotate(${i * 30})`} />)}
          <line x1={0} y1={0} x2={0} y2={-120} stroke={c.text} strokeWidth={9} strokeLinecap="round" transform={`rotate(${t * 18})`} />
          <line x1={0} y1={0} x2={0} y2={-150} stroke={c.accent} strokeWidth={5} strokeLinecap="round" transform={`rotate(${t * 220})`} />
          <circle r={12} fill={c.accent} />
        </g>
        {/* ground + speed lines */}
        <line x1={60} y1={GROUND} x2={1020} y2={GROUND} stroke={withAlpha(c.primary, 0.4)} strokeWidth={3} opacity={r.prog(raceAt - 0.2, 0.4)} />
        {run > 0 && run < 1 ? [0, 1, 2].map((i) => <line key={i} x1={gx - 90 - i * 40 - ((t * 600) % 60)} y1={GROUND - 40 - i * 30} x2={gx - 150 - i * 40 - ((t * 600) % 60)} y2={GROUND - 40 - i * 30} stroke={withAlpha(c.primary, 0.5)} strokeWidth={5} strokeLinecap="round" />) : null}
        {/* the job offer */}
        <g transform={`translate(${CARD.x} ${CARD.y - cardLift + Math.sin(t * 2) * (lift > 0 ? 0 : 6)}) rotate(${lift * -10})`} opacity={r.prog(raceAt - 0.3, 0.5)}>
          <rect width={CARD.w} height={CARD.h} rx={22} fill={withAlpha(c.surface, 0.9)} stroke={c.primary} strokeWidth={4} filter="url(#fn-glow)" />
          <rect x={26} y={26} width={90} height={14} rx={7} fill={c.accent} />
          <rect x={26} y={CARD.h - 40} width={220} height={10} rx={5} fill={withAlpha(c.text, 0.45)} />
          <rect x={26} y={CARD.h - 22} width={150} height={10} rx={5} fill={withAlpha(c.text, 0.3)} />
        </g>
        <Graduate x={gx} y={GROUND} stride={stride} cap={capState} slump={slump * (t < endAt ? 1 : 1 - capBack)} shrug={r.prog(stampAt + 0.5, 0.35) * (1 - r.prog(endAt + 0.6, 0.4))} color={c.text} accent={c.accent} />
        {/* the reaction: an exclamation mark pops over the graduate when the claw shows up */}
        <g transform={`translate(${gx + 70} ${GROUND - 300}) scale(${pop(r.prog(grabAt - 0.4, 0.3))})`} opacity={t > grabAt - 0.4 && t < stampAt + 0.9 ? 1 : 0}>
          <text textAnchor="middle" fontSize={120} fontWeight={700} fill={c.accent} fontFamily={r.fonts.display} filter="url(#fn-glow)">!</text>
        </g>
        {/* the claw */}
        <g opacity={claw}>
          <line x1={CARD.x + CARD.w / 2} y1={-10} x2={CARD.x + CARD.w / 2} y2={clawY} stroke={withAlpha(c.accent, 0.8)} strokeWidth={6} />
          <g transform={`translate(${CARD.x + CARD.w / 2} ${clawY})`} filter="url(#fn-glow)">
            <rect x={-40} y={-18} width={80} height={36} rx={10} fill={c.accent} />
            {[-1, 1].map((s) => <path key={s} d={`M${s * 28} 12 Q${s * (52 - claw * 0 - (1 - claw) * 0)} ${44 + 10 * (1 - lift)} ${s * (20 + 16 * lift)} 78`} fill="none" stroke={c.accent} strokeWidth={10} strokeLinecap="round" />)}
          </g>
        </g>
        {/* stamp */}
        <g transform={`translate(540 700) rotate(-9) scale(${lerp(2.6, 1, stamp)})`} opacity={stamp * (1 - r.prog(endAt - 0.15, 0.3, 'exit'))}>
          <rect x={-380} y={-130} width={760} height={260} rx={26} fill={withAlpha(c.background, 0.55)} stroke={c.accent} strokeWidth={10} filter="url(#fn-glow)" />
        </g>
      </FullSvg>
      <AbsoluteFill style={{opacity: stamp * (1 - r.prog(endAt - 0.15, 0.3, 'exit')), transform: `rotate(-9deg) scale(${lerp(2.6, 1, stamp)})`, transformOrigin: '540px 700px'}}>
        <SpecText shot={shot} reel={r} name="stamp" at={stampAt} mode="line" color={c.accent} />
      </AbsoluteFill>
      <SpecText shot={shot} reel={r} name="job" at={raceAt} exitAt={grabAt + 0.4} mode="line" color={c.text} />
      <div style={{position: 'absolute', inset: 0, opacity: endAlpha}}>
        <SpecText shot={shot} reel={r} name="end" at={endAt} mode="word" color={c.text} />
      </div>
    </Stage>
  );
};
