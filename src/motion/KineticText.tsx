import {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {fitText} from '../typography/fit';
import {planKinetic, unitProgress} from '../typography/kinetic';
import type {KineticMode} from '../typography/kinetic';
import {defaultMeasurer} from '../typography/measure';
import {hasArabic, localizePunctuation, normalizeDigits, textDirection, tokenizePhrases, tokenizeWords, wordScript} from '../typography/script';
import type {DigitStyle} from '../typography/script';
import {useProduction} from './context';
import {durationFrames, easingOf, familyFor, textStyle, trackingFor, weightFor} from './style';
import type {TextRole} from './style';

export type KineticTextProps = {
  text: string;
  role?: TextRole;
  /** Local frame at which the first unit starts arriving. */
  start?: number;
  /** Local frame at which everything fades out together; omit to stay. */
  exitAt?: number;
  mode?: KineticMode;
  /** Frames between consecutive units. */
  staggerFrames?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxLines?: number;
  fontSize?: number;
  minFontSize?: number;
  lineHeight?: number;
  align?: 'start' | 'center' | 'end';
  color?: string;
  digits?: DigitStyle;
  style?: React.CSSProperties;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Arabic/English kinetic typography. Text is fitted to its box first (never overflows), then animated by
 * word, phrase or line. Arabic is never split below the word, so letters keep their joined shapes, and letter
 * spacing is never applied to it.
 */
export const KineticText: React.FC<KineticTextProps> = ({
  text,
  role = 'display',
  start = 0,
  exitAt,
  mode = 'word',
  staggerFrames = 3,
  maxWidth,
  maxHeight,
  maxLines = 3,
  fontSize = 96,
  minFontSize = 28,
  lineHeight = 1.18,
  align = 'start',
  color,
  digits = 'keep',
  style,
}) => {
  const frame = useCurrentFrame();
  const {style: profile, box, fps, language} = useProduction();

  const prepared = useMemo(() => {
    const direction = textDirection(text, language);
    const normalized = normalizeDigits(hasArabic(text) ? localizePunctuation(text) : text, digits);
    const fit = fitText({
      text: normalized,
      maxWidth: maxWidth ?? box.width,
      maxHeight: maxHeight ?? box.height,
      maxLines,
      fontSize,
      minFontSize,
      lineHeight,
      fonts: {
        latin: familyFor(profile, role, 'latin'),
        arabic: familyFor(profile, role, 'arabic'),
        weight: weightFor(profile, role, 'latin'),
        tracking: trackingFor(profile, role, 'latin'),
      },
      measure: defaultMeasurer(),
    });
    return {direction, normalized, fit, plan: planKinetic(normalized, mode, staggerFrames)};
  }, [text, language, digits, maxWidth, maxHeight, box.width, box.height, maxLines, fontSize, minFontSize, lineHeight, profile, role, mode, staggerFrames]);

  const {direction, fit, plan, normalized} = prepared;
  const unitFrames = durationFrames(profile, 'standard', fps);
  const enter = easingOf(profile, 'enter');
  const exit = exitAt === undefined ? 0 : easingOf(profile, 'exit')(clamp01((frame - exitAt) / durationFrames(profile, 'quick', fps)));

  // Which animation unit does each word / character belong to?
  const phraseOfWord: number[] = [];
  if (plan.mode === 'phrase') {
    tokenizePhrases(normalized).forEach((phrase, index) => tokenizeWords(phrase).forEach(() => phraseOfWord.push(index)));
  }

  let wordCounter = 0;
  let charCounter = 0;
  const unitStyle = (unit: number): React.CSSProperties => {
    const progress = unitProgress(frame, start + (plan.starts[unit] ?? unit * staggerFrames), unitFrames, enter);
    return {
      display: 'inline-block',
      opacity: progress * (1 - exit),
      transform: `translateY(${(1 - progress) * 0.32}em) scale(${0.96 + 0.04 * progress})`,
      transformOrigin: direction === 'rtl' ? '100% 100%' : '0% 100%',
      willChange: 'transform, opacity',
    };
  };

  return (
    <div
      dir={direction}
      lang={direction === 'rtl' ? 'ar' : 'en'}
      data-kinetic={plan.mode}
      data-fits={fit.fits ? 'true' : 'false'}
      style={{
        width: maxWidth ?? box.width,
        color: color ?? profile.palette.text,
        lineHeight,
        fontSize: fit.fontSize,
        ...style,
      }}
    >
      {fit.lines.map((line, lineIndex) => (
        <div
          key={lineIndex}
          style={{display: 'flex', flexWrap: 'nowrap', gap: '0.3em', whiteSpace: 'nowrap', justifyContent: align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start'}}
        >
          {tokenizeWords(line).map((word, wordIndex) => {
            const script = wordScript(word);
            const wordStyle = textStyle(profile, role, script, fit.fontSize);
            const unit = plan.mode === 'phrase' ? (phraseOfWord[wordCounter] ?? 0) : plan.mode === 'line' ? lineIndex : wordCounter;
            wordCounter += 1;
            if (plan.mode === 'char') {
              return (
                <span key={wordIndex} style={{...wordStyle, display: 'inline-flex'}}>
                  {[...word].map((char, charIndex) => (
                    <span key={charIndex} style={unitStyle(charCounter++)}>{char}</span>
                  ))}
                </span>
              );
            }
            return (
              <span key={wordIndex} style={{...wordStyle, ...unitStyle(unit), unicodeBidi: 'isolate'}}>
                {word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
