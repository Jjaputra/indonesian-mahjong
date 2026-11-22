import { expect, it, vi } from 'vitest';
// @ts-expect-error Node-runnable script has no declaration file.
import { sumGroups, percent, atThreshold, utcDays, main } from '../../scripts/usage.mjs';

it('sums every group and treats empty usage as zero, but rejects missing/malformed data', () => {
  expect(sumGroups([{ sum: { rowsRead: 3 } }, { sum: { rowsRead: 7 } }], 'rowsRead')).toBe(10);
  expect(sumGroups([], 'requests')).toBe(0);
  for (const groups of [null, [{ sum: {} }], [{ sum: { requests: -1 } }]]) expect(() => sumGroups(groups, 'requests')).toThrow();
});
it('computes percentage and alerts at exactly 70 percent for each daily limit', () => {
  for (const limit of [100000, 5000000]) {
    expect(percent(limit * 0.7, limit)).toBe(70);
    expect(atThreshold(limit * 0.7 - 1, limit)).toBe(false);
    expect(atThreshold(limit * 0.7, limit)).toBe(true);
    expect(atThreshold(limit, limit)).toBe(true);
  }
});
it('uses UTC midnight across month/year boundaries', () => {
  expect(utcDays(new Date('2026-01-01T02:00:00+07:00'))).toEqual([
    { date: '2025-12-31', start: '2025-12-31T00:00:00.000Z', end: '2025-12-31T19:00:00.000Z' },
    { date: '2025-12-30', start: '2025-12-30T00:00:00.000Z', end: '2025-12-31T00:00:00.000Z' },
  ]);
});
const env = { CLOUDFLARE_API_TOKEN: 'secret-token', CLOUDFLARE_ACCOUNT_ID: 'account' };
function api(value: (dataset: string, call: number) => unknown) {
  let call = 0;
  return vi.fn(async (_url: unknown, options: { body: string }) => {
    const { query } = JSON.parse(options.body);
    const dataset = query.match(/(\w+)\(limit:/)[1] as string;
    return new Response(JSON.stringify({ data: { viewer: { accounts: [{ [dataset]: value(dataset, call++) }] } } }));
  });
}
it('exits 2 for missing configuration without making requests', async () => {
  const fetcher = vi.fn(), log = vi.fn();
  expect(await main({ env: {}, fetcher, log })).toBe(2); expect(fetcher).not.toHaveBeenCalled();
  expect(log.mock.calls.flat().join(' ')).toContain('Missing CLOUDFLARE_API_TOKEN');
});
it('adds DO and Workers requests and alerts for yesterday even when today is quiet', async () => {
  const log = vi.fn(), fetcher = api((_dataset, call) => [{ sum: { requests: call >= 4 ? 35000 : 0, rowsRead: 0, rowsWritten: 0 } }]);
  expect(await main({ env, fetcher, log })).toBe(1);
  expect(log.mock.calls.flat().join('\n')).toContain('DO + Workers requests');
  expect(log.mock.calls.flat().join('\n')).toContain('70.0%');
});
it('returns zero for low usage and queries each dataset separately', async () => {
  const fetcher = api(() => []);
  expect(await main({ env, fetcher, log: vi.fn() })).toBe(0); expect(fetcher).toHaveBeenCalledTimes(8);
});
it('continues after a dataset error, prints it, redacts tokens and returns 1', async () => {
  const log = vi.fn(), fetcher = api(dataset => { if (dataset === 'durableObjectsPeriodicGroups') throw new Error('bad field secret-token'); return []; });
  expect(await main({ env, fetcher, log })).toBe(1); expect(fetcher).toHaveBeenCalledTimes(8);
  const output = log.mock.calls.flat().join('\n');
  expect(output).toContain('ERROR'); expect(output).toContain('bad field [redacted]'); expect(output).not.toContain(env.CLOUDFLARE_API_TOKEN);
});
it.each([401, 403, 200])('returns 2 for HTTP/GraphQL auth failure (%s)', async status => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'Authentication error' }] }), { status }));
  expect(await main({ env, fetcher, log: vi.fn() })).toBe(2);
});
