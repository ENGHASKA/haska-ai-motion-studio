import {withAlpha} from '../../../motion/style';
import type {ShotProps} from '../types';
import {FullSvg, SpecText, Stage, pop, useReel} from './kit';

type Item = {label: string; at: number};

// Cards for fields ("every specialty, even medicine") or jobs ("replaces many jobs"). `mode` picks the gag:
// fields -> an AI badge lands on each card; jobs -> each card flips to an AI card.
export const ReelSpread: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {t, colors: c, style} = r;
  const mode = r.option<string>('mode', 'fields');
  const items = r.option<Item[]>('items', []);
  const emphasis = r.option<number>('emphasis', -1);
  const cols = 2;
  const rows = Math.ceil(items.length / cols);
  const cell = {w: 440, h: items.length > 4 ? 164 : 190, gx: 40, gy: items.length > 4 ? 34 : 44};
  const top = 810 - (rows * cell.h + (rows - 1) * cell.gy) / 2; // centred in the free window, below the headline
  const pos = (i: number) => ({x: 540 - cell.w - cell.gx / 2 + (i % cols) * (cell.w + cell.gx), y: top + Math.floor(i / cols) * (cell.h + cell.gy)});
  const arabic = style.typography.arabic?.family ?? 'DejaVu Sans';

  return (
    <Stage reel={r}>
      <FullSvg glowId="sp-glow">
        {items.map((item, i) => {
          const p = pos(i);
          const enter = pop(r.prog(0.2 + i * 0.12, 0.6));
          const hit = r.prog(item.at, mode === 'jobs' ? 0.55 : 0.5, 'standard');
          const flip = mode === 'jobs' ? hit : 0;
          const width = cell.w * Math.abs(Math.cos(flip * Math.PI));
          const back = flip > 0.5;
          const emphatic = i === emphasis;
          return (
            <g key={i} transform={`translate(${p.x + cell.w / 2} ${p.y + cell.h / 2}) scale(${enter})`} opacity={Math.min(1, enter)}>
              <rect x={-width / 2} y={-cell.h / 2} width={width} height={cell.h} rx={28} fill={back ? withAlpha(c.accent, 0.2) : withAlpha(c.surface, 0.8)} stroke={back ? c.accent : c.primary} strokeWidth={4} filter={back || (mode === 'fields' && hit > 0.5) ? 'url(#sp-glow)' : undefined} />
              {mode === 'fields' && hit > 0 ? (
                <g transform={`translate(${cell.w / 2 - 36} ${-cell.h / 2 + 8}) scale(${pop(hit)})`}>
                  <circle r={40} fill={c.accent} filter="url(#sp-glow)" />
                  <text y={13} textAnchor="middle" fontSize={34} fontWeight={700} fill="#fff" fontFamily={r.fonts.display}>AI</text>
                </g>
              ) : null}
              {back && width > 20 ? <text y={30} textAnchor="middle" fontSize={92} fontWeight={700} fill={c.accent} fontFamily={r.fonts.display} transform={`scale(${width / cell.w} 1)`}>AI</text> : null}
              {emphatic && hit > 0 ? <circle r={150 * (0.5 + hit * 0.8)} fill="none" stroke={withAlpha(c.accent, 0.55 * (1 - hit))} strokeWidth={5} /> : null}
              {emphatic && !back ? (
                <g transform={`translate(${-cell.w / 2 + 60} 0) scale(${1 + 0.06 * Math.sin(t * 6)})`} opacity={r.prog(item.at - 0.3, 0.4)}>
                  <path d="M-14 -40 H14 V-14 H40 V14 H14 V40 H-14 V14 H-40 V-14 H-14 Z" fill={withAlpha(c.primary, 0.2)} stroke={c.primary} strokeWidth={4} strokeLinejoin="round" />
                </g>
              ) : null}
            </g>
          );
        })}
      </FullSvg>
      <SpecText shot={shot} reel={r} name="head" at={r.cue('head', 0.15)} mode="word" />
      {items.map((item, i) => {
        const p = pos(i);
        const flip = mode === 'jobs' ? r.prog(item.at, 0.55, 'standard') : 0;
        const latin = /^[\x00-\x7F]+$/.test(item.label);
        return (
          <div
            key={i}
            dir={latin ? 'ltr' : 'rtl'}
            style={{
              position: 'absolute', left: p.x, top: p.y, width: cell.w, height: cell.h, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: latin ? style.typography.display.family : `${arabic}, sans-serif`, fontWeight: 700, fontSize: latin ? 50 : 56,
              color: c.text, opacity: r.prog(0.45 + i * 0.12, 0.4) * (flip > 0.5 ? 0 : 1), transform: `scaleX(${Math.abs(Math.cos(flip * Math.PI))})`,
            }}
          >
            {item.label}
          </div>
        );
      })}
    </Stage>
  );
};
