// A generous option bag for previewing and smoke-testing moves. Upstream documents each move's parameters in
// comments only, so this superset (plus a few per-move overrides) is how the gallery drives all of them.
import type {MoveEntry} from './catalog';

type AnyRecord = Record<string, unknown>;

const DEMO_TEXT = 'الاستوديو يصنع فيديو جاهز للنشر';
const panel = (color: string, label: string) => (Y: CanvasRenderingContext2D) => {
  Y.fillStyle = color;
  Y.fillRect(0, 0, 1080, 1920);
  Y.fillStyle = 'rgba(255,255,255,0.9)';
  Y.font = '800 120px "IBM Plex Sans Arabic"';
  Y.textAlign = 'center';
  Y.fillText(label, 540, 980);
};

const BASE: AnyRecord = {
  s: 0.3,
  e: 2.6,
  out: 2.6,
  dur: 1.4,
  step: 0.3,
  text: DEMO_TEXT,
  title: 'عنوان تجريبي',
  sub: 'سطر فرعي قصير',
  label: 'ملصق',
  name: 'الاسم',
  value: 87,
  from: 0,
  to: 100,
  items: ['الأول', 'الثاني', 'الثالث'],
  labels: ['أ', 'ب', 'ج'],
  y: 960,
  x: 540,
  size: 120,
  A: panel('#12223f', 'المشهد أ'),
  B: panel('#7a2d0a', 'المشهد ب'),
};

/** A stand-in "scene" for camera moves, which transform whatever the caller draws. */
const scene = (Y: CanvasRenderingContext2D) => {
  const gradient = Y.createLinearGradient(0, 0, 0, 1920);
  gradient.addColorStop(0, '#0e1a33');
  gradient.addColorStop(1, '#1d3b73');
  Y.fillStyle = gradient;
  Y.fillRect(0, 0, 1080, 1920);
  Y.fillStyle = '#ff7a1a';
  Y.beginPath();
  Y.arc(540, 760, 210, 0, Math.PI * 2);
  Y.fill();
  Y.fillStyle = '#22d3ee';
  Y.fillRect(180, 1120, 720, 36);
  Y.fillStyle = '#f4f8ff';
  Y.font = '800 150px "IBM Plex Sans Arabic"';
  Y.textAlign = 'center';
  Y.fillText('مشهد تجريبي', 540, 1010);
};
const layerA = (Y: CanvasRenderingContext2D) => {
  Y.fillStyle = '#0e1a33';
  Y.fillRect(0, 0, 1080, 1920);
  Y.fillStyle = '#22d3ee';
  for (let i = 0; i < 7; i++) Y.fillRect(80 + i * 140, 300 + (i % 3) * 180, 90, 90);
};
const layerB = (Y: CanvasRenderingContext2D) => {
  Y.fillStyle = '#ff7a1a';
  Y.beginPath();
  Y.arc(540, 960, 180, 0, Math.PI * 2);
  Y.fill();
};

const OVERRIDES: Record<string, AnyRecord> = {
  wordSwap: {lead: 'الاستوديو', words: ['يصنع', 'يقص', 'يركّب'], every: 0.9},
  pushIn: {draw: scene}, pullOut: {draw: scene, from: 1.25}, shine: {draw: scene}, handheld: {draw: scene}, shake: {draw: scene},
  kenBurns: {draw: scene, from: [540, 960, 1], to: [640, 820, 1.25], dur: 2.4}, snapZoom: {draw: scene, back: 1.8},
  glassType: {draw: scene, text: 'الفكرة', sub: 'سطر قصير'},
  dotZoom: {dot: [540, 960], r: 30},
  rackFocus: {back: layerA, front: layerB, to: 'back'},
  dollyZoom: {back: layerA, front: layerB, dir: 'out'},
  parallax: {layers: [{draw: layerA, depth: 0.2}, {draw: layerB, depth: 0.8}]},
  wordPath: {words: ['الكلمة', 'تمشي', 'على', 'مسار'], every: 0.6},
  barChart: {data: [['أ', 40], ['ب', 72], ['ج', 55]], hi: 72},
  joinSnap: {text: 'الاستوديو', at: 1.2},
  pointerCursor: {draw: scene, steps: [{to: [540, 1120], at: 0.8, click: true}], targets: [{x: 540, y: 1120, w: 360, h: 110, label: 'اضغط'}]},
};

/** Options to drive `move` at a representative moment. */
export const demoOptions = (move: MoveEntry): AnyRecord => ({...BASE, ...(OVERRIDES[move.id] ?? {})});

/** Times (seconds) at which a move is sampled: early, mid-motion and settled. */
export const SAMPLE_TIMES = [0.5, 1.2, 2.4];
export {OVERRIDES};
