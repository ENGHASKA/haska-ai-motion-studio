import {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {useProduction} from '../motion';
import {easingOf, familyFor, textStyle, trackingFor, weightFor, withAlpha} from '../motion/style';
import {msToFrame} from '../production/timing';
import {fitText} from '../typography/fit';
import {defaultMeasurer} from '../typography/measure';
import {hasArabic, localizePunctuation, textDirection, tokenizeWords, wordScript} from '../typography/script';
import type {Transcript} from './types';

type Token = {text: string; startFrame: number; endFrame: number};

/**
 * Word-highlighted captions on the shared frame clock. Text is fitted to the platform safe area (never
 * overflows), RTL/Arabic uses word-level spans only, and highlight state is a pure function of the frame.
 */
export const CaptionOverlay: React.FC<{transcript: Transcript}> = ({transcript}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {style, platform, width, height} = useProduction();
  const vertical = height > width;

  const segment = transcript.segments.find((item) => {
    const from = msToFrame(item.startMs, fps);
    return frame >= from && frame < Math.max(from + 1, msToFrame(item.endMs, fps));
  });

  const prepared = useMemo(() => {
    if (!segment) return undefined;
    const source = segment.words.length ? segment.words : [{text: segment.text, startMs: segment.startMs, endMs: segment.endMs}];
    const tokens: Token[] = source.flatMap((word) => {
      const startFrame = msToFrame(word.startMs, fps);
      const endFrame = msToFrame(word.endMs, fps);
      return tokenizeWords(hasArabic(word.text) ? localizePunctuation(word.text) : word.text).map((piece) => ({text: piece, startFrame, endFrame}));
    });
    const joined = tokens.map((token) => token.text).join(' ');
    const direction = transcript.direction === 'rtl' || textDirection(joined, transcript.language) === 'rtl' ? 'rtl' : 'ltr';
    // Vertical: at most 820px, centred, so the pill clears the Instagram action column on the right.
    const boxWidth = Math.min(vertical ? 820 : 1260, width - platform.safeArea.left - platform.safeArea.right);
    const padding = 32;
    const fit = fitText({
      text: joined,
      maxWidth: boxWidth - padding * 2,
      maxHeight: 280,
      maxLines: 3,
      fontSize: vertical ? 58 : 48,
      minFontSize: 34,
      lineHeight: 1.32,
      fonts: {latin: familyFor(style, 'body', 'latin'), arabic: familyFor(style, 'body', 'arabic'), weight: 700, tracking: trackingFor(style, 'body', 'latin')},
      measure: defaultMeasurer(),
    });
    // Re-associate wrapped lines with their timed tokens, in order.
    let cursor = 0;
    const lines = fit.lines.map((line) => tokens.slice(cursor, (cursor += tokenizeWords(line).length)));
    return {direction, boxWidth, fit, lines, startFrame: msToFrame(segment.startMs, fps)};
  }, [segment, transcript.direction, fps, style, platform, width, vertical]);

  if (!segment || !prepared) return null;

  const enter = easingOf(style, 'enter')(Math.min(1, Math.max(0, (frame - prepared.startFrame) / Math.max(1, Math.round(fps * 0.18)))));
  const {direction, fit, lines} = prepared;

  return (
    <div
      className="audio-captions"
      dir={direction}
      lang={direction === 'rtl' ? 'ar' : 'en'}
      data-fits={fit.fits ? 'true' : 'false'}
      style={{
        // Never lower than the original 92px, so the pill clears the waveform on 16:9.
        bottom: Math.max(platform.safeArea.bottom, 92),
        width: prepared.boxWidth,
        opacity: enter,
        background: withAlpha(style.palette.background, 0.74),
        border: `1px solid ${withAlpha(style.palette.primary, 0.28)}`,
        borderRadius: 30,
        padding: '16px 30px',
        translate: `-50% ${(1 - enter) * 24}px`,
        flexDirection: 'column',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 0,
        fontSize: fit.fontSize,
        lineHeight: 1.32,
      }}
    >
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} style={{display: 'flex', gap: '0.3em', whiteSpace: 'nowrap', justifyContent: 'center'}}>
          {line.map((token, index) => {
            const active = frame >= token.startFrame && frame < token.endFrame;
            const spoken = frame >= token.endFrame;
            const script = wordScript(token.text);
            return (
              <span
                key={`${token.startFrame}-${index}`}
                style={{
                  ...textStyle(style, 'body', script, fit.fontSize),
                  fontWeight: weightFor(style, 'body', script) >= 700 ? 750 : 600,
                  color: active ? style.palette.accent : spoken ? style.palette.text : style.palette.mutedText,
                  textShadow: active ? `0 0 22px ${withAlpha(style.palette.accent, 0.55)}` : '0 2px 10px rgba(0,0,0,0.6)',
                  scale: active ? 1.06 : 1,
                  opacity: spoken || active ? 1 : 0.68,
                  unicodeBidi: 'isolate',
                }}
              >
                {token.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
