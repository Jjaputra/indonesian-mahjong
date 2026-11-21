import { resolveUser, wibDay, type AuthEnv, type Database } from './auth';
import { invalidateSettings, readSettings, validSettings } from './settings';

const DAY = 86400000, WIB = 7 * 3600000;
const positiveInt = (raw: string | null, fallback: number, max: number) => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback;
};
async function rows<T>(db: Database, query: string, fields: string[], values: unknown[] = []): Promise<T[]> {
  const object = fields.map(key => `'${key}',${key}`).join(',');
  const row = await db.prepare(`SELECT json_group_array(json_object(${object})) AS data FROM (${query})`).bind(...values).first<{ data: string }>();
  return JSON.parse(row?.data ?? '[]') as T[];
}
interface AdminUser {
  id: string; name: string; email: string | null; picture: string | null; premium: boolean; newsOptIn: boolean;
  createdAt: number; lastSeenAt: number; matchesHosted: number; matchesToday: number; currentRoom: string | null;
}
const userFields = ['id', 'name', 'email', 'picture', 'premium', 'newsOptIn', 'createdAt', 'lastSeenAt', 'matchesHosted', 'matchesToday', 'currentRoom'];
function userQuery(url: URL) {
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  const filter = url.searchParams.get('filter');
  const where = `WHERE (instr(lower(u.email),lower(?))>0 OR instr(lower(u.name),lower(?))>0)${filter === 'premium' ? ' AND u.premium=1' : filter === 'optin' ? ' AND u.news_opt_in=1' : ''}`;
  const sorts: Record<string, string> = { newest: 'u.created_at DESC', oldest: 'u.created_at ASC', active: 'u.last_seen_at DESC', name: 'u.name COLLATE NOCASE ASC', matches: 'matchesHosted DESC' };
  const order = sorts[url.searchParams.get('sort') ?? 'newest'] ?? sorts.newest;
  return { where, order: `${order},u.id ASC`, values: [q, q] };
}
async function listUsers(db: Database, url: URL, day: string, page: number, size: number) {
  const { where, order, values } = userQuery(url);
  const users = await rows<AdminUser>(db, `SELECT u.id,u.name,u.email,u.picture,u.premium,u.news_opt_in AS newsOptIn,
    u.created_at AS createdAt,u.last_seen_at AS lastSeenAt,
    (SELECT COUNT(*) FROM daily_matches m WHERE m.user_id=u.id) AS matchesHosted,
    (SELECT COUNT(*) FROM daily_matches m WHERE m.user_id=u.id AND m.wib_day=?) AS matchesToday,
    (SELECT code FROM account_rooms r WHERE r.user_id=u.id) AS currentRoom
    FROM users u ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
  userFields, [day, ...values, size, (page - 1) * size]);
  return users.map(u => ({ ...u, premium: !!u.premium, newsOptIn: !!u.newsOptIn }));
}
const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const wibISO = (at: number) => new Date(at + WIB).toISOString().replace('Z', '+07:00');

export const isAdmin = (env: AuthEnv, id: string) => (env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(id);
export async function adminRoute(request: Request, env: AuthEnv, cors: Record<string, string>): Promise<Response> {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });
  const user = await resolveUser(request, env);
  if (!user || !isAdmin(env, user.id)) return reply({ message: 'Akses ditolak.' }, 403);
  const db = env.DB!, url = new URL(request.url);
  if (url.pathname === '/admin/settings') {
    if (request.method === 'GET') return reply(await readSettings(env));
    if (request.method === 'PUT') {
      const body: unknown = await request.json().catch(() => null);
      if (!validSettings(body)) return reply({ message: 'Pengaturan tidak valid.' }, 400);
      const stored = await rows<{ key: string; value: string }>(db, 'SELECT key,value FROM settings', ['key', 'value']);
      const changed = Object.entries(body).filter(([key, value]) => {
        const previous = stored.find(s => s.key === key);
        try { return !previous || JSON.parse(previous.value) !== value; } catch { return true; }
      });
      const at = Date.now();
      if (changed.length) await db.batch(changed.flatMap(([key, value]) => [
        db.prepare('INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(key, JSON.stringify(value), at, user.id),
        db.prepare('INSERT INTO setting_changes(key,value,updated_at,updated_by) VALUES(?,?,?,?)').bind(key, JSON.stringify(value), at, user.id),
      ]));
      invalidateSettings(db); return reply(await readSettings(env));
    }
  }
  if (request.method === 'GET' && url.pathname === '/admin/users') {
    const page = positiveInt(url.searchParams.get('page'), 1, Math.floor(Number.MAX_SAFE_INTEGER / 100));
    const size = positiveInt(url.searchParams.get('size'), 50, 100);
    const { where, values } = userQuery(url);
    const total = await db.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).bind(...values).first<{ n: number }>();
    return reply({ total: total?.n ?? 0, page, size, users: await listUsers(db, url, wibDay(Date.now()), page, size) });
  }
  if (request.method === 'GET' && url.pathname === '/admin/users.csv') {
    const day = wibDay(Date.now()), { where, order, values } = userQuery(url);
    const encoder = new TextEncoder(), size = 1000;
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode('id,name,email,premium,news_opt_in,created_at,last_seen_at,matches_hosted\r\n')); },
      async pull(controller) {
        const statement = db.prepare(`SELECT u.id,u.name,u.email,u.premium,u.news_opt_in AS newsOptIn,
          u.created_at AS createdAt,u.last_seen_at AS lastSeenAt,
          (SELECT COUNT(*) FROM daily_matches m WHERE m.user_id=u.id) AS matchesHosted
          FROM users u ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...values, size, offset);
        // The shared auth interface exposes only first/run; D1 also supports normal result rows.
        const { results } = await (statement as typeof statement & { all<T>(): Promise<{ results: T[] }> }).all<AdminUser>();
        if (results.length) controller.enqueue(encoder.encode(results.map(u =>
          [u.id, u.name, u.email, u.premium ? 1 : 0, u.newsOptIn ? 1 : 0, wibISO(u.createdAt), wibISO(u.lastSeenAt), u.matchesHosted].map(csvCell).join(',')).join('\r\n') + '\r\n'));
        offset += results.length;
        if (results.length < size) controller.close();
      },
    });
    return new Response(stream, { headers: { ...cors, 'Cache-Control': 'no-store', 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="maciokyu-users-${day.replace(/-/g, '')}.csv"` } });
  }
  if (request.method === 'GET' && url.pathname === '/admin/stats') {
    const today = Math.floor((Date.now() + WIB) / DAY) * DAY - WIB, end = today + DAY, week = today - 6 * DAY, start = today - 29 * DAY;
    const users = await db.prepare(`SELECT COUNT(*) AS total,
      COUNT(CASE WHEN created_at>=? AND created_at<? THEN 1 END) AS newToday,
      COUNT(CASE WHEN created_at>=? AND created_at<? THEN 1 END) AS new7d,
      (SELECT COUNT(*) FROM (SELECT id FROM users WHERE last_seen_at>=? AND last_seen_at<? UNION SELECT user_id FROM daily_matches WHERE wib_day>=? AND wib_day<=?)) AS active7d,
      COUNT(CASE WHEN premium=1 THEN 1 END) AS premium,COUNT(DISTINCT CASE WHEN news_opt_in=1 THEN email END) AS newsOptIn FROM users`)
      .bind(today, end, week, end, week, end, wibDay(week), wibDay(today)).first();
    const matches = await db.prepare('SELECT COUNT(CASE WHEN wib_day=? THEN 1 END) AS today,COUNT(*) AS last7d FROM daily_matches WHERE wib_day>=? AND wib_day<=?')
      .bind(wibDay(today), wibDay(week), wibDay(today)).first();
    const daily = await rows(db, `WITH RECURSIVE days(at) AS (SELECT ? UNION ALL SELECT at+? FROM days WHERE at<?),
      new_users AS (SELECT date(created_at/1000,'unixepoch','+7 hours') AS day,COUNT(*) AS n FROM users WHERE created_at>=? AND created_at<? GROUP BY day),
      activity AS (SELECT date(last_seen_at/1000,'unixepoch','+7 hours') AS day,id FROM users WHERE last_seen_at>=? AND last_seen_at<?
        UNION SELECT wib_day,user_id FROM daily_matches WHERE wib_day>=? AND wib_day<=?),
      active_users AS (SELECT day,COUNT(*) AS n FROM activity GROUP BY day),
      match_days AS (SELECT wib_day AS day,COUNT(*) AS n FROM daily_matches WHERE wib_day>=? AND wib_day<=? GROUP BY wib_day)
      SELECT date(at/1000,'unixepoch','+7 hours') AS day,COALESCE(nu.n,0) AS newUsers,COALESCE(au.n,0) AS activeUsers,COALESCE(md.n,0) AS matches
      FROM days LEFT JOIN new_users nu ON nu.day=date(at/1000,'unixepoch','+7 hours') LEFT JOIN active_users au ON au.day=date(at/1000,'unixepoch','+7 hours')
      LEFT JOIN match_days md ON md.day=date(at/1000,'unixepoch','+7 hours') ORDER BY at`,
    ['day', 'newUsers', 'activeUsers', 'matches'], [start, DAY, today, start, end, start, end, wibDay(start), wibDay(today), wibDay(start), wibDay(today)]);
    return reply({ users, matches, daily });
  }
  if (request.method === 'GET' && url.pathname === '/admin/audit') {
    const limit = positiveInt(url.searchParams.get('limit'), 50, 500);
    const entries = await rows<{ at: number; byId: string; byName: string; kind: 'setting' | 'premium'; key: string | null; value: string | null; userId: string | null; userName: string | null; premium: number | null }>(db,
      `SELECT c.*,COALESCE(u.name,c.byId) AS byName,COALESCE(target.name,c.userId) AS userName FROM (
        SELECT updated_at AS at,updated_by AS byId,'premium' AS kind,NULL AS key,NULL AS value,user_id AS userId,premium,id AS seq FROM admin_changes
        UNION ALL SELECT updated_at,updated_by,'setting',key,value,NULL,NULL,id FROM setting_changes
        UNION ALL SELECT s.updated_at,s.updated_by,'setting',s.key,s.value,NULL,NULL,0 FROM settings s
          WHERE s.updated_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM setting_changes h WHERE h.key=s.key AND h.updated_at=s.updated_at AND h.updated_by IS s.updated_by AND h.value=s.value)
      ) c LEFT JOIN users u ON u.id=c.byId LEFT JOIN users target ON target.id=c.userId ORDER BY c.at DESC,c.kind ASC,c.seq DESC,c.key ASC LIMIT ?`,
    ['at', 'byId', 'byName', 'kind', 'key', 'value', 'userId', 'userName', 'premium'], [limit]);
    return reply({ entries: entries.map(e => ({ at: e.at, by: { id: e.byId, name: e.byName }, kind: e.kind,
      ...(e.kind === 'setting' ? { key: e.key, value: JSON.parse(e.value!) } : { userId: e.userId, userName: e.userName, premium: !!e.premium }) })) });
  }
  if (request.method === 'GET' && url.pathname === '/admin/news-emails') {
    const row = await db.prepare('SELECT json_group_array(email) AS data FROM (SELECT DISTINCT email FROM users WHERE news_opt_in=1 AND email IS NOT NULL ORDER BY email)').first<{ data: string }>();
    return reply(JSON.parse(row?.data ?? '[]'));
  }
  const match = /^\/admin\/users\/([^/]+)\/premium$/.exec(url.pathname);
  if (request.method === 'PUT' && match) {
    const body = await request.json().catch(() => null) as { premium?: unknown } | null;
    if (typeof body?.premium !== 'boolean') return reply({ message: 'Pilihan Premium tidak valid.' }, 400);
    if (!await db.prepare('SELECT id FROM users WHERE id=?').bind(match[1]).first()) return reply({ message: 'Pengguna tidak ditemukan.' }, 404);
    await db.batch([db.prepare('UPDATE users SET premium=? WHERE id=?').bind(body.premium ? 1 : 0, match[1]), db.prepare('INSERT INTO admin_changes(user_id,premium,updated_at,updated_by) VALUES(?,?,?,?)').bind(match[1], body.premium ? 1 : 0, Date.now(), user.id)]);
    return reply({ ok: true });
  }
  return reply({ message: 'Tidak ditemukan.' }, 404);
}
