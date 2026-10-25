import {withAlpha} from '../../../motion/style';
import type {ShotProps} from '../types';
import {Chip, FullSvg, SpecText, Stage, pop, useReel} from './kit';

// "...and the question: can AI, these days, replace even experience?"
export const ReelQuestion: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {t, colors: c} = r;
  const qAt = r.cue('question', 1.0);
  const aiAt = r.cue('ai', 3.4);
  const expAt = r.cue('experience', 5.2);
  const q = r.prog(qAt, 0.9);
  const tug = r.prog(expAt + 0.6, 1.2, 'standard');
  const wobble = Math.sin(t * 7) * 6 * tug;

  return (
    <Stage reel={r}>
      <FullSvg glowId="qs-glow">
        <g transform={`translate(540 820) scale(${0.6 + 0.4 * pop(q)})`} opacity={q}>
          <circle r={250} fill="none" stroke={withAlpha(c.primary, 0.35)} strokeWidth={2} strokeDasharray="4 14" transform={`rotate(${t * 12})`} />
          <circle r={330} fill="none" stroke={withAlpha(c.accent, 0.6)} strokeWidth={4} strokeDasharray="240 1834" transform={`rotate(${-t * 34})`} filter="url(#qs-glow)" />
          <text y={150} textAnchor="middle" fontSize={440} fontWeight={700} fill={c.accent} fontFamily={r.fonts.display} filter="url(#qs-glow)">?</text>
        </g>
        {/* the swap arrow between the two contenders */}
        <g transform={`translate(540 1130)`} opacity={r.prog(expAt, 0.5)}>
          <path d="M-52 -14 H46 M30 -34 L52 -14 L30 6 M52 18 H-46 M-30 -2 L-52 18 L-30 38" fill="none" stroke={c.text} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${wobble} 0)`} />
        </g>
      </FullSvg>
      <SpecText shot={shot} reel={r} name="head" at={r.cue('head', 0.15)} mode="word" />
      <Chip reel={r} x={70} y={1078} w={330} h={104} label="AI" color={c.accent} size={52} opacity={r.prog(aiAt, 0.5)} scale={0.85 + 0.15 * pop(r.prog(aiAt, 0.5))} glow />
      <Chip reel={r} x={680} y={1078} w={330} h={104} label={String(shot.engineOptions?.experience ?? 'الخبرات')} color={c.primary} size={52} opacity={r.prog(expAt, 0.5)} scale={0.85 + 0.15 * pop(r.prog(expAt, 0.5))} glow />
    </Stage>
  );
};
