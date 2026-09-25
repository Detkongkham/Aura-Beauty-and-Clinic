/**
 * Wave 11 — keeps openapi.yaml's path inventory in step with the Express routers.
 *
 * The hand-written contract stopped being updated after Phase 6, so ~90% of the API was missing.
 * This walks the mounted routers at runtime and appends every (method, path) that the YAML does not
 * already document, as a minimal operation (tag, summary, path params, auth, standard responses).
 * Hand-written operations are never touched — enrich them in place and the script leaves them alone.
 *
 *   pnpm --filter @abcp/backend openapi:sync          # update openapi.yaml
 *   pnpm --filter @abcp/backend openapi:sync --check  # exit 1 if anything is missing (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Router } from 'express';
import { apiRouter } from '../src/routes.js';

type Layer = {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  name?: string;
  regexp?: RegExp;
  handle?: { stack?: Layer[] };
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
/** Mounted without authGuard (public) — the rest of the API needs a bearer token. */
const PUBLIC = [
  /^\/auth\/(login|register|refresh|password\/|2fa\/(verify|setup|activate)|quick-login)/,
  /^\/payments\/webhooks/,
  /^\/consent\/unsubscribe/,
  /^\/chatbot\/telegram/,
  /^\/health/,
];

function mountPath(layer: Layer): string {
  const src = layer.regexp?.source ?? '';
  if (src === '^\\/?(?=\\/|$)' || src === '^\\/?$') return '';
  return src
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/')
    .replace(/\/\?$/, '');
}

function collect(stack: Layer[], prefix: string, out: Map<string, Set<string>>): void {
  for (const l of stack) {
    if (l.route) {
      const paths = Array.isArray(l.route.path) ? l.route.path : [l.route.path];
      for (const p of paths) {
        const full = (prefix + (p === '/' ? '' : p)).replace(/\/+/g, '/') || '/';
        const set = out.get(full) ?? new Set<string>();
        for (const m of METHODS) if (l.route.methods[m]) set.add(m);
        out.set(full, set);
      }
    } else if (l.name === 'router' && l.handle?.stack) {
      collect(l.handle.stack, prefix + mountPath(l), out);
    }
  }
}

const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

function documented(yaml: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const lines = yaml.split('\n');
  let current: string | null = null;
  for (const line of lines) {
    const p = line.match(/^ {2}(\/[^:]*):\s*$/);
    if (p) {
      current = p[1]!;
      out.set(current, out.get(current) ?? new Set());
      continue;
    }
    if (/^\S/.test(line)) current = null;
    const m = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (m && current) out.get(current)!.add(m[1]!);
  }
  return out;
}

const tagOf = (p: string) => {
  const head = p.split('/').filter(Boolean)[0] ?? 'misc';
  return head.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
};

const VERB: Record<string, string> = { get: 'Get', post: 'Create / run', put: 'Replace', patch: 'Update', delete: 'Delete' };

function operation(method: string, path: string): string {
  const params = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
  const isPublic = PUBLIC.some((re) => re.test(path));
  const lines = [
    `    ${method}:`,
    `      tags: [${tagOf(path)}]`,
    `      summary: ${VERB[method]} ${path}`,
    `      x-generated: true`,
  ];
  if (!isPublic) lines.push('      security: [{ bearerAuth: [] }]');
  if (params.length) {
    lines.push('      parameters:');
    for (const p of params) lines.push(`        - { name: ${p}, in: path, required: true, schema: { type: string } }`);
  }
  if (method !== 'get' && method !== 'delete') {
    lines.push('      requestBody:', '        content:', '          application/json:', '            schema: { type: object }');
  }
  lines.push(
    '      responses:',
    `        '${method === 'post' ? '201' : '200'}': { description: 'OK — data envelope' }`,
    "        '400': { description: Validation error }",
  );
  if (!isPublic) lines.push("        '401': { description: Missing / invalid token }", "        '403': { description: Role or permission missing }");
  return lines.join('\n');
}

function main(): void {
  const check = process.argv.includes('--check');
  const file = resolve(import.meta.dirname, '../openapi.yaml');
  let yaml = readFileSync(file, 'utf8');

  const routes = new Map<string, Set<string>>();
  collect((apiRouter as unknown as Router & { stack: Layer[] }).stack, '', routes);
  const have = documented(yaml);

  const missing: [string, string[]][] = [];
  for (const [raw, methods] of [...routes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const p = toOpenApiPath(raw);
    const todo = [...methods].filter((m) => !have.get(p)?.has(m));
    if (todo.length) missing.push([p, todo]);
  }
  const count = missing.reduce((n, [, ms]) => n + ms.length, 0);
  console.log(`routes: ${[...routes.values()].reduce((n, s) => n + s.size, 0)} operations; missing from openapi.yaml: ${count}`);
  if (check) {
    if (count) process.exitCode = 1;
    return;
  }
  if (!count) return;

  // Paths that already exist get extra methods appended under their block; new paths go before `components:`.
  const newBlocks: string[] = [];
  for (const [p, ms] of missing) {
    const ops = ms.map((m) => operation(m, p)).join('\n');
    if (have.has(p)) {
      const re = new RegExp(`(^ {2}${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*\\n(?:(?: {4,}.*|\\s*)\\n)*)`, 'm');
      yaml = yaml.replace(re, (block) => `${block.replace(/\n*$/, '\n')}${ops}\n`);
    } else {
      newBlocks.push(`  ${p}:\n${ops}`);
    }
  }
  const tags = [...new Set(missing.map(([p]) => tagOf(p)))].filter((t) => !new RegExp(`^  - name: ${t}$`, 'm').test(yaml));
  if (tags.length) yaml = yaml.replace(/^paths:/m, `${tags.map((t) => `  - name: ${t}`).join('\n')}\n\npaths:`);
  yaml = yaml.replace(
    /^components:/m,
    `  # ---- generated by scripts/openapi-sync.ts (x-generated: true) — enrich in place ----\n${newBlocks.join('\n')}\n\ncomponents:`,
  );
  writeFileSync(file, yaml);
  console.log(`openapi.yaml updated (${newBlocks.length} new paths, ${tags.length} new tags)`);
}

main();
process.exit();
