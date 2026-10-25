// Dependency-free validation primitives shared by the production modules.
// Validators collect every issue instead of throwing on the first one.

export type Issue = {path: string; message: string};

export type Validated<T> =
  | {ok: true; value: T; warnings: Issue[]}
  | {ok: false; issues: Issue[]; warnings: Issue[]};

export const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const finish = <T>(issues: Issue[], warnings: Issue[], value: unknown): Validated<T> =>
  issues.length === 0 ? {ok: true, value: value as T, warnings} : {ok: false, issues, warnings};

export const checkObject = (
  issues: Issue[],
  path: string,
  value: unknown,
  allowedKeys: readonly string[],
): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    issues.push({path, message: 'must be an object'});
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) issues.push({path: `${path}.${key}`, message: 'unknown field'});
  }
  return true;
};

export const checkString = (
  issues: Issue[],
  path: string,
  value: unknown,
  options: {pattern?: RegExp; max?: number} = {},
): value is string => {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({path, message: 'must be a non-empty string'});
    return false;
  }
  if (options.max !== undefined && value.length > options.max) {
    issues.push({path, message: `must be at most ${options.max} characters`});
    return false;
  }
  if (options.pattern && !options.pattern.test(value)) {
    issues.push({path, message: `has an invalid format (${options.pattern})`});
    return false;
  }
  return true;
};

export const checkNumber = (
  issues: Issue[],
  path: string,
  value: unknown,
  options: {min?: number; max?: number; integer?: boolean} = {},
): value is number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({path, message: 'must be a finite number'});
    return false;
  }
  if (options.integer && !Number.isInteger(value)) {
    issues.push({path, message: 'must be an integer'});
    return false;
  }
  if ((options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max)) {
    issues.push({path, message: `must be between ${options.min ?? '-∞'} and ${options.max ?? '∞'}`});
    return false;
  }
  return true;
};

export const checkEnum = <T extends string>(
  issues: Issue[],
  path: string,
  value: unknown,
  options: readonly T[],
): value is T => {
  if (typeof value !== 'string' || !options.includes(value as T)) {
    issues.push({path, message: `must be one of: ${options.join(', ')}`});
    return false;
  }
  return true;
};

export const checkTimestamp = (issues: Issue[], path: string, value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    issues.push({path, message: 'must be an ISO-8601 timestamp with timezone'});
    return false;
  }
  return true;
};

export const checkSchemaVersion = (issues: Issue[], record: Record<string, unknown>, expected: number) => {
  if (record.schemaVersion !== expected) {
    issues.push({path: 'schemaVersion', message: `must be ${expected}`});
  }
};

export const formatIssues = (issues: readonly Issue[]) =>
  issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
