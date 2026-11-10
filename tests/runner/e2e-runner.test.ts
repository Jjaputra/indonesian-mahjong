import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { evaluateOutcome, formatReport, summarize, type VitestJson } from '../e2e-runner';

type FileResult = VitestJson['testResults'][number];
function file(tier = 'tier1-features', statuses: FileResult['assertionResults'][number]['status'][] = ['passed']): FileResult {
  return {
    name: resolve(`tests/${tier}/fixture.test.ts`),
    status: 'passed',
    assertionResults: statuses.map((status, i) => ({ fullName: `case ${i}`, status })),
  };
}
function report(files: FileResult[] = [file()]): VitestJson {
  return { success: true, numTotalTests: files.reduce((n, f) => n + f.assertionResults.length, 0), testResults: files };
}
function gateLine(input: VitestJson): string {
  return formatReport(summarize(input)).split('\n').find((line) => line.startsWith('Tiers 1-4 gate'))!;
}
const gateFiles = () => ['tier1-features', 'tier2-boundary', 'tier3-pairwise', 'tier4-workload'].map((tier) => file(tier));

describe('runner outcome evaluation', () => {
  it('accepts a passing filtered run without requiring all gate tiers', () => {
    expect(evaluateOutcome(0, report())).toBe(0);
  });
  it('rejects a nonzero child exit even with a passing JSON report', () => {
    expect(evaluateOutcome(2, report())).toBe(1);
  });
  it('rejects report-level failure even with passing files', () => {
    expect(evaluateOutcome(0, { ...report(), success: false })).toBe(1);
  });
  it('rejects failed file status after passing assertions and exposes hook diagnostics', () => {
    const input = report([{ ...file(), status: 'failed', message: 'afterAll failed\nstack trace' }]);
    expect(evaluateOutcome(0, input)).toBe(1);
    const tier = summarize(input)[0]!;
    expect(tier.passed).toBe(1);
    expect(tier.failed).toBe(1);
    expect(tier.brokenFiles).toEqual([]);
    expect(tier.failures[0]).toMatchObject({ test: '(file or hook failed)', message: 'afterAll failed' });
  });
  it('rejects assertion failures even if the file and report claim success, without double counting', () => {
    const input = report([{ ...file('tier1-features', ['failed']), status: 'failed' }]);
    expect(evaluateOutcome(0, input)).toBe(1);
    expect(summarize(input)[0]!.failed).toBe(1);
    expect(evaluateOutcome(0, report([file('tier1-features', ['failed'])]))).toBe(1);
  });
  it('rejects load errors and records the broken file', () => {
    const input = report([{ ...file('tier1-features', []), status: 'failed', message: 'Import error' }]);
    expect(evaluateOutcome(0, input)).toBe(1);
    expect(summarize(input)[0]!.brokenFiles).toEqual(['tests/tier1-features/fixture.test.ts']);
  });
  it.each([
    { label: 'no files', files: [] },
    { label: 'empty file', files: [file('tier1-features', [])] },
    { label: 'only skipped assertions', files: [file('tier1-features', ['skipped', 'pending', 'todo', 'disabled'])] },
  ])('rejects reports with no executed assertions: $label', ({ files }) => {
    expect(evaluateOutcome(0, report(files))).toBe(1);
  });
  it('preserves ordinary skips alongside passing assertions', () => {
    const input = report([file('tier1-features', ['passed', 'skipped'])]);
    expect(evaluateOutcome(0, input)).toBe(0);
    expect(summarize(input)[0]).toMatchObject({ passed: 1, failed: 0, skipped: 1, passRate: 1 });
  });
});

describe('runner gate formatting', () => {
  it('marks all four passing tiers complete', () => {
    expect(gateLine(report(gateFiles()))).toContain('100% ✓');
  });
  it('marks filtered or absent tiers incomplete', () => {
    for (const input of [report(), report([])]) {
      expect(gateLine(input)).toContain('INCOMPLETE');
      expect(gateLine(input)).not.toContain('100%');
      expect(formatReport(summarize(input))).toContain('Missing tiers in this run:');
    }
  });
  it('marks skipped gate assertions incomplete without treating them as failures', () => {
    const files = gateFiles();
    files.push(file('tier4-workload', ['skipped']));
    const input = report(files);
    expect(evaluateOutcome(0, input)).toBe(0);
    expect(gateLine(input)).toContain('1 skipped — INCOMPLETE');
    expect(gateLine(input)).not.toContain('100%');
  });
  it('marks a present but empty tier incomplete', () => {
    const files = gateFiles();
    files[3] = file('tier4-workload', []);
    expect(gateLine(report(files))).toContain('INCOMPLETE');
  });
  it('marks a failing complete gate failed', () => {
    const files = gateFiles();
    files[3] = file('tier4-workload', ['failed']);
    expect(gateLine(report(files))).toContain('FAILED');
    expect(gateLine(report(files))).not.toContain('100%');
  });
});
