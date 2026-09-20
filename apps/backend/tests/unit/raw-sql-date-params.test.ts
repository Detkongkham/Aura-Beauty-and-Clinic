import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard — no bare `Date` may be interpolated into a raw SQL query.
 *
 * Prisma binds a JS `Date` in `$queryRaw` as `timestamptz`, which Postgres then
 * reconciles against our naive `timestamp` columns using the session timezone.
 * Get that wrong and comparisons land hours off with no error — it is how the
 * double-booking guard was silently broken. Every date must go through
 * `tsParam()` (utils/dateHelpers.ts).
 *
 * This scans the source rather than the runtime because the failure is silent:
 * there is nothing to assert at runtime except "the query returned the wrong
 * rows", which is exactly what nobody noticed for months.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(p, out);
    else if (entry.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

interface RawQuery {
  file: string;
  line: number;
  exprs: string[];
}

/** Pulls every `${…}` out of each `$queryRaw`/`$executeRaw` tagged template. */
function rawQueries(file: string): RawQuery[] {
  const src = fs.readFileSync(file, 'utf8');
  const tag = /\$(?:query|execute)Raw(?:Unsafe)?(?:<[^`]*?>)?\s*`/g;
  const found: RawQuery[] = [];
  let m: RegExpExecArray | null;

  while ((m = tag.exec(src))) {
    let i = tag.lastIndex;
    let depth = 0;
    let body = '';
    while (i < src.length) {
      const c = src[i]!;
      if (c === '\\') {
        body += c + (src[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') depth++;
      else if (c === '}' && depth > 0) depth--;
      else if (c === '`' && depth === 0) break;
      body += c;
      i++;
    }
    found.push({
      file: path.relative(SRC, file),
      line: src.slice(0, m.index).split('\n').length,
      exprs: [...body.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map((x) => x[1]!.trim()),
    });
  }
  return found;
}

/**
 * Word-level vocabulary for "this expression carries a Date".
 *
 * Matched against camelCase-split tokens, not the raw string: `endAt` has to
 * register, and a substring regex misses it because both `end` and `at` sit
 * against another letter.
 */
const DATE_WORDS = new Set([
  'at',
  'date',
  'dates',
  'from',
  'to',
  'start',
  'started',
  'end',
  'ended',
  'since',
  'until',
  'cutoff',
  'now',
  'gte',
  'gt',
  'lte',
  'lt',
  'expires',
  'expiry',
  'day',
  'range',
  'time',
  'timestamp',
  'stamp',
  'deadline',
  'due',
]);

/**
 * `existing.startAt` → ['existing', 'start', 'at']
 *
 * Method calls are stripped first, so string plumbing like
 * `code.trim().toUpperCase()` does not register as a date on the word "to".
 */
function tokenize(expr: string): string[] {
  let e = expr;
  let prev: string;
  do {
    prev = e;
    e = e.replace(/\.[a-zA-Z_$][\w$]*\s*\([^()]*\)/g, '');
  } while (e !== prev);

  return e
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const looksLikeDate = (expr: string) => tokenize(expr).some((w) => DATE_WORDS.has(w));

/** Wrappers that already bind a date safely, or that are not values at all. */
const SAFE = /^tsParam\(|^Prisma\.(sql|empty|join|raw)\b/;

describe('raw SQL date parameters', () => {
  const all = tsFiles(SRC).flatMap(rawQueries);

  it('finds the raw queries it is meant to be guarding', () => {
    // A refactor that moves every raw query would otherwise make this file pass
    // vacuously; fail loudly instead.
    expect(all.length).toBeGreaterThan(10);
  });

  it('wraps every date-looking parameter in tsParam()', () => {
    const offenders = all.flatMap(({ file, line, exprs }) =>
      exprs
        .filter((e) => !SAFE.test(e) && looksLikeDate(e))
        .map((e) => `${file}:${line} → \${${e}}`),
    );

    expect(
      offenders,
      `Bind these through tsParam() from utils/dateHelpers.js:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
