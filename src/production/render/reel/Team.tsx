import {withAlpha} from '../../../motion/style';
import type {ShotProps} from '../types';
import {Chip, FullSvg, SpecText, Stage, lerp, pop, useReel} from './kit';

const COLS = 4;
const AVATARS = Array.from({length: 12}, (_, i) => ({x: 540 + ((i % COLS) - 1.5) * 200, y: 540 + Math.floor(i / COLS) * 175, designer: (i + Math.floor(i / COLS)) % 2 === 0}));
const CORE = {x: 540, y: 715};

// "Tools that needed whole teams (designers, programmers) - AI does it all in very little time."
export const ReelTeam: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {t, colors: c} = r;
  const teamAt = r.cue('team', 0.5);
  const designersAt = r.cue('designers', 4.6);
  const devsAt = r.cue('devs', 7.6);
  const collapseAt = r.cue('collapse', 11.5);
  const raceAt = r.cue('race', 14.7);

  const collapse = r.prog(collapseAt, 0.9, 'standard');
  const core = r.prog(collapseAt + 0.55, 0.7);
  const shock = r.lin(collapseAt + 0.8, 1.1);
  const race = r.lin(raceAt, 3.6);

  return (
    <Stage reel={r}>
      <FullSvg glowId="tm-glow">
        {AVATARS.map((a, i) => {
          const show = pop(r.prog(teamAt + i * 0.2, 0.55));
          const x = lerp(a.x, CORE.x, collapse);
          const y = lerp(a.y, CORE.y, collapse);
          const scale = show * lerp(1, 0.25, collapse);
          return (
            <g key={i} transform={`translate(${x} ${y}) scale(${scale})`} opacity={1 - Math.max(0, collapse - 0.8) * 5}>
              <circle r={58} fill={c.surface} stroke={a.designer ? c.primary : c.secondary} strokeWidth={4} filter="url(#tm-glow)" />
              {a.designer ? (
                <path d="M-22 22 L-8 -22 L8 -22 L22 22 Z M-8 -22 L0 -34 L8 -22" fill="none" stroke={c.primary} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
              ) : (
                <g fill="none" stroke={c.text} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M-12 -20 L-30 0 L-12 20" />
                  <path d="M12 -20 L30 0 L12 20" />
                  <path d="M5 -26 L-5 26" stroke={c.accent} />
                </g>
              )}
            </g>
          );
        })}
        {/* the AI core */}
        <g transform={`translate(${CORE.x} ${CORE.y})`}>
          <circle r={440 * shock} fill="none" stroke={withAlpha(c.accent, 0.7 * (1 - shock))} strokeWidth={6} />
          <circle r={150 * pop(core)} fill={withAlpha(c.accent, 0.14)} stroke={c.accent} strokeWidth={6} filter="url(#tm-glow)" opacity={core} />
          <circle r={118 * pop(core)} fill={c.accent} opacity={core} filter="url(#tm-glow)" />
          <text y={34} textAnchor="middle" fontSize={96} fontWeight={700} fill="#fff" fontFamily={r.fonts.display} opacity={core}>AI</text>
          <g transform={`rotate(${t * 60})`} opacity={core}>
            <circle cx={190} r={9} fill={c.primary} filter="url(#tm-glow)" />
          </g>
        </g>
        {/* speed race */}
        <g opacity={r.prog(raceAt - 0.1, 0.4)}>
          {[1110, 1190].map((y, i) => (
            <rect key={y} x={420} y={y - 15} width={560} height={30} rx={15} fill={withAlpha(i === 0 ? c.primary : c.accent, 0.14)} stroke={withAlpha(i === 0 ? c.primary : c.accent, 0.5)} strokeWidth={2} />
          ))}
          <rect x={420} y={1095} width={560 * 0.2 * race} height={30} rx={15} fill={c.primary} />
          <rect x={420} y={1175} width={560 * r.prog(raceAt + 0.15, 0.45, 'standard')} height={30} rx={15} fill={c.accent} filter="url(#tm-glow)" />
          {[0, 1, 2, 3].map((k) => (
            <rect key={k} x={420 + ((t * 700 + k * 190) % 560)} y={1180} width={50} height={4} fill={withAlpha('#ffffff', 0.7)} opacity={r.prog(raceAt + 0.7, 0.3) * (1 - r.prog(raceAt + 1.3, 0.3))} />
          ))}
        </g>
      </FullSvg>
      <SpecText shot={shot} reel={r} name="head" at={r.cue('head', 0.15)} mode="word" />
      <SpecText shot={shot} reel={r} name="designers" at={designersAt} exitAt={collapseAt - 0.2} mode="line" color={c.primary} />
      <SpecText shot={shot} reel={r} name="devs" at={devsAt} exitAt={collapseAt - 0.2} mode="line" color={c.text} />
      <Chip reel={r} x={100} y={1078} w={290} h={64} label={String(shot.engineOptions?.teamLabel ?? 'فريق')} color={c.primary} size={34} opacity={r.prog(raceAt, 0.4)} />
      <Chip reel={r} x={100} y={1158} w={290} h={64} label="AI" color={c.accent} size={34} opacity={r.prog(raceAt, 0.4)} glow />
    </Stage>
  );
};
