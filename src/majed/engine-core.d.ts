// Types for the generated engine-core.js (see scripts/derive_majed_engine.py). The upstream helpers are untyped by nature.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type EngineState = {
  P: Record<string, string>;
  fps: number;
  spb: number;
  bpb: number;
  bpm: number;
  beats: number[];
  bars: number[];
  tl: {sections?: Array<{name: string; start: number; end: number}>};
  vo: Record<string, any>;
  voList: any[];
};
export type EngineCore = Record<string, any> & {setFamilies: (families: Record<string, string>) => void; FAMS: Record<string, string>};
export function createEngineCore(state: EngineState): EngineCore;
