import assert from 'node:assert/strict';
import {join} from 'node:path';
import {test} from 'node:test';
const ROOT = process.env.HASKA_PROJECT_ROOT ?? process.cwd();
import {fitText} from '../../src/typography/fit.ts';
import {fontCoverage, missingGlyphs, parseCharset} from '../../src/typography/fontconfig.ts';
import {planKinetic, planDuration, unitProgress} from '../../src/typography/kinetic.ts';
import {estimateMeasurer} from '../../src/typography/measure.ts';
import {
  detectDirection, hasArabic, isolateForeignRuns, isRtlLanguage, localizePunctuation, normalizeDigits, splitScriptRuns,
  stripBidiControls, textDirection, tokenizePhrases, tokenizeWords, wordScript,
} from '../../src/typography/script.ts';

const FONTS = {latin: 'Liberation Sans', arabic: 'DejaVu Sans', weight: 700};

test('direction: first strong letter, language override, and mixed text', () => {
  assert.equal(detectDirection('Hello'), 'ltr');
  assert.equal(detectDirection('مرحبا'), 'rtl');
  assert.equal(detectDirection('123 !!'), 'ltr', 'neutral-only text falls back');
  assert.equal(detectDirection('123 مرحبا'), 'rtl', 'digits do not decide direction');
  // An Arabic video that starts with a Latin brand must stay right-to-left.
  assert.equal(detectDirection('LABAK: منصة التعلم الذكية'), 'ltr');
  assert.equal(textDirection('LABAK: منصة التعلم الذكية', 'ar'), 'rtl');
  assert.equal(textDirection('LABAK: منصة التعلم الذكية'), 'rtl', 'Arabic majority also wins without a language');
  assert.equal(textDirection('LABAK', 'ar'), 'ltr', 'pure Latin text stays LTR');
  assert.equal(textDirection('Learn Python and مرحبا', 'en'), 'ltr');
  assert.ok(isRtlLanguage('ar-SA') && isRtlLanguage('he') && !isRtlLanguage('en'));
});

test('word and phrase tokenization never splits Arabic words', () => {
  assert.deepEqual(tokenizeWords('  أمن   المعلومات\nيبدأ '), ['أمن', 'المعلومات', 'يبدأ']);
  assert.deepEqual(tokenizePhrases('ابدأ اليوم، خطوة بخطوة. وبعدها؟ نعم'), ['ابدأ اليوم،', 'خطوة بخطوة.', 'وبعدها؟', 'نعم']);
  assert.equal(wordScript('Python'), 'latin');
  assert.equal(wordScript('أمن'), 'arabic');
  assert.equal(wordScript('٢٠٢٦'), 'other');
});

test('numbers and punctuation: digit styles and Arabic punctuation after Arabic letters', () => {
  assert.equal(normalizeDigits('في 2026 يوم', 'arabic-indic'), 'في ٢٠٢٦ يوم');
  assert.equal(normalizeDigits('في ٢٠٢٦ و ۱۲', 'western'), 'في 2026 و 12');
  assert.equal(normalizeDigits('2026 ٢٠٢٦', 'keep'), '2026 ٢٠٢٦');
  assert.equal(localizePunctuation('ماذا, لماذا? نعم;'), 'ماذا، لماذا؟ نعم؛');
  assert.equal(localizePunctuation('Hello, world? yes;'), 'Hello, world? yes;', 'Latin text is untouched');
  assert.equal(localizePunctuation('مثال: Python.'), 'مثال: Python.', 'colon and period are shared');
});

test('script runs and bidi isolation keep embedded Latin from absorbing punctuation', () => {
  assert.deepEqual(splitScriptRuns('تعلم Python الآن').map((run) => run.script), ['arabic', 'latin', 'arabic']);
  const isolated = isolateForeignRuns('تعلم Python. ثم SQL', 'rtl');
  assert.match(isolated, /⁨Python⁩\./);
  assert.match(isolated, /⁨SQL⁩/);
  assert.equal(stripBidiControls(isolated), 'تعلم Python. ثم SQL');
  assert.equal(isolateForeignRuns('Learn English', 'rtl'), '⁨Learn English⁩'.replace('⁩', '⁩'));
  assert.equal(isolateForeignRuns('plain latin', 'ltr'), 'plain latin');
});

test('fitText shrinks to fit, wraps by words, and reports an unfittable word instead of overflowing silently', () => {
  const roomy = fitText({text: 'Short title', maxWidth: 1500, maxHeight: 300, fontSize: 100, minFontSize: 30, lineHeight: 1.2, fonts: FONTS});
  assert.ok(roomy.fits && !roomy.shrunk && roomy.fontSize === 100 && roomy.lines.length === 1);

  const long = 'A considerably longer headline that cannot stay on one line at full size';
  const shrunk = fitText({text: long, maxWidth: 900, maxHeight: 260, maxLines: 2, fontSize: 120, minFontSize: 30, lineHeight: 1.2, fonts: FONTS});
  assert.ok(shrunk.fits && shrunk.shrunk && shrunk.lines.length <= 2 && shrunk.height <= 260 && shrunk.width <= 900);
  assert.equal(shrunk.lines.join(' '), long, 'wrapping preserves every word in order');

  const impossible = fitText({text: 'Supercalifragilisticexpialidocious '.repeat(3), maxWidth: 200, maxHeight: 100, maxLines: 1, fontSize: 80, minFontSize: 20, lineHeight: 1.2, fonts: FONTS});
  assert.equal(impossible.fits, false);
  assert.equal(impossible.fontSize, 20);
});

test('fitText handles Arabic and ignores letter spacing for it', () => {
  const text = 'أمن المعلومات يبدأ بالوعي';
  const plain = fitText({text, maxWidth: 1400, maxHeight: 300, fontSize: 100, minFontSize: 30, lineHeight: 1.2, fonts: FONTS});
  const tracked = fitText({text, maxWidth: 1400, maxHeight: 300, fontSize: 100, minFontSize: 30, lineHeight: 1.2, fonts: {...FONTS, tracking: 0.5}});
  assert.equal(plain.width, tracked.width, 'tracking must not widen Arabic');
  const latinPlain = estimateMeasurer('Letters', {family: 'x', weight: 400, sizePx: 50});
  const latinTracked = estimateMeasurer('Letters', {family: 'x', weight: 400, sizePx: 50, tracking: 0.2});
  assert.ok(latinTracked > latinPlain);
});

test('kinetic plans: Arabic is never split into characters; Latin may be', () => {
  const arabic = planKinetic('أمن المعلومات', 'char', 3);
  assert.equal(arabic.mode, 'word');
  assert.ok(arabic.downgraded);
  assert.deepEqual(arabic.units, ['أمن', 'المعلومات']);
  assert.ok(arabic.units.every((unit) => !hasArabic(unit) || unit.length > 1));

  const latin = planKinetic('Go now', 'char', 2);
  assert.equal(latin.mode, 'char');
  assert.deepEqual(latin.units, ['G', 'o', 'n', 'o', 'w']);
  assert.deepEqual(latin.starts, [0, 2, 4, 6, 8]);

  assert.equal(planKinetic('One. Two three.', 'phrase', 5).units.length, 2);
  assert.deepEqual(planKinetic('a b c', 'word', 4).starts, [0, 4, 8]);
  assert.equal(planDuration(planKinetic('a b c', 'word', 4), 18), 26);
});

test('unit progress is a pure, clamped function of the frame', () => {
  const linear = (t: number) => t;
  assert.equal(unitProgress(0, 10, 20, linear), 0);
  assert.equal(unitProgress(20, 10, 20, linear), 0.5);
  assert.equal(unitProgress(99, 10, 20, linear), 1);
  assert.equal(unitProgress(20, 10, 20, linear), unitProgress(20, 10, 20, linear));
});

test('font coverage: installed fonts are checked for Arabic and Latin glyphs', (t) => {
  assert.deepEqual(parseCharset('20-7e a0 5b0-5b2'), [[0x20, 0x7e], [0xa0, 0xa0], [0x5b0, 0x5b2]]);
  const dejavu = fontCoverage('DejaVu Sans', 700);
  if (!dejavu) return t.skip('fontconfig or DejaVu Sans not available');
  assert.deepEqual(missingGlyphs('أمن المعلومات يبدأ بالوعي ،؟', dejavu), []);
  assert.deepEqual(missingGlyphs('Hello 123', dejavu), []);
  assert.ok(missingGlyphs('漢字', dejavu).length === 2, 'CJK glyphs DejaVu lacks are reported as missing');
  assert.equal(fontCoverage('No Such Font Family 123'), undefined);
  const liberation = fontCoverage('Liberation Sans', 700);
  if (liberation) assert.ok(missingGlyphs('أ', liberation).length > 0, 'Liberation Sans has no Arabic');
});

test('hasArabic detects any Arabic-script letter', () => {
  assert.ok(hasArabic('abc ع'));
  assert.ok(!hasArabic('abc 123'));
});

test('pure TypeScript cmap reader agrees with the shipped Arabic fonts and does not need fontconfig', async () => {
  const {fontFileCoverage} = await import('../../src/typography/fontconfig.ts');
  const {readdirSync} = await import('node:fs');
  for (const file of readdirSync(join(ROOT, 'public/fonts/majed')).filter((name) => name.endsWith('.ttf'))) {
    const coverage = fontFileCoverage(file, join(ROOT, 'public/fonts/majed', file));
    assert.ok(coverage, `${file} readable`);
    if (/Inter/.test(file)) assert.ok(coverage.has(0x41) && !coverage.has(0x0628), 'Inter: Latin yes, Arabic no');
    else if (!/Lalezar|Tajawal|Cairo|Kufi|Readex|Amiri|Aref/.test(file)) continue;
    else assert.ok(coverage.has(0x0628), `${file}: Arabic beh`);
  }
});
