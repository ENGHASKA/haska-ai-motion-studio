// Production CLI. Run via: npm run production -- <command>
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import http from 'node:http';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ApprovalError, SUBJECT_KINDS} from '../src/production/approval.ts';
import type {ApprovalState, SubjectKind} from '../src/production/approval.ts';
import {validateAssetCatalog} from '../src/production/asset-catalog.ts';
import {scanProjectAssets} from '../src/production/asset-scan.ts';
import {checkCatalogFiles} from '../src/production/asset-files.ts';
import {blenderCacheKey, blenderRenderCommand, checkBlenderOutputs} from '../src/production/blender-files.ts';
import {validateBlenderManifest} from '../src/production/blender-shot.ts';
import {HUMAN_REVIEW, qaAudioProject, qaProject, verifyOutput} from '../src/production/qa.ts';
import type {Finding} from '../src/production/qa.ts';
import {activateProject, activeFile, graphFile, loadCatalog, loadStyleRegistry, readJsonFile, resolveProject, scaffoldProject, writeJsonAtomic} from '../src/production/project.ts';
import {loadStoryboardDocument} from '../src/production/shot-graph.ts';
import type {ShotGraph} from '../src/production/shot-graph.ts';
import {currentContentHash, decide, findProjectRoot, gateRender, initApproval, loadApproval} from '../src/production/store.ts';
import {PLATFORM_IDS} from '../src/production/style-profile.ts';
import type {PlatformId} from '../src/production/style-profile.ts';
import {formatIssues} from '../src/production/validation.ts';
import type {Issue} from '../src/production/validation.ts';

// HASKA_PROJECT_ROOT lets tests run the whole workflow against a throwaway project directory.
const ROOT = process.env.HASKA_PROJECT_ROOT ?? findProjectRoot(dirname(fileURLToPath(import.meta.url)));
const STUDIO_URL = 'http://localhost:3000';

const USAGE = `Usage: npm run production -- <command>

Projects
  new <id> [--title T] [--platform ${PLATFORM_IDS.join('|')}] [--style haska-cyber] [--language en|ar]
  list                              production projects and audio projects
  activate <id>                     make <id> the default in Remotion Studio (composition ProductionVideo)
  preview <id>                      activate, then start Remotion Studio (or reuse the running one)
  validate [id]                     schemas, catalog, storyboards (all projects, or one)
  qa <id>                           typography, safe areas, assets, audio timing, routing, render compatibility
  bump <id>                         increment the graph version and updatedAt after an edit
  render <id> [--out FILE] [--dry-run]   QA + approval gate + render + ffprobe verification
  verify-output <id> <file.mp4>     check codec, size, fps, duration, audio against the project

Approval (kind: ${SUBJECT_KINDS.join('|')})
  approval init|status <kind> <id>
  approval <submit|approve|reject|reopen> <kind> <id> --actor NAME [--note TEXT]
  gate storyboard <id>              exit 0 only if a final render may start

Assets and 3D
  assets scan [--write]             index existing files in place (licenses stay "unknown")
  assets check                      verify catalog files and hashes
  blender check <id>                frames, textures and cache freshness for Blender shots
  blender plan <id> <shot-id>       print the Blender command (never runs it)

Strict mode: HASKA_REQUIRE_APPROVAL=1 also blocks projects with no approval record.`;

const flag = (args: string[], name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const has = (args: string[], name: string) => args.includes(`--${name}`);
const positional = (args: string[]) => args.filter((arg, index) => !arg.startsWith('--') && !(index > 0 && args[index - 1].startsWith('--') && !['--dry-run', '--write'].includes(args[index - 1])));

const need = (value: string | undefined, label: string) => {
  if (!value) throw new Error(`Missing ${label}.\n\n${USAGE}`);
  return value;
};
const kindOf = (value: string | undefined): SubjectKind => {
  if (!SUBJECT_KINDS.includes(value as SubjectKind)) throw new Error(`kind must be one of: ${SUBJECT_KINDS.join(', ')}`);
  return value as SubjectKind;
};

const report = (label: string, issues: Issue[], warnings: Issue[] = []) => {
  for (const warning of warnings) console.log(`WARN  ${label} ${warning.path}: ${warning.message}`);
  if (issues.length === 0) console.log(`PASS  ${label}`);
  else console.log(`FAIL  ${label}\n${formatIssues(issues).replace(/^/gm, '        ')}`);
  return issues.length === 0;
};

const printFindings = (findings: Finding[]) => {
  const order = {error: 0, warning: 1, info: 2};
  for (const finding of [...findings].sort((a, b) => order[a.level] - order[b.level])) {
    console.log(`${finding.level.toUpperCase().padEnd(7)} [${finding.check}] ${finding.message}`);
  }
  const errors = findings.filter((finding) => finding.level === 'error').length;
  const warnings = findings.filter((finding) => finding.level === 'warning').length;
  console.log(`\n${errors} error(s), ${warnings} warning(s).`);
  return errors === 0;
};

const printHumanReview = () => {
  console.log('\nStill needs human review (automated checks cannot judge these):');
  for (const item of HUMAN_REVIEW) console.log(`  - ${item}`);
};

const projectIds = () => {
  const directory = join(ROOT, 'production', 'projects');
  return existsSync(directory) ? readdirSync(directory).filter((name) => existsSync(join(directory, name, 'shot-graph.json'))).sort() : [];
};
const audioIds = () => {
  const directory = join(ROOT, 'public', 'audio-projects');
  return existsSync(directory) ? readdirSync(directory).filter((name) => existsSync(join(directory, name, 'storyboard.json'))).sort() : [];
};
const isProject = (id: string) => existsSync(graphFile(ROOT, id));

const validateAll = async (only?: string) => {
  let ok = true;
  const styles = loadStyleRegistry(ROOT);
  ok = report(`style profiles (${[...styles.registry.keys()].join(', ')})`, styles.issues) && ok;

  const {catalog, index, issues: catalogIssues, warnings: catalogWarnings} = loadCatalog(ROOT);
  if (catalogIssues.length) ok = report('asset catalog', catalogIssues, catalogWarnings) && ok;
  else {
    const fileIssues = await checkCatalogFiles(catalog, ROOT);
    ok = report(`asset catalog (${catalog.assets.length} assets, files + hashes)`, fileIssues, catalogWarnings) && ok;
  }

  for (const id of projectIds().filter((name) => !only || name === only)) {
    const project = resolveProject(ROOT, id);
    ok = report(`project ${id}`, project.issues, project.warnings) && ok;
  }
  for (const id of audioIds().filter((name) => !only || name === only)) {
    const loaded = loadStoryboardDocument(readJsonFile(join(ROOT, 'public', 'audio-projects', id, 'storyboard.json')), {id, timestamp: new Date(0).toISOString(), assets: index, styles: styles.registry});
    ok = report(`audio storyboard ${id}`, loaded.ok ? [] : loaded.issues, loaded.ok ? loaded.value.warnings : []) && ok;
  }
  if (only && !projectIds().includes(only) && !audioIds().includes(only)) throw new Error(`No project or audio project named "${only}".`);
  return ok;
};

const studioRunning = () =>
  new Promise<boolean>((done) => {
    const request = http.get(STUDIO_URL, {timeout: 1500}, (response) => {
      response.resume();
      done((response.statusCode ?? 500) < 500);
    });
    request.on('error', () => done(false));
    request.on('timeout', () => {
      request.destroy();
      done(false);
    });
  });

const approvalCommand = (args: string[]) => {
  const [action, kindArg, id] = args;
  const kind = kindOf(kindArg);
  need(id, 'id');
  const now = new Date().toISOString();

  if (action === 'status') {
    const record = loadApproval(ROOT, kind, id);
    if (!record) return console.log(`${kind} "${id}": not tracked`);
    const current = currentContentHash(ROOT, kind, id) === record.contentHash;
    console.log(`${kind} "${id}": ${record.state} (v${record.version})${current ? '' : ' — content changed since last decision; needs a new review'}`);
    for (const entry of record.history.slice(-5)) console.log(`  ${entry.at}  ${entry.actor}: ${entry.from} -> ${entry.to}${entry.note ? ` — ${entry.note}` : ''}`);
    return;
  }
  const actor = flag(args, 'actor') ?? 'user';
  if (action === 'init') {
    initApproval(ROOT, kind, id, now, actor);
    return console.log(`Tracking ${kind} "${id}" as draft.`);
  }
  const targets: Record<string, ApprovalState> = {submit: 'review', approve: 'approved', reject: 'rejected', reopen: 'draft'};
  const to = targets[action ?? ''];
  if (!to) throw new Error(`Unknown approval action "${action}".\n\n${USAGE}`);
  if (['approve', 'reject'].includes(action) && !flag(args, 'actor')) throw new Error(`"${action}" requires --actor NAME so the decision is attributable.`);
  const record = decide(ROOT, kind, id, {to, actor, at: now, note: flag(args, 'note')});
  console.log(`${kind} "${id}" is now ${record.state} (v${record.version}).`);
};

const encodingArgs = () => {
  const gpu = spawnSync('nvidia-smi', [], {stdio: 'ignore'}).status === 0;
  return gpu ? ['--video-bitrate=12M', '--hardware-acceleration=if-possible'] : ['--crf=18', '--hardware-acceleration=disable'];
};

const expectationOf = (graph: ShotGraph) => ({width: graph.width, height: graph.height, fps: graph.fps, durationFrames: graph.durationFrames, audio: (graph.audio?.length ?? 0) > 0});

const renderCommand = async (args: string[]) => {
  const id = need(positional(args)[0], 'project id');
  const dryRun = has(args, 'dry-run');
  const out = resolve(ROOT, flag(args, 'out') ?? join('out', `${id}.mp4`));

  console.log('1/4 QA');
  const findings = await qaProject(ROOT, id);
  if (!printFindings(findings)) throw new Error('QA found errors; fix them before rendering.');

  console.log('\n2/4 Approval');
  const gate = gateRender(ROOT, 'storyboard', id);
  console.log(`${gate.allowed ? 'APPROVAL OK' : 'RENDER BLOCKED'}: ${gate.reason}`);
  if (!gate.allowed) {
    console.log(`Approve with: npm run production -- approval approve storyboard ${id} --actor NAME`);
    return 1;
  }

  const project = resolveProject(ROOT, id);
  const propsFile = join(ROOT, '.cache', 'production-props', `${id}.json`);
  writeJsonAtomic(propsFile, {graph: project.graph, style: project.style, assets: project.assets});
  mkdirSync(dirname(out), {recursive: true});
  const command = [
    join(ROOT, 'node_modules', '.bin', 'remotion'), 'render', 'src/index.ts', 'ProductionVideo', out,
    `--props=${propsFile}`, '--codec=h264', '--audio-codec=aac', '--color-space=bt709', '--concurrency=50%', ...encodingArgs(),
  ];
  console.log(`\n3/4 Render\n${command.join(' ')}`);
  if (dryRun) {
    console.log('\n(dry run: nothing was rendered)');
    return 0;
  }
  const rendered = spawnSync(command[0], command.slice(1), {cwd: ROOT, stdio: 'inherit', env: {...process.env, NPM_CONFIG_CACHE: join(ROOT, '.cache', 'npm')}});
  if (rendered.status !== 0) throw new Error('Remotion render failed.');

  console.log('\n4/4 Verify output');
  const verification = await verifyOutput(out, expectationOf(project.graph));
  if (!printFindings(verification)) return 1;
  console.log(`\nVerified MP4: ${out}`);
  return 0;
};

const main = async (): Promise<number> => {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'validate':
      return (await validateAll(positional(args)[0])) ? 0 : 1;

    case 'new': {
      const id = need(positional(args)[0], 'project id');
      const platform = (flag(args, 'platform') ?? 'youtube') as PlatformId;
      const language = (flag(args, 'language') ?? 'en') as 'en' | 'ar';
      if (!['en', 'ar'].includes(language)) throw new Error('--language must be en or ar');
      const now = new Date().toISOString();
      const {registry} = loadStyleRegistry(ROOT);
      scaffoldProject(ROOT, {id, title: flag(args, 'title') ?? id, platform, styleId: flag(args, 'style') ?? 'haska-cyber', language, now}, registry);
      initApproval(ROOT, 'storyboard', id, now, 'system');
      console.log(`Created production/projects/${id}/ (brief.md + shot-graph.json), approval tracking: draft.`);
      console.log(`Next: edit the brief and graph, then  npm run production -- preview ${id}`);
      return 0;
    }

    case 'list': {
      console.log('Production projects:', projectIds().join(', ') || '(none)');
      console.log('Audio projects:', audioIds().join(', ') || '(none)');
      return 0;
    }

    case 'activate': {
      const id = need(positional(args)[0], 'project id');
      activateProject(ROOT, id);
      console.log(`Active production project: ${id}  (${activeFile(ROOT).replace(`${ROOT}/`, '')})`);
      console.log(`Studio composition: ${STUDIO_URL}/ProductionVideo`);
      return 0;
    }

    case 'preview': {
      const id = need(positional(args)[0], 'project id');
      activateProject(ROOT, id);
      console.log(`Preview: ${STUDIO_URL}/ProductionVideo  (project ${id}, localhost only)`);
      if (await studioRunning()) {
        console.log('Remotion Studio is already running; it reloads the active project automatically.');
        return 0;
      }
      console.log('Starting Remotion Studio (Ctrl+C to stop)...');
      return spawnSync(process.execPath, [join(ROOT, 'scripts', 'studio.mjs')], {cwd: ROOT, stdio: 'inherit'}).status ?? 1;
    }

    case 'qa': {
      const id = need(positional(args)[0], 'project id');
      const findings = isProject(id) ? await qaProject(ROOT, id) : await qaAudioProject(ROOT, id);
      const ok = printFindings(findings);
      printHumanReview();
      return ok ? 0 : 1;
    }

    case 'bump': {
      const id = need(positional(args)[0], 'project id');
      const file = graphFile(ROOT, id);
      const graph = readJsonFile(file) as ShotGraph;
      graph.version += 1;
      graph.updatedAt = new Date().toISOString();
      writeJsonAtomic(file, graph);
      console.log(`${id}: version ${graph.version}`);
      return 0;
    }

    case 'render':
      return renderCommand(args);

    case 'verify-output': {
      const [id, file] = positional(args);
      const project = resolveProject(ROOT, need(id, 'project id'));
      if (project.issues.length) throw new Error(formatIssues(project.issues));
      return printFindings(await verifyOutput(resolve(ROOT, need(file, 'file')), expectationOf(project.graph))) ? 0 : 1;
    }

    case 'approval':
      approvalCommand(args);
      return 0;

    case 'gate': {
      const gate = gateRender(ROOT, kindOf(args[0]), need(args[1], 'id'));
      console.log(`${gate.allowed ? 'APPROVAL OK' : 'RENDER BLOCKED'}: ${gate.reason}`);
      return gate.allowed ? 0 : 1;
    }

    case 'shot-graph': {
      const id = need(args[0], 'project id');
      if (isProject(id)) {
        console.log(JSON.stringify(resolveProject(ROOT, id).graph, null, 2));
        return 0;
      }
      const loaded = loadStoryboardDocument(readJsonFile(join(ROOT, 'public', 'audio-projects', id, 'storyboard.json')), {id, timestamp: new Date(0).toISOString()});
      if (!loaded.ok) {
        report(`storyboard ${id}`, loaded.issues);
        return 1;
      }
      console.log(JSON.stringify(loaded.value.graph, null, 2));
      return 0;
    }

    case 'assets': {
      const sub = args[0];
      const {catalog} = loadCatalog(ROOT);
      if (sub === 'check') {
        const issues = await checkCatalogFiles(catalog, ROOT);
        return report(`asset catalog (${catalog.assets.length} assets)`, issues) ? 0 : 1;
      }
      if (sub === 'scan') {
        const result = await scanProjectAssets(ROOT, catalog, new Date().toISOString());
        for (const asset of result.added) console.log(`ADD    ${asset.id}  ${asset.path}  license=${asset.license.id} source=${asset.source.kind}`);
        for (const alias of result.aliased) console.log(`ALIAS  ${alias.path} -> ${alias.assetId}`);
        for (const changed of result.changed) console.log(`CHANGED ${changed.path} no longer matches ${changed.assetId}; re-verify its license, then update the entry by hand`);
        for (const path of result.skippedSensitive) console.log(`SKIP   ${path} (sensitive-looking name)`);
        if (!result.added.length && !result.aliased.length) console.log('Catalog already covers every scannable file.');
        const validated = validateAssetCatalog(result.catalog);
        if (!validated.ok) throw new Error(`Scan produced an invalid catalog:\n${formatIssues(validated.issues)}`);
        if (has(args, 'write')) {
          writeJsonAtomic(join(ROOT, 'production', 'asset-catalog.json'), result.catalog);
          console.log('Wrote production/asset-catalog.json');
        } else if (result.added.length || result.aliased.length) console.log('Dry run. Re-run with --write to save.');
        return 0;
      }
      throw new Error(`Unknown assets command.\n\n${USAGE}`);
    }

    case 'blender': {
      const [sub, id, shotId] = args;
      const project = resolveProject(ROOT, need(id, 'project id'));
      if (project.issues.length) throw new Error(formatIssues(project.issues));
      const {catalog, index} = loadCatalog(ROOT);
      const shots = project.graph.shots.filter((shot) => shot.engine === 'blender' && (!shotId || shot.id === shotId));
      if (!shots.length) {
        console.log('No Blender shots.');
        return 0;
      }
      let ok = true;
      for (const shot of shots) {
        const manifest = validateBlenderManifest(shot.engineOptions?.blender, {assets: index, graph: project.graph});
        if (!manifest.ok) {
          ok = report(`blender shot ${shot.id}`, manifest.issues) && ok;
          continue;
        }
        if (sub === 'plan') {
          const scene = index.get(manifest.value.sceneAssetId)!;
          console.log(blenderRenderCommand(`production/projects/${id}/blender/${shot.id}.manifest.json`, scene.path).join(' '));
          console.log(`cache key for these inputs: ${blenderCacheKey(manifest.value, catalog)}`);
          console.log('(not executed: this CLI never starts Blender)');
        } else ok = report(`blender shot ${shot.id}`, checkBlenderOutputs(manifest.value, ROOT, catalog), manifest.warnings) && ok;
      }
      return ok ? 0 : 1;
    }

    default:
      console.log(USAGE);
      return command ? 2 : 0;
  }
};

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof ApprovalError ? `Approval error: ${error.message}` : `Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  },
);

