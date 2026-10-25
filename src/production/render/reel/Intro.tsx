import {AbsoluteFill} from 'remotion';
import {Reveal} from '../../../motion';
import {withAlpha} from '../../../motion/style';
import type {ShotProps} from '../types';
import {FullSvg, SpecText, Stage, lerp, pop, useReel} from './kit';

// "Hello, this is <name>, a <field> student at <university>, now in the graduation year."
// Cues (seconds from scene start): name, role, badge.
export const ReelIntro: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {t, colors: c} = r;
  const nameAt = r.cue('name', 1.1);
  const roleAt = r.cue('role', 7.0);
  const badgeAt = r.cue('badge', 9.8);

  const ringIn = r.prog(0, 1.3);
  const sweep = r.lin(0, 1.0); // opening hook: an orange scan line crosses the whole frame in the first second
  const cap = r.prog(badgeAt, 1.0, 'standard');

  return (
    <Stage reel={r}>
      <FullSvg glowId="in-glow">
        <g transform={`translate(540 720) scale(${0.55 + 0.45 * ringIn})`} opacity={ringIn}>
          <circle r={300} fill="none" stroke={withAlpha(c.primary, 0.5)} strokeWidth={2} strokeDasharray="3 16" transform={`rotate(${t * 9})`} />
          <circle r={420} fill="none" stroke={withAlpha(c.secondary ?? c.primary, 0.55)} strokeWidth={2} />
          <circle r={420} fill="none" stroke={c.accent} strokeWidth={5} strokeLinecap="round" strokeDasharray="330 2308" transform={`rotate(${t * 28 - 60})`} filter="url(#in-glow)" />
          <circle r={520} fill="none" stroke={withAlpha(c.primary, 0.18)} strokeWidth={1.5} strokeDasharray="30 22" transform={`rotate(${-t * 6})`} />
          <circle r={188} fill={withAlpha(c.surface, 0.55)} stroke={withAlpha(c.primary, 0.35)} strokeWidth={2} />
        </g>
        {/* first-second hook: scan line + flash */}
        <g opacity={sweep < 1 ? 1 - sweep * 0.6 : 0}>
          <rect x={0} y={lerp(0, H_SWEEP, sweep) - 3} width={1080} height={6} fill={c.accent} filter="url(#in-glow)" />
          <rect x={0} y={lerp(0, H_SWEEP, sweep) - 120} width={1080} height={120} fill={`url(#in-trail)`} />
        </g>
        <defs>
          <linearGradient id="in-trail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.accent} stopOpacity="0" />
            <stop offset="1" stopColor={c.accent} stopOpacity="0.28" />
          </linearGradient>
        </defs>
        {/* graduation cap, drawn on at the badge cue */}
        <g transform="translate(540 1012) scale(0.8)" opacity={cap} filter="url(#in-glow)">
          <path d="M-100 0 L0 -52 L100 0 L0 52 Z" fill="none" stroke={c.accent} strokeWidth={6} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - cap} />
          <path d="M-62 28 V76 Q0 112 62 76 V28" fill="none" stroke={c.accent} strokeWidth={6} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - r.lin(badgeAt + 0.2, 0.9)} />
          <path d="M100 0 V64" fill="none" stroke={c.primary} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - r.lin(badgeAt + 0.5, 0.6)} />
          <circle cx={100} cy={72} r={9 * pop(r.lin(badgeAt + 0.9, 0.4))} fill={c.primary} />
        </g>
      </FullSvg>

      {/* first-frame punch: an orange bloom that decays, a zoom-out landing, and a cyan echo that peels away */}
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 40%, ${withAlpha(c.accent, 0.5 * (1 - r.lin(0, 0.6)))} 0%, transparent 55%)`, pointerEvents: 'none'}} />
      <SpecText shot={shot} reel={r} name="hello" at={-0.18} exitAt={nameAt - 0.1} mode="word" color={c.primary} style={{opacity: 0.55 * (1 - r.lin(0, 0.7)), transform: `translateX(${-14 * (1 - r.lin(0, 0.7))}px) scale(${1.32 - 0.32 * r.prog(0, 0.9)})`}} />
      <SpecText shot={shot} reel={r} name="hello" at={-0.18} exitAt={nameAt - 0.1} mode="word" color={c.accent} style={{transform: `scale(${1.32 - 0.32 * r.prog(0, 0.9)})`}} />
      <SpecText shot={shot} reel={r} name="eyebrow" at={nameAt - 0.2} mode="line" color={c.primary} />
      <SpecText shot={shot} reel={r} name="name" at={nameAt} mode="word" stagger={0.14} />
      {/* underline sweep under the name */}
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <Reveal start={r.sec(nameAt + 0.9)} clip style={{position: 'absolute', left: 340, top: 738, width: 400, height: 6, background: `linear-gradient(90deg, transparent, ${c.accent}, transparent)`}}>
          <div />
        </Reveal>
      </AbsoluteFill>
      <SpecText shot={shot} reel={r} name="role" at={roleAt} mode="line" color={c.primary} />
      <SpecText shot={shot} reel={r} name="place" at={roleAt + 0.5} mode="line" color={c.mutedText} />
      <SpecText shot={shot} reel={r} name="badge" at={badgeAt + 0.3} mode="line" color={c.accent} />
    </Stage>
  );
};

const H_SWEEP = 1920;
