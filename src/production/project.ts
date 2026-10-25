// Production projects on disk: production/projects/<id>/{brief.md, shot-graph.json}.
// Node-only (fs). The Remotion side only ever sees the resolved props JSON.
import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {createAssetIndex, validateAssetCatalog} from './asset-catalog.ts';
import type {Asset, AssetCatalog, AssetIndex} from './asset-catalog.ts';
import {validateBlenderManifest} from './blender-shot.ts';
import {validateShotGraph} from './shot-graph.ts';
import type {Shot, ShotGraph} from './shot-graph.ts';
import {BUILTIN_STYLE_PROFILES, PLATFORM_DEFAULTS, PLATFORM_IDS, createStyleRegistry, msToFrames} from './style-profile.ts';
import type {PlatformId, StyleProfile, StyleRegistry} from './style-profile.ts';
import {ID_PATTERN} from './validation.ts';
import type {Issue} from './validation.ts';

export const projectDir = (root: string, id: string) => {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid project id "${id}": use lowercase letters, digits, ".", "_" or "-".`);
  return join(root, 'production', 'projects', id);
};
export const graphFile = (root: string, id: string) => join(projectDir(root, id), 'shot-graph.json');
export const activeFile = (root: string) => join(root, 'src', 'data', 'active-production.json');

export const readJsonFile = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export const writeJsonAtomic = (path: string, value: unknown) => {
  mkdirSync(dirname(path), {recursive: true});
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
};

/** Built-in profiles plus any user profiles in production/style-profiles/*.json (validated in sorted order). */
export const loadStyleRegistry = (root: string): {registry: StyleRegistry; issues: Issue[]} => {
  const directory = join(root, 'production', 'style-profiles');
  const custom = existsSync(directory)
    ? readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((name) => readJsonFile(join(directory, name)))
    : [];
  return createStyleRegistry([...BUILTIN_STYLE_PROFILES, ...custom]);
};

export const loadCatalog = (root: string): {catalog: AssetCatalog; index: AssetIndex; issues: Issue[]; warnings: Issue[]} => {
  const file = join(root, 'production', 'asset-catalog.json');
  const raw = existsSync(file) ? readJsonFile(file) : {schemaVersion: 1, assets: []};
  const result = validateAssetCatalog(raw);
  const catalog: AssetCatalog = result.ok ? result.value : {schemaVersion: 1, assets: []};
  return {catalog, index: createAssetIndex(catalog), issues: result.ok ? [] : result.issues, warnings: result.warnings};
};

export type ResolvedProject = {
  id: string;
  graph: ShotGraph;
  style: StyleProfile;
  assets: Asset[];
  issues: Issue[];
  warnings: Issue[];
};

/** Loads and validates a project; `assets` holds only the catalog entries its shots and audio actually use. */
export const resolveProject = (root: string, id: string): ResolvedProject => {
  const file = graphFile(root, id);
  if (!existsSync(file)) throw new Error(`Project "${id}" not found (${file}). Create it with: npm run production -- new ${id}`);
  const {registry, issues: styleIssues} = loadStyleRegistry(root);
  const {catalog, index, issues: catalogIssues} = loadCatalog(root);
  const issues: Issue[] = [...styleIssues.map((i) => ({...i, path: `style-profiles: ${i.path}`})), ...catalogIssues.map((i) => ({...i, path: `asset-catalog: ${i.path}`}))];

  const parsed = validateShotGraph(readJsonFile(file), {assets: index, styles: registry});
  if (!parsed.ok) return {id, graph: undefined as unknown as ShotGraph, style: undefined as unknown as StyleProfile, assets: [], issues: [...issues, ...parsed.issues], warnings: parsed.warnings};

  const graph = parsed.value;
  const style = registry.get(graph.styleProfileId ?? 'haska-cyber');
  if (!style) issues.push({path: 'styleProfileId', message: `unknown style profile "${graph.styleProfileId}"`});

  const used = new Set<string>();
  for (const track of graph.audio ?? []) used.add(track.assetId);
  for (const shot of graph.shots) {
    for (const ref of shot.assets) used.add(ref.assetId);
    if (shot.engine === 'blender') {
      const manifest = validateBlenderManifest(shot.engineOptions?.blender, {assets: index, graph});
      if (!manifest.ok) issues.push(...manifest.issues.map((i) => ({path: `shots[${shot.id}].engineOptions.blender.${i.path}`, message: i.message})));
      else {
        used.add(manifest.value.sceneAssetId);
        manifest.value.textureAssetIds.forEach((assetId) => used.add(assetId));
      }
    }
  }
  const assets = [...used].map((assetId) => index.get(assetId)).filter((asset): asset is Asset => Boolean(asset));
  return {id, graph, style: style as StyleProfile, assets, issues, warnings: parsed.warnings};
};

/** Writes the props the ProductionVideo composition previews by default (like active-audio-project.json). */
export const activateProject = (root: string, id: string): ResolvedProject => {
  const project = resolveProject(root, id);
  if (project.issues.length) throw new Error(`Project "${id}" is invalid:\n${project.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`);
  writeJsonAtomic(activeFile(root), {graph: project.graph, style: project.style, assets: project.assets});
  return project;
};

export type NewProjectOptions = {id: string; title: string; platform: PlatformId; styleId: string; language: 'en' | 'ar'; now: string};

const BRIEF = (o: NewProjectOptions) => `# ${o.title}

Status: draft — approve with \`npm run production -- approval approve brief ${o.id} --actor NAME\`.

## Goal
_What should the viewer know, feel, or do after watching?_

## Audience and platform
Platform: ${o.platform} · Language: ${o.language === 'ar' ? 'Arabic (RTL)' : 'English'}

## Message and key lines
_Exact on-screen wording. Do not invent product screens, logos, numbers, or claims._

## Assets
_Supplied narration, logos, footage, fonts — each must be catalogued with its license._

## Duration and constraints
`;

/** Creates production/projects/<id>/ with a brief and a valid 3-shot starter graph. Refuses to overwrite. */
export const scaffoldProject = (root: string, options: NewProjectOptions, registry: StyleRegistry): ShotGraph => {
  const directory = projectDir(root, options.id);
  if (existsSync(directory)) throw new Error(`Project "${options.id}" already exists; nothing was changed.`);
  const style = registry.get(options.styleId);
  if (!style) throw new Error(`Unknown style profile "${options.styleId}". Available: ${[...registry.keys()].join(', ')}`);
  if (!PLATFORM_IDS.includes(options.platform)) throw new Error(`Unknown platform "${options.platform}". Use: ${PLATFORM_IDS.join(', ')}`);

  const platform = PLATFORM_DEFAULTS[options.platform];
  const fps = platform.fps;
  const scene = style.motion.transitions.scene;
  const transition = {type: scene.type, durationFrames: Math.min(msToFrames(scene.durationMs, fps), 15), easing: scene.easing};
  const ar = options.language === 'ar';
  const shot = (id: string, startFrame: number, durationFrames: number, text: string, extra: Partial<Shot>): Shot => ({
    id, track: 0, startFrame, durationFrames, description: extra.description ?? text, onScreenText: text, engine: 'remotion', assets: [], approval: 'draft', ...extra,
  });
  const graph: ShotGraph = {
    schemaVersion: 2,
    id: options.id,
    title: options.title,
    language: options.language,
    fps,
    width: platform.width,
    height: platform.height,
    durationFrames: fps * 9,
    styleProfileId: style.id,
    version: 1,
    createdAt: options.now,
    updatedAt: options.now,
    shots: [
      shot('opening', 0, fps * 3, ar ? 'عنوان الفيديو' : options.title, {composition: 'title', description: 'Opening title card.', engineOptions: {eyebrow: ar ? 'مقدمة' : 'Introduction', subtitle: ar ? 'سطر داعم قصير' : 'One supporting line.'}}),
      shot('middle', fps * 3, fps * 3, ar ? 'الفكرة الأساسية' : 'The key idea', {composition: 'network', description: 'Animated network visual carrying the key idea.', transitionIn: transition}),
      shot('closing', fps * 6, fps * 3, ar ? 'الخاتمة' : 'Closing line', {composition: 'title', description: 'Closing statement.', engineOptions: {layout: 'center'}, transitionIn: transition}),
    ],
  };
  mkdirSync(directory, {recursive: true});
  writeFileSync(join(directory, 'brief.md'), BRIEF(options));
  writeJsonAtomic(join(directory, 'shot-graph.json'), graph);
  return graph;
};
