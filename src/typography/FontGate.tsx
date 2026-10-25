import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {FONT_FILES, MOVE_FONT_FAMILIES} from './fonts';

// Families loaded when a gate is given no explicit list: the project's own typeface only.
const DEFAULT_FAMILIES = FONT_FILES.map((font) => font.family).filter((family) => !MOVE_FONT_FAMILIES.includes(family) || family === 'IBM Plex Sans Arabic');

// One load per font file for the lifetime of the page. Note: document.fonts.check() is true when a font was never
// registered, so it cannot be used to decide whether a font is loaded; this explicit registry can.
const loads = new Map<string, Promise<void>>();

const loadFont = (font: (typeof FONT_FILES)[number]) => {
  const key = `${font.family}:${font.weight}`;
  let promise = loads.get(key);
  if (!promise) {
    const face = new FontFace(font.family, `url(${staticFile(font.file)})`, {weight: font.weightRange ?? String(font.weight), style: 'normal'});
    promise = face.load().then(() => {
      document.fonts.add(face);
    });
    loads.set(key, promise);
  }
  return promise;
};

const loaded = new Set<string>();

/**
 * Loads the project's font files before anything renders, so every frame (and the text-fitting measurements)
 * uses the real font. Rendering is held with delayRender; a missing file fails the render loudly instead of
 * silently falling back to another font.
 */
export const FontGate: React.FC<{families?: string[]; children: React.ReactNode}> = ({families, children}) => {
  const wanted = FONT_FILES.filter((font) => (families ?? DEFAULT_FAMILIES).includes(font.family));
  const [ready, setReady] = useState(() => wanted.every((font) => loaded.has(`${font.family}:${font.weight}`)));
  const [handle] = useState(() => (ready ? null : delayRender('Loading project fonts')));

  useEffect(() => {
    if (ready || handle === null) return;
    Promise.all(wanted.map((font) => loadFont(font).then(() => loaded.add(`${font.family}:${font.weight}`))))
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch((error) => cancelRender(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, handle]);

  return ready ? <>{children}</> : null;
};
