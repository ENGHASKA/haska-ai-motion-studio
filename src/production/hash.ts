import {createHash} from 'node:crypto';

/** JSON with sorted object keys, so equal content always hashes equally. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

export const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

export const hashJson = (value: unknown): string => sha256Hex(canonicalJson(value));
