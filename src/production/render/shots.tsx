import {useMemo} from 'react';
import {AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CybersecurityIntro} from '../../scenes/CybersecurityIntro';
import {CyberGrid3D} from '../../scenes/CyberGrid3D';
import {NetworkTopology, buildTopology} from '../../components/NetworkTopology';
import {SemanticScene} from '../../audio/SemanticScene';
import {REEL_COMPONENTS} from './reel';
import {AnimatedBackground, CameraRig, KineticText, Reveal, useProduction} from '../../motion';
import {easeOutSoft, track} from '../../lib/motion';
import {paletteVariables} from '../../motion/style';
import {textDirection} from '../../typography/script';
import {blenderFramePath, validateBlenderManifest} from '../blender-shot';
import {networkBlocks, titleBlocks} from '../layout';
import {isTimeAlignedName, routeName} from '../routing';
import type {BuiltinShotComponent} from '../routing';
import type {Shot} from '../shot-graph';
import type {ShotProps} from './types';

const text = (shot: Shot) => shot.onScreenText ?? shot.title ?? '';
const option = <T,>(shot: Shot, key: string): T | undefined => shot.engineOptions?.[key] as T | undefined;

export const ErrorShot: React.FC<{shot: Shot; message: string}> = ({shot, message}) => (
  <AbsoluteFill style={{background: '#1a0508', color: '#ff9aa5', padding: 80, fontFamily: 'DejaVu Sans Mono, monospace', fontSize: 28, justifyContent: 'center'}}>
    <div style={{fontWeight: 700, marginBottom: 16}}>SHOT "{shot.id}" CANNOT RENDER</div>
    <div>{message}</div>
  </AbsoluteFill>
);

/** Eyebrow + headline + subtitle on an animated background, fitted to the platform safe area. */
export const TitleShot: React.FC<ShotProps> = ({shot}) => {
  const {style, box, platform, width, height, language} = useProduction();
  const {durationInFrames} = useVideoConfig();
  const blocks = titleBlocks(shot, box, platform.titleScale);
  const rtl = textDirection(text(shot), language) === 'rtl';
  const centered = option<string>(shot, 'layout') === 'center';
  const align = centered ? 'center' : 'start';
  const [eyebrow, headline, subtitle] = [blocks.find((b) => b.key === 'eyebrow'), blocks.find((b) => b.key === 'headline')!, blocks.find((b) => b.key === 'subtitle')];

  return (
    <AbsoluteFill>
      {/* The camera moves only the background so text always stays inside the platform safe area. */}
      <CameraRig
        keys={[
          {frame: 0, x: width / 2, y: height / 2, scale: 1},
          {frame: durationInFrames, x: width / 2, y: height / 2, scale: 1.06, easing: 'standard'},
        ]}
      >
        <AnimatedBackground />
      </CameraRig>
      <>
        <div
          style={{
            position: 'absolute',
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: centered ? 'center' : 'flex-start',
            direction: rtl ? 'rtl' : 'ltr',
            gap: 28 * platform.titleScale,
          }}
        >
          {eyebrow ? (
            <KineticText text={eyebrow.text} role="mono" mode="line" start={2} fontSize={eyebrow.fontSize} minFontSize={eyebrow.minFontSize} maxLines={eyebrow.maxLines} maxHeight={eyebrow.rect.height} align={align} color={style.palette.accent} />
          ) : null}
          <KineticText text={headline.text} role="display" mode="word" staggerFrames={4} start={6} fontSize={headline.fontSize} minFontSize={headline.minFontSize} maxLines={headline.maxLines} maxHeight={headline.rect.height} align={align} />
          <Reveal start={14} clip style={{width: 180 * platform.titleScale, height: 4, background: style.palette.accent, alignSelf: centered ? 'center' : 'flex-start'}}>
            <div />
          </Reveal>
          {subtitle ? (
            <KineticText text={subtitle.text} role="body" mode="phrase" staggerFrames={8} start={18} fontSize={subtitle.fontSize} minFontSize={subtitle.minFontSize} maxLines={subtitle.maxLines} maxHeight={subtitle.rect.height} align={align} color={style.palette.mutedText} />
          ) : null}
        </div>
      </>
    </AbsoluteFill>
  );
};

const topology = buildTopology();

/** Animated network topology with the shot's text as a fitted caption. */
export const NetworkShot: React.FC<ShotProps> = ({shot}) => {
  const frame = useCurrentFrame();
  const {box, style} = useProduction();
  const caption = networkBlocks(shot, box)[0];
  const {durationInFrames} = useVideoConfig();
  const camera = {
    scale: track(frame, [[0, 0.86], [Math.max(2, durationInFrames), 1.04, easeOutSoft]]),
    x: 960,
    y: 540,
  };
  return (
    <AbsoluteFill>
      <AnimatedBackground />
      <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
        <NetworkTopology topology={topology} camera={camera} converge={0} opacity={1} packetStart={Math.round(durationInFrames * 0.3)} />
      </svg>
      <div style={{position: 'absolute', inset: 0, background: `linear-gradient(to top, ${style.palette.background} 6%, transparent 52%)`}} />
      <div style={{position: 'absolute', left: caption.rect.left, top: caption.rect.top, width: caption.rect.width, height: caption.rect.height}}>
        <KineticText text={caption.text} mode="word" start={8} fontSize={caption.fontSize} minFontSize={caption.minFontSize} maxLines={caption.maxLines} maxHeight={caption.rect.height} />
      </div>
    </AbsoluteFill>
  );
};

/** Renders a legacy Audio-to-Motion scene (visualKind) with the existing SemanticScene visuals. */
export const SemanticShot: React.FC<ShotProps> = ({shot, index}) => {
  const {style, width, height} = useProduction();
  const preset = height === width ? 'youtube' : height > width ? 'reel' : 'youtube';
  const scene = useMemo(
    () => ({
      id: shot.id,
      startMs: shot.legacy?.startMs ?? 0,
      endMs: shot.legacy?.endMs ?? 1,
      narration: shot.narration ?? '',
      onScreenText: text(shot),
      visualKind: shot.visualKind ?? ('editorial' as const),
      animation: shot.animation ?? shot.description,
      visualAssetRequirements: shot.legacy?.visualAssetRequirements ?? [],
      semanticRationale: shot.legacy?.semanticRationale ?? shot.description,
      status: shot.legacy?.status ?? ('draft' as const),
    }),
    [shot],
  );
  return (
    <AbsoluteFill className={`audio-explainer-shot audio-explainer--${preset}`} style={paletteVariables(style) as React.CSSProperties}>
      <SemanticScene scene={scene} index={index} />
    </AbsoluteFill>
  );
};

/** Shows a Blender-rendered PNG sequence on the master timeline. Missing frames show a clear placeholder. */
export const BlenderShot: React.FC<ShotProps> = ({shot, graph}) => {
  const frame = useCurrentFrame();
  const raw = option<unknown>(shot, 'blender');
  const manifest = useMemo(() => validateBlenderManifest(raw, {graph}), [raw, graph]);
  if (!manifest.ok) return <ErrorShot shot={shot} message={`Invalid Blender manifest: ${manifest.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`} />;
  const path = blenderFramePath(manifest.value, frame);
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Img
        src={staticFile(path.replace(/^public\//, ''))}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
        maxRetries={0}
        onError={() => undefined}
      />
    </AbsoluteFill>
  );
};

/** Wraps an existing time-based scene so it follows the master timeline (frame 0 = timeline frame 0). */
const timeAligned = (Scene: React.FC): React.FC<ShotProps> => ({shot}) => (
  <Sequence from={-shot.startFrame} layout="none">
    <Scene />
  </Sequence>
);

export type ShotComponentEntry = {component: React.FC<ShotProps>};

/** Compositions a shot may name; the type forces this map to match routing.ts. Add project scenes to `extra` too. */
export const SHOT_COMPONENTS: Record<BuiltinShotComponent, ShotComponentEntry> = {
  title: {component: TitleShot},
  network: {component: NetworkShot},
  semantic: {component: SemanticShot},
  CybersecurityIntro: {component: timeAligned(CybersecurityIntro)},
  CyberGrid3D: {component: timeAligned(CyberGrid3D)},
  'reel-intro': {component: REEL_COMPONENTS['reel-intro']},
  'reel-neural': {component: REEL_COMPONENTS['reel-neural']},
  'reel-team': {component: REEL_COMPONENTS['reel-team']},
  'reel-cyber3d': {component: REEL_COMPONENTS['reel-cyber3d']},
  'reel-spread': {component: REEL_COMPONENTS['reel-spread']},
  'reel-question': {component: REEL_COMPONENTS['reel-question']},
  'reel-human': {component: REEL_COMPONENTS['reel-human']},
  'reel-glitch': {component: REEL_COMPONENTS['reel-glitch']},
  'reel-finale': {component: REEL_COMPONENTS['reel-finale']},
};

export type Route = {entry?: ShotComponentEntry; error?: string};

export const routeShot = (shot: Shot): Route => {
  const route = routeName(shot);
  if (!route.name) return {error: route.error};
  return {entry: route.name === 'blender' ? {component: BlenderShot} : SHOT_COMPONENTS[route.name]};
};

export const isTimeAlignedShot = isTimeAlignedName;
