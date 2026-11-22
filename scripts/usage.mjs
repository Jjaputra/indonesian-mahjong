import { pathToFileURL } from 'node:url';

const endpoint = 'https://api.cloudflare.com/client/v4/graphql';
// Dataset references: developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/
// and developers.cloudflare.com/d1/observability/metrics-analytics/.
const datasets = {
  durableObjectsPeriodicGroups: ['rowsWritten', 'rowsRead'],
  durableObjectsInvocationsAdaptiveGroups: ['requests'],
  workersInvocationsAdaptive: ['requests'],
  d1AnalyticsAdaptiveGroups: ['rowsWritten', 'rowsRead'],
};
export const metrics = [
  { name: 'DO rows written', limit: 100000, sources: [['durableObjectsPeriodicGroups', 'rowsWritten']] },
  { name: 'DO rows read', limit: 5000000, sources: [['durableObjectsPeriodicGroups', 'rowsRead']] },
  { name: 'DO + Workers requests', limit: 100000, sources: [['durableObjectsInvocationsAdaptiveGroups', 'requests'], ['workersInvocationsAdaptive', 'requests']] },
  { name: 'D1 rows written', limit: 100000, sources: [['d1AnalyticsAdaptiveGroups', 'rowsWritten']] },
  { name: 'D1 rows read', limit: 5000000, sources: [['d1AnalyticsAdaptiveGroups', 'rowsRead']] },
];

export function sumGroups(groups, field) {
  if (!Array.isArray(groups)) throw new Error('Missing dataset results');
  return groups.reduce((total, group) => {
    const value = group?.sum?.[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid sum.${field}`);
    return total + value;
  }, 0);
}
export const percent = (value, limit) => value / limit * 100;
export const atThreshold = (value, limit) => value >= limit * 0.7;
export function utcDays(now = new Date()) {
  const start = new Date(now.toISOString().slice(0, 10));
  return [start, new Date(start.getTime() - 86400000)].map(date => ({
    date: date.toISOString().slice(0, 10), start: date.toISOString(),
    end: new Date(Math.min(date.getTime() + 86400000, now.getTime())).toISOString(),
  }));
}

export async function main({ env = process.env, fetcher = fetch, now = new Date(), log = console.log } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN, account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    log('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID; set both environment variables.');
    return 2;
  }
  // Redact even an API error that unexpectedly echoes credentials.
  const safe = value => String(value).split(token).join('[redacted]');
  const days = utcDays(now), results = [];
  let authFailed = false, queryFailed = false, exceeded = false;
  for (const day of days) {
    const result = {};
    for (const [dataset, fields] of Object.entries(datasets)) {
      try {
        // Separate requests keep a schema/permission error from hiding other datasets.
        // No dimensions: each response aggregates the entire account/time window.
        const response = await fetcher(endpoint, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ query: `query Usage($account: string!, $start: string!, $end: string!) {
            viewer { accounts(filter: {accountTag: $account}) {
              ${dataset}(limit: 10000, filter: {datetime_geq: $start, datetime_lt: $end}) { sum { ${fields.join(' ')} } }
            } }
          }`, variables: { account, start: day.start, end: day.end } }),
        });
        if (response.status === 401 || response.status === 403) authFailed = true;
        const body = await response.json();
        const errors = body.errors?.map(error => error.message ?? 'Unknown GraphQL error').join('; ');
        if (/auth|permission|forbidden|access denied|not authorized/i.test(errors ?? '')) authFailed = true;
        if (!response.ok || errors) throw new Error(errors || `HTTP ${response.status}`);
        const accounts = body.data?.viewer?.accounts;
        if (!accounts?.length) throw new Error('No account returned; check account ID and token permissions');
        result[dataset] = Object.fromEntries(fields.map(field => [field, sumGroups(accounts.flatMap(a => a[dataset] ?? [null]), field)]));
      } catch (error) {
        queryFailed = true;
        result[dataset] = { error: safe(error.message) };
      }
    }
    results.push(result);
  }
  log(`UTC usage: today ${days[0].date} (so far), yesterday ${days[1].date}`);
  log('Metric | Today | Yesterday | Daily limit | % today / yesterday');
  for (const metric of metrics) {
    const values = results.map((result, day) => {
      const errors = metric.sources.filter(([source]) => result[source].error).map(([source]) => `${source}: ${result[source].error}`);
      if (errors.length) return { text: `ERROR (${errors.join('; ')})`, pct: 'ERROR' };
      const value = metric.sources.reduce((total, [source, field]) => total + result[source][field], 0);
      if (atThreshold(value, metric.limit)) {
        exceeded = true;
        log(`ALERT: ${metric.name} on ${days[day].date} reached ${percent(value, metric.limit).toFixed(1)}% (threshold 70%).`);
      }
      return { text: value.toLocaleString('en-US'), pct: `${percent(value, metric.limit).toFixed(1)}%` };
    });
    log(`${metric.name} | ${values[0].text} | ${values[1].text} | ${metric.limit.toLocaleString('en-US')} | ${values[0].pct} / ${values[1].pct}`);
  }
  return authFailed ? 2 : queryFailed || exceeded ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
