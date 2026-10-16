/**
 * Pure-logic tests for T0 module switches (lib/modules.ts) and the website
 * builder's module-bound block gating (site/config.tsx).
 *
 * Self-running, like src/site/__tests__/site-logic.test.ts — no test runner.
 * Type-checked with the app (`npx tsc --noEmit -p .`). Run it with:
 *
 *   npx esbuild src/lib/__tests__/modules-logic.test.ts --bundle --platform=node \
 *     --loader:.css=empty --jsx=automatic --outfile=<tmp>/modules-tests.cjs && node <tmp>/modules-tests.cjs
 *
 * Exits non-zero on the first failure.
 */
import { MODULE_KEYS, MODULE_REGISTRY, filterByModule, filterNavEntries, isModuleOn } from '../modules';
import { BLOCK_CATEGORIES, BLOCK_MODULES, availableCategories, isBlockAvailable } from '../../site/config';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`✗ ${name}\n    ${(e as Error).message}`);
  }
}

function eq<T>(actual: T, expected: T, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}

function ok(cond: unknown, msg = 'expected truthy') {
  if (!cond) throw new Error(msg);
}

test('registry mirrors the backend keys, in order', () => {
  eq(MODULE_KEYS, ['islamic.donations', 'islamic.character', 'islamic.hifz', 'tutor_payouts', 'appointments', 'mailbox']);
  for (const m of MODULE_REGISTRY) eq(m.defaultEnabled, m.group === 'optional', m.key);
});

test('isModuleOn: server map wins; registry default while unknown; no key = always on', () => {
  ok(isModuleOn(undefined, undefined));
  ok(!isModuleOn('islamic.donations', undefined), 'Islamic default off');
  ok(isModuleOn('mailbox', undefined), 'optional default on');
  ok(isModuleOn('islamic.donations', { 'islamic.donations': true }));
  ok(!isModuleOn('mailbox', { mailbox: false }));
  ok(!isModuleOn('not.a.module', undefined), 'unknown key is off');
});

test('filterByModule keeps unbound items', () => {
  const items = [{ id: 1 }, { id: 2, module: 'islamic.donations' }, { id: 3, module: 'mailbox' }];
  eq(filterByModule(items, { 'islamic.donations': false, mailbox: true }).map((i) => i.id), [1, 3]);
});

test('filterNavEntries drops off links, off children and emptied categories', () => {
  type Leaf = { to: string; module?: string };
  type Entry = ({ kind: 'link' } & Leaf) | { kind: 'category'; label: string; module?: string; children: Leaf[] };
  const entries: Entry[] = [
    { kind: 'link', to: '/' },
    { kind: 'link', to: '/x', module: 'islamic.hifz' },
    { kind: 'category', label: 'Fin', children: [{ to: '/fees' }, { to: '/donations', module: 'islamic.donations' }] },
    { kind: 'category', label: 'Only', children: [{ to: '/donations', module: 'islamic.donations' }] },
    { kind: 'category', label: 'Whole', module: 'mailbox', children: [{ to: '/mail' }] },
  ];
  const off = filterNavEntries(entries, { 'islamic.donations': false, 'islamic.hifz': false, mailbox: false });
  eq(off.map((e) => (e.kind === 'link' ? e.to : e.label)), ['/', 'Fin']);
  const fin = off.find((e) => e.kind === 'category' && e.label === 'Fin');
  eq(fin && fin.kind === 'category' ? fin.children.map((c) => c.to) : [], ['/fees']);
  const on = filterNavEntries(entries, { 'islamic.donations': true, 'islamic.hifz': true, mailbox: true });
  eq(on.length, 5);
});

test('website blocks: unbound blocks always available; bound blocks follow the switch', () => {
  ok(isBlockAvailable('Hero', null));
  ok(isBlockAvailable('Hero', []));
  for (const [block, key] of Object.entries(BLOCK_MODULES)) {
    ok(!isBlockAvailable(block, []), `${block} hidden when ${key} off`);
    ok(isBlockAvailable(block, [key as string]), `${block} shown when ${key} on`);
  }
});

test('availableCategories only removes module-bound blocks', () => {
  const bound = new Set(Object.keys(BLOCK_MODULES));
  const off = availableCategories([]);
  eq(
    off.map((c) => c.components.length),
    BLOCK_CATEGORIES.map((c) => c.components.filter((b) => !bound.has(b)).length),
  );
  const allOn = availableCategories(MODULE_KEYS);
  eq(allOn.map((c) => c.components.length), BLOCK_CATEGORIES.map((c) => c.components.length));
});

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} failed, ${passed} passed`);
  (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
} else {
  console.log(`modules-logic: ${passed} tests passed`);
}
