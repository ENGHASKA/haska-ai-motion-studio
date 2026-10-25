import {withAlpha} from '../../../motion/style';
import type {ShotProps} from '../types';
import {Chip, FullSvg, SpecText, Stage, lerp, pop, rand, useReel} from './kit';

const LAYERS = [4, 6, 6, 3];
const LAYER_Y = [560, 760, 960, 1140];

const nodePos = (layer: number, index: number) => {
  const count = LAYERS[layer];
  const span = layer === 0 || layer === 3 ? 560 : 800;
  return {x: 540 + (index - (count - 1) / 2) * (span / Math.max(1, count - 1)), y: LAYER_Y[layer]};
};

const EDGES = (() => {
  const edges: Array<{a: {x: number; y: number}; b: {x: number; y: number}; layer: number}> = [];
  for (let l = 0; l < LAYERS.length - 1; l++) for (let i = 0; i < LAYERS[l]; i++) for (let j = 0; j < LAYERS[l + 1]; j++) edges.push({a: nodePos(l, i), b: nodePos(l + 1, j), layer: l});
  return edges;
})();

const CURVE = Array.from({length: 61}, (_, i) => {
  const u = i / 60;
  return {x: lerp(110, 960, u), y: lerp(1180, 600, (Math.exp(3.4 * u) - 1) / (Math.exp(3.4) - 1))};
});

// "...the first video built with Claude's skills, and the progress AI has reached is unreal."
export const ReelNeural: React.FC<ShotProps> = ({shot}) => {
  const r = useReel(shot);
  const {t, colors: c} = r;
  const claudeAt = r.cue('claude', 2.9);
  const curveAt = r.cue('curve', 8.2);
  const dim = 1 - 0.65 * r.prog(curveAt - 0.2, 0.8, 'standard');
  const curveP = r.lin(curveAt, 2.6);
  const claude = r.prog(claudeAt, 0.9);
  const cNode = nodePos(2, 2);
  const head = CURVE[Math.min(60, Math.floor(curveP * 60))];

  return (
    <Stage reel={r}>
      <FullSvg glowId="nn-glow">
        <g opacity={dim}>
          {EDGES.map((e, i) => {
            const draw = r.prog(0.2 + e.layer * 0.7 + rand(i) * 0.3, 0.8);
            return <line key={i} x1={e.a.x} y1={e.a.y} x2={lerp(e.a.x, e.b.x, draw)} y2={lerp(e.a.y, e.b.y, draw)} stroke={withAlpha(c.primary, 0.3)} strokeWidth={1.5} />;
          })}
          {/* signal pulses travelling layer to layer */}
          {Array.from({length: 16}, (_, k) => {
            const e = EDGES[Math.floor(rand(k + 7) * EDGES.length)];
            const phase = (t * 0.55 + rand(k + 30)) % 1;
            const on = r.prog(1.6, 0.5) * (phase < 0.9 ? 1 : 0);
            const x = lerp(e.a.x, e.b.x, phase);
            const y = lerp(e.a.y, e.b.y, phase);
            return (
              <g key={k} opacity={on}>
                <circle cx={x} cy={y} r={16} fill={withAlpha(c.accent, 0.22)} />
                <circle cx={x} cy={y} r={5.5} fill={c.accent} filter="url(#nn-glow)" />
              </g>
            );
          })}
          {LAYERS.map((count, l) => Array.from({length: count}, (_, i) => {
            const p = nodePos(l, i);
            const show = pop(r.prog(0.1 + l * 0.55 + i * 0.07, 0.6));
            const isClaude = l === 2 && i === 2;
            return <circle key={`${l}-${i}`} cx={p.x} cy={p.y} r={(isClaude ? 0 : 17) * show} fill={c.surface} stroke={c.primary} strokeWidth={3} filter="url(#nn-glow)" />;
          }))}
        </g>
        {/* the Claude node */}
        <g transform={`translate(${cNode.x} ${cNode.y})`} opacity={claude * dim + (1 - dim) * 0.25}>
          <circle r={130 * claude} fill="none" stroke={withAlpha(c.accent, 0.5 * (1 - claude))} strokeWidth={4} />
          <circle r={64 * pop(claude)} fill={withAlpha(c.accent, 0.18)} stroke={c.accent} strokeWidth={5} filter="url(#nn-glow)" />
          <circle r={26 * pop(claude)} fill={c.accent} filter="url(#nn-glow)" />
          <g transform={`rotate(${t * 40})`}>
            <circle cx={96} cy={0} r={9} fill={c.primary} filter="url(#nn-glow)" />
            <circle cx={-96} cy={0} r={6} fill={c.primary} />
          </g>
        </g>
        {/* growth curve: steeper and steeper */}
        <g opacity={r.prog(curveAt - 0.1, 0.4)}>
          <line x1={110} y1={1180} x2={980} y2={1180} stroke={withAlpha(c.primary, 0.35)} strokeWidth={2} />
          <polyline fill="none" stroke={c.accent} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" filter="url(#nn-glow)" points={CURVE.slice(0, Math.max(2, Math.floor(curveP * 60) + 1)).map((p) => `${p.x},${p.y}`).join(' ')} />
          <circle cx={head.x} cy={head.y} r={16} fill="#fff" filter="url(#nn-glow)" />
          <circle cx={head.x} cy={head.y} r={34 + 14 * Math.sin(t * 9)} fill="none" stroke={withAlpha(c.accent, 0.5)} strokeWidth={3} />
        </g>
      </FullSvg>
      <SpecText shot={shot} reel={r} name="head" at={r.cue('head', 0.15)} mode="word" />
      <Chip reel={r} x={cNode.x - 105} y={cNode.y + 82} w={210} h={64} label="Claude" color={c.accent} size={36} opacity={claude * dim} glow />
      <Chip reel={r} x={cNode.x + 130} y={cNode.y - 32} w={170} h={56} label="Skills" color={c.primary} size={30} opacity={r.prog(claudeAt + 0.6, 0.6) * dim} />
      <SpecText shot={shot} reel={r} name="curve" at={curveAt + 0.2} mode="line" color={c.accent} />
    </Stage>
  );
};
