import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join, parse} from 'node:path';
import {applyDecision, createApproval, evaluateRenderGate, validateApprovalRecord} from './approval.ts';
import type {ApprovalRecord, ApprovalState, RenderGate, SubjectKind} from './approval.ts';
import {hashJson, sha256Hex} from './hash.ts';
import {reviewableContent} from './shot-graph.ts';
import type {ShotGraph} from './shot-graph.ts';
import {ID_PATTERN, formatIssues} from './validation.ts';

// Layout (relative to the project root):
//   production/approvals/<kind>--<id>.json   approval records
//   production/briefs/<id>.(json|md)         briefs under approval
//   public/audio-projects/<id>/storyboard.json   existing storyboards (never modified here)

/** Walks up from `start` to the directory holding remotion.config.ts (works from source or the compiled cache). */
export const findProjectRoot = (start: string): string => {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'remotion.config.ts'))) return dir;
    if (dir === parse(dir).root) throw new Error(`Project root not found above ${start}`);
  }
};

export const approvalPath = (root: string, kind: SubjectKind, id: string) => join(root, 'production', 'approvals', `${kind}--${id}.json`);

const assertId = (id: string) => {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid id "${id}": use lowercase letters, digits, ".", "_" or "-".`);
};

export const subjectFile = (root: string, kind: SubjectKind, id: string): string => {
  assertId(id);
  if (kind === 'storyboard') {
    // Production projects (shot graph v2) take precedence over Audio-to-Motion storyboards of the same id.
    const project = join(root, 'production', 'projects', id, 'shot-graph.json');
    return existsSync(project) ? project : join(root, 'public', 'audio-projects', id, 'storyboard.json');
  }
  const json = join(root, 'production', 'briefs', `${id}.json`);
  return existsSync(json) ? json : join(root, 'production', 'briefs', `${id}.md`);
};

/** Hash of the subject's current content. JSON is canonicalized, so formatting changes do not count as edits. */
export const currentContentHash = (root: string, kind: SubjectKind, id: string): string => {
  const file = subjectFile(root, kind, id);
  if (!existsSync(file)) throw new Error(`${kind} "${id}" not found at ${file}`);
  const text = readFileSync(file, 'utf8');
  if (!file.endsWith('.json')) return sha256Hex(text);
  const parsed = JSON.parse(text) as {schemaVersion?: number; shots?: unknown};
  // Shot graphs hash their reviewable content: approval flags, version, and timestamps are not edits.
  return parsed.schemaVersion === 2 && Array.isArray(parsed.shots) ? hashJson(reviewableContent(parsed as unknown as ShotGraph)) : hashJson(parsed);
};

export const loadApproval = (root: string, kind: SubjectKind, id: string): ApprovalRecord | undefined => {
  assertId(id);
  const file = approvalPath(root, kind, id);
  if (!existsSync(file)) return undefined;
  const result = validateApprovalRecord(JSON.parse(readFileSync(file, 'utf8')));
  if (!result.ok) throw new Error(`Invalid approval record ${file}:\n${formatIssues(result.issues)}`);
  return result.value;
};

export const saveApproval = (root: string, record: ApprovalRecord) => {
  const file = approvalPath(root, record.subject.kind, record.subject.id);
  mkdirSync(dirname(file), {recursive: true});
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(temporary, file);
};

export const initApproval = (root: string, kind: SubjectKind, id: string, at: string, actor: string): ApprovalRecord => {
  if (loadApproval(root, kind, id)) throw new Error(`An approval record for ${kind} "${id}" already exists.`);
  const record = createApproval({kind, id}, currentContentHash(root, kind, id), at, actor);
  saveApproval(root, record);
  return record;
};

export const decide = (
  root: string,
  kind: SubjectKind,
  id: string,
  input: {to: ApprovalState; actor: string; at: string; note?: string},
): ApprovalRecord => {
  const record = loadApproval(root, kind, id);
  if (!record) throw new Error(`No approval record for ${kind} "${id}". Create one first.`);
  const next = applyDecision(record, {...input, contentHash: currentContentHash(root, kind, id)});
  saveApproval(root, next);
  return next;
};

/** Gate for final renders. Strict mode comes from HASKA_REQUIRE_APPROVAL=1. */
export const gateRender = (root: string, kind: SubjectKind, id: string, env: Record<string, string | undefined> = process.env): RenderGate =>
  evaluateRenderGate(loadApproval(root, kind, id), currentContentHash(root, kind, id), {strict: env.HASKA_REQUIRE_APPROVAL === '1'});
