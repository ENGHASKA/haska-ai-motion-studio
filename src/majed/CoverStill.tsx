import {AbsoluteFill, Img, staticFile} from 'remotion';
import {ProductionProvider} from '../motion';
import {familyFor, textStyle} from '../motion/style';
import {HASKA_ORANGE_TECH} from '../production/style-profile';
import {FontGate} from '../typography/FontGate';
import {fitText} from '../typography/fit';
import {defaultMeasurer} from '../typography/measure';
import {hasArabic, textDirection} from '../typography/script';
import {COVER_SPECS, REEL_SAFE_SQUARE, YOUTUBE_BADGE_ZONE, checkCover} from './cover-rules';
import type {CoverBox, CoverKind} from './cover-rules';

export type CoverStillProps = {
  kind: CoverKind;
  title: string;
  subtitle?: string;
  /** Optional background image under public/. */
  imageSrc?: string;
  /** Draw the safe-square / badge-zone guides (never in a final render). */
  guides?: boolean;
  /** Log rule violations to the browser console (used by QA). */
  report?: boolean;
};

/** Layout shared by the render and by QA, so what is checked is exactly what is drawn. */
export const coverLayout = (props: Pick<CoverStillProps, 'kind' | 'title' | 'subtitle'>) => {
  const spec = COVER_SPECS[props.kind];
  const area = props.kind === 'reel-cover' ? {x: 90, y: REEL_SAFE_SQUARE.y + 90, width: 900, height: REEL_SAFE_SQUARE.height - 180} : {x: 70, y: 70, width: spec.width - 140 - YOUTUBE_BADGE_ZONE.width * 0.2, height: spec.height - 140 - YOUTUBE_BADGE_ZONE.height};
  const language = hasArabic(props.title) ? 'ar' : 'en';
  const fonts = {latin: familyFor(HASKA_ORANGE_TECH, 'display', 'latin'), arabic: familyFor(HASKA_ORANGE_TECH, 'display', 'arabic'), weight: 800};
  const subtitleHeight = props.subtitle ? 150 : 0;
  const title = fitText({text: props.title, maxWidth: area.width, maxHeight: area.height - subtitleHeight, maxLines: 3, fontSize: props.kind === 'reel-cover' ? 230 : 200, minFontSize: 170, lineHeight: 1.12, fonts, measure: defaultMeasurer()});
  const boxes: CoverBox[] = [{role: 'title', x: area.x, y: area.y, width: area.width, height: title.height, size: title.fontSize}];
  if (props.subtitle) boxes.push({role: 'text', x: area.x, y: area.y + title.height + 30, width: area.width, height: 120, size: 110});
  return {spec, area, title, boxes, language, direction: textDirection(props.title, language), issues: checkCover(spec, boxes)};
};

export const CoverStill: React.FC<CoverStillProps> = ({kind, title, subtitle, imageSrc, guides, report}) => {
  const layout = coverLayout({kind, title, subtitle});
  const style = HASKA_ORANGE_TECH;
  if (report) {
    // eslint-disable-next-line no-console
    console.log(`[cover-result] ${JSON.stringify({fontSize: layout.title.fontSize, fits: layout.title.fits, issues: layout.issues})}`);
  }
  return (
    <ProductionProvider style={style} platformId={kind === 'reel-cover' ? 'reel' : 'youtube'} language={layout.language}>
      <FontGate>
        <AbsoluteFill style={{background: `radial-gradient(120% 80% at 70% 20%, ${style.palette.surface}, ${style.palette.background})`}}>
          {imageSrc ? <Img src={staticFile(imageSrc)} style={{width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55}} /> : null}
          <div dir={layout.direction} style={{position: 'absolute', left: layout.area.x, top: layout.area.y, width: layout.area.width, ...textStyle(style, 'display', layout.language === 'ar' ? 'arabic' : 'latin', layout.title.fontSize), lineHeight: 1.12, color: style.palette.text, fontWeight: 800}}>
            {layout.title.lines.map((line, i) => <div key={i}>{line}</div>)}
          </div>
          {subtitle ? <div dir="auto" style={{position: 'absolute', left: layout.area.x, top: layout.area.y + layout.title.height + 30, width: layout.area.width, ...textStyle(style, 'body', hasArabic(subtitle) ? 'arabic' : 'latin', 110), color: style.palette.primary}}>{subtitle}</div> : null}
          {guides && kind === 'reel-cover' ? <div style={{position: 'absolute', ...REEL_SAFE_SQUARE, outline: `6px dashed ${style.palette.accent}`}} /> : null}
          {guides && kind === 'youtube' ? <div style={{position: 'absolute', right: 0, bottom: 0, ...YOUTUBE_BADGE_ZONE, outline: `6px dashed ${style.palette.accent}`}} /> : null}
        </AbsoluteFill>
      </FontGate>
    </ProductionProvider>
  );
};
