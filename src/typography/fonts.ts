// Font files shipped with the project (public/fonts). Nothing here is fetched at render time.
export type FontFile = {family: string; weight: number; file: string; /** CSS weight range for variable fonts, e.g. "200 1000". */ weightRange?: string};

export const FONT_FILES: readonly FontFile[] = [
  {family: 'IBM Plex Sans Arabic', weight: 400, file: 'fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-Regular.ttf'},
  {family: 'IBM Plex Sans Arabic', weight: 500, file: 'fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-Medium.ttf'},
  {family: 'IBM Plex Sans Arabic', weight: 600, file: 'fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-SemiBold.ttf'},
  {family: 'IBM Plex Sans Arabic', weight: 700, file: 'fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-Bold.ttf'},
  // Fonts used by the Majed motion moves (all SIL OFL; see public/fonts/majed/LICENSES.txt and provenance.json).
  {family: 'Cairo', weight: 400, weightRange: '200 1000', file: 'fonts/majed/Cairo-VF.ttf'},
  {family: 'Noto Kufi Arabic', weight: 400, weightRange: '100 900', file: 'fonts/majed/NotoKufiArabic-VF.ttf'},
  {family: 'Lalezar', weight: 400, file: 'fonts/majed/Lalezar-Regular.ttf'},
  {family: 'Readex Pro', weight: 400, weightRange: '160 700', file: 'fonts/majed/ReadexPro-VF.ttf'},
  {family: 'Aref Ruqaa', weight: 400, file: 'fonts/majed/ArefRuqaa-Regular.ttf'},
  {family: 'Aref Ruqaa', weight: 700, file: 'fonts/majed/ArefRuqaa-Bold.ttf'},
  {family: 'Tajawal', weight: 400, file: 'fonts/majed/Tajawal-Regular.ttf'},
  {family: 'Tajawal', weight: 700, file: 'fonts/majed/Tajawal-Bold.ttf'},
  {family: 'Tajawal', weight: 900, file: 'fonts/majed/Tajawal-Black.ttf'},
  {family: 'Inter', weight: 400, weightRange: '100 900', file: 'fonts/majed/Inter-VF.ttf'},
  {family: 'Amiri Quran', weight: 400, file: 'fonts/majed/AmiriQuran-Regular.ttf'},
];

/** Families the motion moves draw with (loaded on demand, not for every composition). */
export const MOVE_FONT_FAMILIES = ['IBM Plex Sans Arabic', 'Cairo', 'Noto Kufi Arabic', 'Lalezar', 'Readex Pro', 'Aref Ruqaa', 'Tajawal', 'Inter', 'Amiri Quran'];

/** Font files (project-root relative, under public/) that provide `family` at the given weight, closest weight first. */
export const fontFilesFor = (family: string, weight = 400) =>
  FONT_FILES.filter((font) => font.family.toLowerCase() === family.toLowerCase())
    .sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))
    .map((font) => `public/${font.file}`);
