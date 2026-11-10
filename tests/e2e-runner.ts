/**
 * Standalone opaque-box E2E runner.
 *
 * Runs the whole Vitest suite as a black box (child process + JSON reporter), then buckets every
 * test file into its tier by path and prints per-tier pass rates. It imports nothing from src/.
 *
 * Usage (Node >= 22.6 strips TypeScript types natively; Node 24 needs no flag):
 *   node tests/e2e-runner.ts                 # full suite
 *   node tests/e2e-runner.ts tier4-workload  # only files whose path contains the filter(s)
 *   node tests/e2e-runner.ts --json out.json # also write the per-tier summary as JSON
 *
 * Exit code: 0 when every executed test passed (expected-failure pins count as passes), else 1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

interface TierDef {
  id: string;
  title: string;
  /** Matches a test file path relative to the repo root (forward slashes) */
  match: (path: string) => boolean;
}

const TIERS: TierDef[] = [
  { id: 'tier1', title: 'Tier 1 · Feature coverage', match: (p) => p.startsWith('tests/tier1-features/') },
  { id: 'tier2', title: 'Tier 2 · Boundary & corner', match: (p) => p.startsWith('tests/tier2-boundary/') },
  { id: 'tier3', title: 'Tier 3 · Cross-feature pairwise', match: (p) => p.startsWith('tests/tier3-pairwise/') },
  { id: 'tier4', title: 'Tier 4 · Real-world scenarios', match: (p) => p.startsWith('tests/tier4-workload/') },
  { id: 'tier5', title: 'Tier 5 · Adversarial hardening', match: (p) => p.startsWith('tests/tier5-adversarial/') },
  {
    id: 'modules',
    title: 'Module suites (core/kim/scoring/storage/audio/ui)',
    match: (p) => /^tests\/(core|kim|scoring|storage|audio|ui|ai)\//.test(p) || /^tests\/[^/]+\.test\.tsx?$/.test(p),
  },
  { id: 'other', title: 'Other test files', match: () => true },
];

/** Tiers 1-4 make up the Final Phase 1 "100% E2E pass" gate (PROJECT.md F32). */
const GATE_TIERS = new Set(['tier1', 'tier2', 'tier3', 'tier4']);

interface VitestAssertion {
  fullName: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' | 'disabled';
  failureMessages?: string[];
}

interface VitestFileResult {
  name: string;
  status: string;
  message?: string;
  assertionResults: VitestAssertion[];
}

interface VitestJson {
  success: boolean;
  numTotalTests: number;
  testResults: VitestFileResult[];
}

export interface TierSummary {
  id: string;
  title: string;
  files: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Files that failed to load (syntax/import errors) — counted as failures */
  brokenFiles: string[];
  failures: { file: string; test: string; message: string }[];
  passRate: number | null;
}

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function toRepoPath(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

function runVitest(filters: string[], outFile: string): number {
  // Launch Vitest's own entry with this Node binary: no shell, identical on Windows and POSIX.
  const cli = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  const args = [cli, 'run', '--reporter=json', `--outputFile=${outFile}`, ...filters];
  const res = spawnSync(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

export function summarize(report: VitestJson): TierSummary[] {
  const tiers = new Map<string, TierSummary>(
    TIERS.map((t) => [t.id, { id: t.id, title: t.title, files: 0, passed: 0, failed: 0, skipped: 0, brokenFiles: [], failures: [], passRate: null }])
  );
  for (const file of report.testResults) {
    const path = toRepoPath(file.name);
    const tier = tiers.get(TIERS.find((t) => t.match(path))!.id)!;
    tier.files++;
    if (file.assertionResults.length === 0 && file.status === 'failed') {
      tier.brokenFiles.push(path);
      tier.failed++;
      tier.failures.push({ file: path, test: '(file failed to load)', message: (file.message ?? '').split('\n')[0] ?? '' });
      continue;
    }
    for (const a of file.assertionResults) {
      if (a.status === 'passed') tier.passed++;
      else if (a.status === 'failed') {
        tier.failed++;
        tier.failures.push({ file: path, test: a.fullName, message: (a.failureMessages?.[0] ?? '').split('\n')[0] ?? '' });
      } else tier.skipped++;
    }
  }
  for (const t of tiers.values()) {
    const ran = t.passed + t.failed;
    t.passRate = ran === 0 ? null : t.passed / ran;
  }
  return [...tiers.values()];
}

function pct(rate: number | null): string {
  return rate === null ? '   n/a' : `${(rate * 100).toFixed(1).padStart(5)}%`;
}

export function formatReport(tiers: TierSummary[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('E2E opaque-box runner — per-tier results');
  lines.push('─'.repeat(78));
  lines.push(`${'Tier'.padEnd(50)}${'Files'.padStart(6)}${'Pass'.padStart(7)}${'Fail'.padStart(6)}${'Skip'.padStart(6)}${'Rate'.padStart(8)}`);
  for (const t of tiers) {
    if (t.files === 0 && t.id === 'other') continue;
    lines.push(`${t.title.padEnd(50)}${String(t.files).padStart(6)}${String(t.passed).padStart(7)}${String(t.failed).padStart(6)}${String(t.skipped).padStart(6)}${pct(t.passRate).padStart(8)}`);
  }
  const all = tiers.reduce((a, t) => ({ p: a.p + t.passed, f: a.f + t.failed }), { p: 0, f: 0 });
  const gate = tiers.filter((t) => GATE_TIERS.has(t.id)).reduce((a, t) => ({ p: a.p + t.passed, f: a.f + t.failed, files: a.files + t.files }), { p: 0, f: 0, files: 0 });
  lines.push('─'.repeat(78));
  lines.push(`Overall: ${all.p}/${all.p + all.f} passed (${pct(all.p + all.f ? all.p / (all.p + all.f) : null).trim()})`);
  lines.push(
    `Tiers 1-4 gate (F32): ${gate.files === 0 ? 'no tier 1-4 files found' : `${gate.p}/${gate.p + gate.f} passed${gate.f === 0 ? ' — 100% ✓' : ' — NOT at 100% ✗'}`}`
  );
  const missing = tiers.filter((t) => GATE_TIERS.has(t.id) && t.files === 0).map((t) => t.title);
  if (missing.length) lines.push(`Missing tier directories: ${missing.join('; ')}`);
  const failures = tiers.flatMap((t) => t.failures);
  if (failures.length) {
    lines.push('');
    lines.push(`Failures (${failures.length}):`);
    for (const f of failures.slice(0, 50)) lines.push(`  ✗ ${f.file} › ${f.test}\n      ${f.message}`);
    if (failures.length > 50) lines.push(`  … and ${failures.length - 50} more`);
  }
  return lines.join('\n');
}

function main(argv: string[]): number {
  const filters: string[] = [];
  let jsonOut: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') jsonOut = argv[++i];
    else filters.push(argv[i]!);
  }
  const dir = mkdtempSync(join(tmpdir(), 'itm-e2e-'));
  const outFile = join(dir, 'vitest.json');
  try {
    const exit = runVitest(filters, outFile);
    if (!existsSync(outFile)) {
      console.error(`Vitest produced no report (exit code ${exit}).`);
      return 1;
    }
    const report = JSON.parse(readFileSync(outFile, 'utf8')) as VitestJson;
    const tiers = summarize(report);
    console.log(formatReport(tiers));
    if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify({ generatedAt: new Date().toISOString(), filters, tiers }, null, 2));
    const failed = tiers.reduce((n, t) => n + t.failed, 0);
    return failed === 0 && report.testResults.length > 0 ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Run only when executed directly (not when imported by a test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
