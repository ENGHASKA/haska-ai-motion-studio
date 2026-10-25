import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, test} from 'node:test';
import {ApprovalError, applyDecision, createApproval, evaluateRenderGate, validateApprovalRecord} from '../../src/production/approval.ts';
import {hashJson} from '../../src/production/hash.ts';
import {approvalPath, findProjectRoot, currentContentHash, decide, gateRender, initApproval, loadApproval} from '../../src/production/store.ts';

const ROOT = findProjectRoot(import.meta.dirname);
const T0 = '2026-10-25T10:00:00Z';
const T1 = '2026-10-25T11:00:00Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const subject = {kind: 'storyboard', id: 'demo'} as const;

test('hashJson ignores key order and formatting', () => {
  assert.equal(hashJson({b: 1, a: [1, {d: 2, c: 3}]}), hashJson({a: [1, {c: 3, d: 2}], b: 1}));
  assert.notEqual(hashJson({a: 1}), hashJson({a: 2}));
});

test('happy path: draft -> review -> approved, with attributable history', () => {
  let record = createApproval(subject, HASH_A, T0);
  record = applyDecision(record, {to: 'review', actor: 'sara', at: T0, contentHash: HASH_A});
  record = applyDecision(record, {to: 'approved', actor: 'omar', at: T1, contentHash: HASH_A, note: 'Looks right'});
  assert.equal(record.state, 'approved');
  assert.deepEqual(record.history.map((entry) => `${entry.from}>${entry.to}`), ['draft>draft', 'draft>review', 'review>approved']);
  assert.ok(validateApprovalRecord(record).ok);
  assert.deepEqual(evaluateRenderGate(record, HASH_A), {allowed: true, reason: 'Approved v1.'});
});

test('illegal transitions and anonymous or unexplained decisions are refused', () => {
  const draft = createApproval(subject, HASH_A, T0);
  assert.throws(() => applyDecision(draft, {to: 'approved', actor: 'omar', at: T1, contentHash: HASH_A}), /Submit it for review first/);
  const review = applyDecision(draft, {to: 'review', actor: 'sara', at: T0, contentHash: HASH_A});
  assert.throws(() => applyDecision(review, {to: 'rejected', actor: 'omar', at: T1, contentHash: HASH_A}), ApprovalError);
  assert.throws(() => applyDecision(review, {to: 'approved', actor: '  ', at: T1, contentHash: HASH_A}), /named actor/);
});

test('rejected work must be reopened as a draft before another review', () => {
  let record = createApproval(subject, HASH_A, T0);
  record = applyDecision(record, {to: 'review', actor: 'sara', at: T0, contentHash: HASH_A});
  record = applyDecision(record, {to: 'rejected', actor: 'omar', at: T1, contentHash: HASH_A, note: 'Pacing too fast'});
  assert.equal(evaluateRenderGate(record, HASH_A).allowed, false);
  assert.throws(() => applyDecision(record, {to: 'review', actor: 'sara', at: T1, contentHash: HASH_A}));
  record = applyDecision(record, {to: 'draft', actor: 'sara', at: T1, contentHash: HASH_A});
  assert.equal(record.state, 'draft');
});

test('editing content after approval resets it to a new draft version', () => {
  let record = createApproval(subject, HASH_A, T0);
  record = applyDecision(record, {to: 'review', actor: 'sara', at: T0, contentHash: HASH_A});
  record = applyDecision(record, {to: 'approved', actor: 'omar', at: T1, contentHash: HASH_A});
  assert.equal(evaluateRenderGate(record, HASH_B).allowed, false);
  // Trying to re-approve edited content directly is refused: it must be re-reviewed.
  assert.throws(() => applyDecision(record, {to: 'approved', actor: 'omar', at: T1, contentHash: HASH_B}));
  const resubmitted = applyDecision(record, {to: 'review', actor: 'sara', at: T1, contentHash: HASH_B});
  assert.equal(resubmitted.version, 2);
  assert.equal(resubmitted.contentHash, HASH_B);
  assert.equal(record.version, 1, 'input record is not mutated');
  assert.ok(validateApprovalRecord(resubmitted).ok);
});

test('render gate: untracked allowed unless strict; tracked requires current approval', () => {
  assert.equal(evaluateRenderGate(undefined, HASH_A).allowed, true);
  assert.equal(evaluateRenderGate(undefined, HASH_A, {strict: true}).allowed, false);
  assert.equal(evaluateRenderGate(createApproval(subject, HASH_A, T0), HASH_A).allowed, false);
});

test('approval record validation rejects tampered state', () => {
  const record = createApproval(subject, HASH_A, T0);
  assert.ok(!validateApprovalRecord({...record, state: 'approved'}).ok);
  assert.ok(!validateApprovalRecord({...record, contentHash: 'nope'}).ok);
});

// --- file-backed workflow against a temp project root ----------------------

const root = mkdtempSync(join(tmpdir(), 'haska-approval-'));
after(() => rmSync(root, {recursive: true, force: true}));
const projectDir = join(root, 'public', 'audio-projects', 'demo');
mkdirSync(projectDir, {recursive: true});
cpSync(join(ROOT, 'public', 'audio-projects', 'audio-motion-sample', 'storyboard.json'), join(projectDir, 'storyboard.json'));

test('store: untracked project passes the gate (legacy), strict env blocks it', () => {
  assert.equal(gateRender(root, 'storyboard', 'demo', {}).allowed, true);
  assert.equal(gateRender(root, 'storyboard', 'demo', {HASKA_REQUIRE_APPROVAL: '1'}).allowed, false);
});

test('store: init -> submit -> approve unlocks; any storyboard edit locks again', () => {
  initApproval(root, 'storyboard', 'demo', T0, 'sara');
  assert.equal(gateRender(root, 'storyboard', 'demo', {}).allowed, false);
  decide(root, 'storyboard', 'demo', {to: 'review', actor: 'sara', at: T0});
  decide(root, 'storyboard', 'demo', {to: 'approved', actor: 'omar', at: T1, note: 'ok'});
  assert.equal(gateRender(root, 'storyboard', 'demo', {}).allowed, true);

  const file = join(projectDir, 'storyboard.json');
  const edited = JSON.parse(readFileSync(file, 'utf8'));
  const original = JSON.stringify(edited);
  // Reformatting alone must not invalidate the approval.
  writeFileSync(file, JSON.stringify(JSON.parse(original), null, 4));
  assert.equal(gateRender(root, 'storyboard', 'demo', {}).allowed, true);

  edited.scenes[0].onScreenText = 'CHANGED';
  writeFileSync(file, JSON.stringify(edited));
  const blocked = gateRender(root, 'storyboard', 'demo', {});
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /Content changed/);
});

test('store: records persist as valid JSON; bad ids and missing subjects fail safely', () => {
  assert.ok(existsSync(approvalPath(root, 'storyboard', 'demo')));
  assert.ok(validateApprovalRecord(JSON.parse(readFileSync(approvalPath(root, 'storyboard', 'demo'), 'utf8'))).ok);
  assert.equal(loadApproval(root, 'storyboard', 'demo')?.history.at(-1)?.actor, 'omar');
  assert.throws(() => currentContentHash(root, 'storyboard', '../etc'), /Invalid id/);
  assert.throws(() => currentContentHash(root, 'storyboard', 'missing'), /not found/);
  assert.throws(() => initApproval(root, 'storyboard', 'demo', T0, 'sara'), /already exists/);
});

test('store: briefs (markdown) are approvable and content-hashed as text', () => {
  mkdirSync(join(root, 'production', 'briefs'), {recursive: true});
  writeFileSync(join(root, 'production', 'briefs', 'launch.md'), '# Launch brief\nGoal: awareness');
  initApproval(root, 'brief', 'launch', T0, 'sara');
  decide(root, 'brief', 'launch', {to: 'review', actor: 'sara', at: T0});
  decide(root, 'brief', 'launch', {to: 'approved', actor: 'omar', at: T1});
  assert.equal(gateRender(root, 'brief', 'launch', {}).allowed, true);
  writeFileSync(join(root, 'production', 'briefs', 'launch.md'), '# Launch brief\nGoal: conversions');
  assert.equal(gateRender(root, 'brief', 'launch', {}).allowed, false);
});
