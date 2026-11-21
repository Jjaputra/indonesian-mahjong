import { resolveUser, type AuthEnv } from './auth';
import { invalidateSettings, readSettings, validSettings } from './settings';

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
      await db.batch(Object.entries(body).map(([key, value]) => db.prepare('INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(key, JSON.stringify(value), Date.now(), user.id)));
      invalidateSettings(db); return reply(await readSettings(env));
    }
  }
  if (request.method === 'GET' && url.pathname === '/admin/users') {
    const q = `%${(url.searchParams.get('q') ?? '').slice(0, 200).replace(/[\\%_]/g, '\\$&')}%`;
    const row = await db.prepare("SELECT json_group_array(json_object('id',id,'name',name,'email',email,'premium',premium)) AS data FROM (SELECT id,name,email,premium FROM users WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 100)").bind(q, q).first<{ data: string }>();
    return reply(JSON.parse(row?.data ?? '[]'));
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
