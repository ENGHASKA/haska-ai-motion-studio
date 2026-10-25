import {
  ID_PATTERN,
  SHA256_PATTERN,
  checkEnum,
  checkNumber,
  checkObject,
  checkSchemaVersion,
  checkString,
  checkTimestamp,
  finish,
} from './validation.ts';
import type {Issue, Validated} from './validation.ts';

export const APPROVAL_STATES = ['draft', 'review', 'approved', 'rejected'] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const SUBJECT_KINDS = ['brief', 'storyboard'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export type Decision = {
  at: string;
  actor: string;
  from: ApprovalState;
  to: ApprovalState;
  /** Content version the decision applies to. */
  version: number;
  contentHash: string;
  note?: string;
};

export type ApprovalRecord = {
  schemaVersion: 1;
  subject: {kind: SubjectKind; id: string};
  state: ApprovalState;
  /** Bumped whenever the reviewed content changes; starts at 1. */
  version: number;
  /** SHA-256 of the canonical content this record currently describes. */
  contentHash: string;
  history: Decision[];
};

// draft -> review -> approved | rejected; rejected and approved can be reopened as draft.
const TRANSITIONS: Record<ApprovalState, readonly ApprovalState[]> = {
  draft: ['review'],
  review: ['approved', 'rejected', 'draft'],
  approved: ['draft'],
  rejected: ['draft'],
};

export const canTransition = (from: ApprovalState, to: ApprovalState) => TRANSITIONS[from].includes(to);

export class ApprovalError extends Error {}

export const createApproval = (
  subject: ApprovalRecord['subject'],
  contentHash: string,
  at: string,
  actor = 'system',
): ApprovalRecord => ({
  schemaVersion: 1,
  subject,
  state: 'draft',
  version: 1,
  contentHash,
  history: [{at, actor, from: 'draft', to: 'draft', version: 1, contentHash, note: 'created'}],
});

export type DecisionInput = {
  to: ApprovalState;
  actor: string;
  at: string;
  /** Hash of the content as it exists right now. */
  contentHash: string;
  note?: string;
};

/**
 * Returns a new record with the decision applied (the input is never mutated).
 * If the content changed since the record was last written, the record is first
 * reset to a new draft version, so an approval can never carry over to edited content.
 */
export const applyDecision = (record: ApprovalRecord, input: DecisionInput): ApprovalRecord => {
  if (!input.actor.trim()) throw new ApprovalError('A decision needs a named actor.');
  if (input.to === 'rejected' && !input.note?.trim()) throw new ApprovalError('Rejecting requires a note explaining why.');

  let current = record;
  if (current.contentHash !== input.contentHash) {
    current = {
      ...current,
      state: 'draft',
      version: current.version + 1,
      contentHash: input.contentHash,
      history: [
        ...current.history,
        {at: input.at, actor: input.actor, from: current.state, to: 'draft', version: current.version + 1, contentHash: input.contentHash, note: 'content changed; approval reset'},
      ],
    };
  }

  if (!canTransition(current.state, input.to)) {
    const hint = current.state === 'draft' ? ' Submit it for review first.' : '';
    throw new ApprovalError(`Cannot move from "${current.state}" to "${input.to}".${hint}`);
  }

  return {
    ...current,
    state: input.to,
    history: [
      ...current.history,
      {
        at: input.at,
        actor: input.actor,
        from: current.state,
        to: input.to,
        version: current.version,
        contentHash: input.contentHash,
        ...(input.note ? {note: input.note} : {}),
      },
    ],
  };
};

export type RenderGate = {allowed: boolean; reason: string};

/**
 * Decides whether an expensive final render may start.
 * - With a record: only an approval of exactly the current content passes.
 * - Without a record: legacy projects pass with a warning unless `strict` is set.
 */
export const evaluateRenderGate = (
  record: ApprovalRecord | undefined,
  currentHash: string,
  options: {strict?: boolean} = {},
): RenderGate => {
  if (!record) {
    return options.strict
      ? {allowed: false, reason: 'No approval record exists and approval is required (HASKA_REQUIRE_APPROVAL=1).'}
      : {allowed: true, reason: 'No approval record exists; rendering is allowed for this untracked project. Track it with: npm run production -- approval init <kind> <id> --actor NAME'};
  }
  if (record.state !== 'approved') {
    return {allowed: false, reason: `Approval state is "${record.state}" (v${record.version}); it must be "approved" before a final render.`};
  }
  if (record.contentHash !== currentHash) {
    return {allowed: false, reason: `Content changed after approval (v${record.version}); review and approve the current version.`};
  }
  return {allowed: true, reason: `Approved v${record.version}.`};
};

export const validateApprovalRecord = (raw: unknown): Validated<ApprovalRecord> => {
  const issues: Issue[] = [];
  if (!checkObject(issues, '$', raw, ['schemaVersion', 'subject', 'state', 'version', 'contentHash', 'history'])) {
    return finish(issues, [], raw);
  }
  checkSchemaVersion(issues, raw, 1);
  if (checkObject(issues, 'subject', raw.subject, ['kind', 'id'])) {
    checkEnum(issues, 'subject.kind', raw.subject.kind, SUBJECT_KINDS);
    checkString(issues, 'subject.id', raw.subject.id, {pattern: ID_PATTERN});
  }
  checkEnum(issues, 'state', raw.state, APPROVAL_STATES);
  checkNumber(issues, 'version', raw.version, {min: 1, integer: true});
  checkString(issues, 'contentHash', raw.contentHash, {pattern: SHA256_PATTERN});

  if (!Array.isArray(raw.history) || raw.history.length === 0) {
    issues.push({path: 'history', message: 'must be a non-empty array'});
  } else {
    raw.history.forEach((entry: unknown, index: number) => {
      const at = `history[${index}]`;
      if (!checkObject(issues, at, entry, ['at', 'actor', 'from', 'to', 'version', 'contentHash', 'note'])) return;
      checkTimestamp(issues, `${at}.at`, entry.at);
      checkString(issues, `${at}.actor`, entry.actor, {max: 120});
      checkEnum(issues, `${at}.from`, entry.from, APPROVAL_STATES);
      checkEnum(issues, `${at}.to`, entry.to, APPROVAL_STATES);
      checkNumber(issues, `${at}.version`, entry.version, {min: 1, integer: true});
      checkString(issues, `${at}.contentHash`, entry.contentHash, {pattern: SHA256_PATTERN});
      if (entry.note !== undefined) checkString(issues, `${at}.note`, entry.note, {max: 1000});
    });
    // Hand-edited records must still describe a legal path: each entry continues the previous state,
    // stays within one content version unless the content reset it to a draft.
    const history = raw.history as Array<Record<string, unknown>>;
    for (let index = 1; index < history.length; index++) {
      const previous = history[index - 1];
      const entry = history[index];
      if (entry.from !== previous.to) {
        issues.push({path: `history[${index}].from`, message: `must continue from the previous state "${String(previous.to)}"`});
      } else if (entry.version === previous.version) {
        if (!canTransition(entry.from as ApprovalState, entry.to as ApprovalState)) {
          issues.push({path: `history[${index}]`, message: `illegal transition ${String(entry.from)} -> ${String(entry.to)}`});
        }
        if (entry.contentHash !== previous.contentHash) issues.push({path: `history[${index}].contentHash`, message: 'changed without a new version'});
      } else if (entry.version !== (previous.version as number) + 1 || entry.to !== 'draft' || entry.contentHash === previous.contentHash) {
        issues.push({path: `history[${index}]`, message: 'a version bump must reset to draft with new content'});
      }
    }
    const last = raw.history[raw.history.length - 1] as Record<string, unknown>;
    if (last && typeof last === 'object' && (last.to !== raw.state || last.contentHash !== raw.contentHash)) {
      issues.push({path: 'history', message: 'last decision must match the record state and contentHash'});
    }
  }
  return finish<ApprovalRecord>(issues, [], raw);
};
