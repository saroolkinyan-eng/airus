const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONSENT_VERSION = '2026-08-28';

const DEFAULT_ADMIN_LOGIN = 'sarosaasa';
const DEFAULT_ADMIN_PBKDF2_ITERATIONS = 120000;
const DEFAULT_ADMIN_SALT_HEX = 'e08c84793c2d2bbfda20bcbd2317eaec5d70a4386703ab61';
const DEFAULT_ADMIN_PASSWORD_HASH_HEX = '0907ef3e41e9dd959eb22dbd90b92ca5908837129b2fda01b782d2d426702f81';

const ALLOWED_CITIES = new Set(['Челябинск', 'Уфа']);
const ALLOWED_STATUSES = new Set(['Новая', 'В работе', 'Ожидает оплаты', 'Выполнена']);
const encoder = new TextEncoder();
let schemaPromise = null;

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function json(data, status = 200, headers = {}) {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers: h });
}

function text(body, status = 200, headers = {}) {
  const h = new Headers(headers);
  h.set('Content-Type', 'text/plain; charset=utf-8');
  return new Response(body, { status, headers: h });
}

function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}

function cloneResponse(response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });
}

function withSecurityHeaders(response, pathname) {
  const res = cloneResponse(response);
  const headers = res.headers;
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https://climber74.ru; style-src 'self'; script-src 'self' 'sha256-yhwwvv8h1VvC+KbdpRdq9tpUptBGFciwn4HYOzQJB+M='; connect-src 'self'; font-src 'self'"
  );

  if (pathname.startsWith('/admin')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('Cache-Control', 'no-store');
  } else if (pathname.startsWith('/api/')) {
    headers.set('Cache-Control', 'no-store');
  } else if ((headers.get('Content-Type') || '').includes('text/html')) {
    headers.set('Cache-Control', 'no-cache');
  }

  return res;
}

function cleanText(value, maxLen = 160) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, maxLen);
}

function cleanPhone(value) {
  return cleanText(value, 40).replace(/[^\d+()\-\s]/g, '');
}

function phoneIsValid(value) {
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    const raw = pair.slice(index + 1).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(raw); } catch (_) { out[key] = raw; }
  }
  return out;
}

function setSessionCookie(token, ttlMs) {
  return `airus_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(ttlMs / 1000)}`;
}

function clearSessionCookie() {
  return 'airus_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (hex.length % 2) throw new Error('Invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}

async function pbkdf2Hex(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function verifyAdminPassword(env, login, password) {
  const expectedLogin = cleanText(env.ADMIN_LOGIN || DEFAULT_ADMIN_LOGIN, 100);
  if (!login || !password || login !== expectedLogin) return false;

  // Preferred production override: store ADMIN_PASSWORD as a Cloudflare secret.
  if (typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length > 0) {
    const [actual, expected] = await Promise.all([sha256Bytes(password), sha256Bytes(env.ADMIN_PASSWORD)]);
    return timingSafeEqualBytes(actual, expected);
  }

  const saltHex = cleanText(env.ADMIN_PASSWORD_SALT_HEX || DEFAULT_ADMIN_SALT_HEX, 128);
  const hashHex = cleanText(env.ADMIN_PASSWORD_HASH_HEX || DEFAULT_ADMIN_PASSWORD_HASH_HEX, 256).toLowerCase();
  const iterations = Number(env.ADMIN_PBKDF2_ITERATIONS || DEFAULT_ADMIN_PBKDF2_ITERATIONS);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 2000000) return false;

  const calculatedHex = await pbkdf2Hex(password, saltHex, iterations);
  return timingSafeEqualBytes(hexToBytes(calculatedHex), hexToBytes(hashHex));
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function tokenHash(token) {
  return bytesToHex(await sha256Bytes(token));
}

async function readJson(request, maxBytes = 32 * 1024) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > maxBytes) throw new HttpError(413, 'Слишком большой запрос');
  const raw = await request.text();
  if (new Blob([raw]).size > maxBytes) throw new HttpError(413, 'Слишком большой запрос');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch (_) { throw new HttpError(400, 'Некорректный JSON'); }
}

function dbRequired(env) {
  if (!env.DB) throw new HttpError(503, 'Cloudflare D1 не привязан к Worker');
  return env.DB;
}

async function ensureSchema(env) {
  const db = dbRequired(env);
  if (!schemaPromise) {
    schemaPromise = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        city TEXT DEFAULT 'Челябинск',
        zhk TEXT,
        street TEXT DEFAULT '',
        house TEXT,
        entrance TEXT,
        flat TEXT,
        floor TEXT DEFAULT '',
        service TEXT,
        comment TEXT,
        status TEXT DEFAULT 'Новая',
        admin_note TEXT DEFAULT '',
        next_contact TEXT DEFAULT '',
        consent_at DATETIME,
        consent_version TEXT DEFAULT '',
        source TEXT DEFAULT 'website',
        is_read INTEGER DEFAULT 0,
        viewed_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS order_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        label TEXT NOT NULL,
        details TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at INTEGER NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at)')
    ]).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function clientIp(request) {
  return cleanText(request.headers.get('CF-Connecting-IP') || 'unknown', 80);
}

async function enforceRateLimit(env, request, { prefix, windowMs, max }) {
  const db = dbRequired(env);
  const now = Date.now();
  const resetAt = now + windowMs;
  const key = `${prefix}:${clientIp(request)}`;
  const result = await db.prepare(`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
    RETURNING count, reset_at
  `).bind(key, resetAt, now, now).run();

  const row = result.results?.[0] || { count: 1, reset_at: resetAt };
  if (Number(row.count) > max) {
    const retryAfter = Math.max(1, Math.ceil((Number(row.reset_at) - now) / 1000));
    throw new HttpError(429, 'Слишком много запросов. Повторите попытку позже.', { 'Retry-After': String(retryAfter) });
  }
}

async function getAdminSession(env, request) {
  const token = parseCookies(request).airus_admin_session;
  if (!token) return null;
  const hash = await tokenHash(token);
  const now = Date.now();
  const row = await env.DB.prepare('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?').bind(hash).first();
  if (!row || Number(row.expires_at) <= now) {
    if (row) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(hash).run();
    return { expired: true, hash };
  }
  return { expired: false, hash, expiresAt: Number(row.expires_at) };
}

async function requireAdmin(env, request) {
  const session = await getAdminSession(env, request);
  if (!session || session.expired) {
    throw new HttpError(
      401,
      session?.expired ? 'Сессия истекла' : 'Требуется вход в админ-панель',
      { 'Set-Cookie': clearSessionCookie() }
    );
  }
  return session;
}

async function requireAdminMutation(env, request) {
  if ((request.headers.get('X-Requested-With') || '').toLowerCase() !== 'airus-admin') {
    throw new HttpError(403, 'Запрос отклонён');
  }
  return requireAdmin(env, request);
}

function readableFieldChange(label, before, after) {
  const a = cleanText(before, 300);
  const b = cleanText(after, 300);
  if (a === b) return '';
  if (!a && b) return `${label}: ${b}`;
  if (a && !b) return `${label}: очищено`;
  return `${label}: ${a} → ${b}`;
}

function eventStatement(db, orderId, eventType, label, details = '') {
  return db.prepare('INSERT INTO order_events (order_id, event_type, label, details) VALUES (?, ?, ?, ?)')
    .bind(orderId, cleanText(eventType, 60), cleanText(label, 180), cleanText(details, 1200));
}

function csvCell(value) {
  let valueText = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@]/.test(valueText)) valueText = `'${valueText}`;
  return `"${valueText.replace(/"/g, '""')}"`;
}

async function handleCreateOrder(request, env) {
  await enforceRateLimit(env, request, { prefix: 'orders', windowMs: 10 * 60 * 1000, max: 8 });
  const o = await readJson(request);

  // Honeypot for common form bots. Do not reveal that the submission was discarded.
  if (cleanText(o.website, 120)) return json({ ok: true, id: null });

  const name = cleanText(o.name, 80);
  const phone = cleanPhone(o.phone);
  const city = cleanText(o.city, 40);
  const zhk = cleanText(o.zhk, 120);
  const address = cleanText(o.house || o.street, 180);
  const entrance = cleanText(o.entrance, 30);
  const flat = cleanText(o.flat, 30);
  const floor = cleanText(o.floor, 30);
  const service = cleanText(o.service, 120) || 'Коллективная мойка балконов';
  const comment = cleanText(o.comment, 1200);
  const consent = o.consent === true || o.consent === 'true' || o.consent === 'on' || o.consent === 1 || o.consent === '1';

  if (name.length < 2) throw new HttpError(400, 'Укажите имя');
  if (!phoneIsValid(phone)) throw new HttpError(400, 'Проверьте номер телефона');
  if (!ALLOWED_CITIES.has(city)) throw new HttpError(400, 'Выберите город из списка');
  if (!zhk) throw new HttpError(400, 'Укажите ЖК или выберите другой адрес');
  if (!address) throw new HttpError(400, 'Укажите адрес дома');
  if (!consent) throw new HttpError(400, 'Нужно подтвердить согласие на обработку персональных данных');

  const result = await env.DB.prepare(`INSERT INTO orders
    (name, phone, city, zhk, street, house, entrance, flat, floor, service, comment, status, admin_note, next_contact, consent_at, consent_version, source, is_read, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 0, CURRENT_TIMESTAMP)`)
    .bind(name, phone, city, zhk, '', address, entrance, flat, floor, service, comment, 'Новая', '', '', CONSENT_VERSION, 'website')
    .run();

  const id = Number(result.meta?.last_row_id || 0);
  if (!id) throw new HttpError(500, 'Не удалось сохранить заявку. Позвоните нам по телефону.');
  await eventStatement(env.DB, id, 'created', 'Заявка создана', `${service} · ${city}, ${address}`).run();
  return json({ ok: true, id }, 201);
}

async function handleLogin(request, env) {
  await enforceRateLimit(env, request, { prefix: 'login', windowMs: 15 * 60 * 1000, max: 8 });
  const body = await readJson(request);
  const login = cleanText(body.login, 100);
  const password = String(body.password || '');
  const rememberDevice = body.rememberDevice !== false;

  if (!(await verifyAdminPassword(env, login, password))) {
    throw new HttpError(401, 'Неверный логин или пароль');
  }

  const token = randomToken(32);
  const hash = await tokenHash(token);
  const now = Date.now();
  const ttlMs = rememberDevice ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS;
  const expiresAt = now + ttlMs;

  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(now - 24 * 60 * 60 * 1000),
    env.DB.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)').bind(hash, now, expiresAt)
  ]);

  const response = json({
    ok: true,
    remembered: rememberDevice,
    expiresAt,
    user: { login: cleanText(env.ADMIN_LOGIN || DEFAULT_ADMIN_LOGIN, 100), role: 'admin' }
  });
  response.headers.set('Set-Cookie', setSessionCookie(token, ttlMs));
  return response;
}

async function handleLogout(request, env) {
  const session = await requireAdminMutation(env, request);
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(session.hash).run();
  const response = json({ ok: true });
  response.headers.set('Set-Cookie', clearSessionCookie());
  return response;
}

async function handleAdminMe(request, env) {
  await requireAdmin(env, request);
  return json({ ok: true, user: { login: cleanText(env.ADMIN_LOGIN || DEFAULT_ADMIN_LOGIN, 100), role: 'admin' } });
}

async function handleOrdersList(request, env) {
  await requireAdmin(env, request);
  const result = await env.DB.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  return json(result.results || []);
}

async function handleOrderEvents(request, env, id) {
  await requireAdmin(env, request);
  const result = await env.DB.prepare('SELECT id, event_type, label, details, created_at FROM order_events WHERE order_id = ? ORDER BY id DESC LIMIT 100')
    .bind(id).all();
  return json(result.results || []);
}

async function handleUpdateOrder(request, env, id) {
  await requireAdminMutation(env, request);
  const current = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'Заявка не найдена');

  const body = await readJson(request);
  const updates = [];
  const values = [];
  const events = [];

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = cleanText(body.status, 40);
    if (!ALLOWED_STATUSES.has(status)) throw new HttpError(400, 'Некорректный статус');
    updates.push('status = ?');
    values.push(status);
    if (status !== current.status) events.push(['status', 'Статус изменён', readableFieldChange('Статус', current.status, status)]);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'admin_note')) {
    const note = cleanText(body.admin_note, 3000);
    updates.push('admin_note = ?');
    values.push(note);
    if (note !== String(current.admin_note || '')) events.push(['note', 'Заметка обновлена', note || 'Заметка очищена']);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'next_contact')) {
    const nextContact = cleanText(body.next_contact, 40);
    if (nextContact && Number.isNaN(Date.parse(nextContact))) throw new HttpError(400, 'Некорректная дата следующего контакта');
    updates.push('next_contact = ?');
    values.push(nextContact);
    if (nextContact !== String(current.next_contact || '')) events.push(['contact', 'Следующий контакт изменён', readableFieldChange('Контакт', current.next_contact, nextContact)]);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_read')) {
    const isRead = body.is_read === true || body.is_read === 1 || body.is_read === '1';
    updates.push('is_read = ?');
    values.push(isRead ? 1 : 0);
    if (isRead && !Number(current.is_read)) {
      updates.push('viewed_at = CURRENT_TIMESTAMP');
      events.push(['viewed', 'Заявка просмотрена', 'Открыта в админ-панели']);
    }
  }

  if (!updates.length) throw new HttpError(400, 'Нет данных для изменения');
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const statements = [env.DB.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).bind(...values)];
  for (const [type, label, details] of events) statements.push(eventStatement(env.DB, id, type, label, details));
  const results = await env.DB.batch(statements);
  const changes = Number(results?.[0]?.meta?.changes || 0);
  if (!changes) throw new HttpError(404, 'Заявка не найдена');
  return json({ ok: true, changes });
}

async function handleDeleteOrder(request, env, id) {
  await requireAdminMutation(env, request);
  const current = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'Заявка не найдена');

  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM order_events WHERE order_id = ?').bind(id),
    env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id)
  ]);
  const changes = Number(results?.[1]?.meta?.changes || 0);
  if (!changes) throw new HttpError(404, 'Заявка не найдена');
  return json({ ok: true, changes });
}

async function handleExport(request, env) {
  await requireAdmin(env, request);
  const result = await env.DB.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  const rows = result.results || [];
  const columns = [
    'id', 'created_at', 'status', 'city', 'zhk', 'house', 'entrance', 'flat', 'floor',
    'service', 'name', 'phone', 'comment', 'admin_note', 'next_contact', 'is_read', 'viewed_at', 'updated_at', 'consent_at', 'consent_version'
  ];
  const body = [columns.join(';')]
    .concat(rows.map((row) => columns.map((col) => csvCell(row[col])).join(';')))
    .join('\r\n');
  const response = new Response(`\ufeff${body}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="airus-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
  return response;
}

function parseOrderId(pathname, suffix = '') {
  const prefix = '/api/orders/';
  if (!pathname.startsWith(prefix)) return null;
  let tail = pathname.slice(prefix.length);
  if (suffix) {
    if (!tail.endsWith(suffix)) return null;
    tail = tail.slice(0, -suffix.length);
  }
  if (!/^\d+$/.test(tail)) return null;
  const id = Number(tail);
  return Number.isInteger(id) && id > 0 ? id : null;
}


async function serveAsset(request, env, url) {
  if (!env.ASSETS) throw new HttpError(503, 'Cloudflare Assets binding не настроен');
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) return response;

  if (request.method !== 'GET' && request.method !== 'HEAD') return response;
  const fallbackUrl = new URL('/404.html', url);
  const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, { method: request.method, headers: request.headers }));
  return new Response(fallback.body, {
    status: 404,
    statusText: 'Not Found',
    headers: fallback.headers
  });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (pathname === '/healthz' && method === 'GET') return text('ok');

  const needsDb = pathname.startsWith('/api/') || pathname === '/admin/dashboard.html' || pathname === '/admin' || pathname === '/admin/';
  if (needsDb) await ensureSchema(env);

  if (pathname === '/api/health' && method === 'GET') {
    const row = await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ ok: row?.ok === 1, runtime: 'cloudflare-workers', database: 'd1' });
  }

  if (pathname === '/api/orders' && method === 'POST') return handleCreateOrder(request, env);
  if (pathname === '/api/login' && method === 'POST') return handleLogin(request, env);
  if (pathname === '/api/logout' && method === 'POST') return handleLogout(request, env);
  if (pathname === '/api/admin/me' && method === 'GET') return handleAdminMe(request, env);
  if (pathname === '/api/orders/export.csv' && method === 'GET') return handleExport(request, env);
  if (pathname === '/api/orders' && method === 'GET') return handleOrdersList(request, env);

  const eventsId = parseOrderId(pathname, '/events');
  if (eventsId && method === 'GET') return handleOrderEvents(request, env, eventsId);
  const orderId = parseOrderId(pathname);
  if (orderId && method === 'PATCH') return handleUpdateOrder(request, env, orderId);
  if (orderId && method === 'DELETE') return handleDeleteOrder(request, env, orderId);

  if (pathname.startsWith('/api/')) return json({ ok: false, error: 'API route not found' }, 404);

  if ((pathname === '/admin' || pathname === '/admin/') && method === 'GET') {
    const session = await getAdminSession(env, request);
    return redirect(session && !session.expired ? '/admin/dashboard.html' : '/admin/login.html', 302);
  }

  if (pathname === '/admin/dashboard.html' && method === 'GET') {
    const session = await getAdminSession(env, request);
    if (!session || session.expired) {
      const response = redirect('/admin/login.html', 302);
      response.headers.set('Set-Cookie', clearSessionCookie());
      return response;
    }
  }

  if ((pathname === '/cleaning/balcony' || pathname === '/cleaning/balcony/') && method === 'GET') {
    return redirect('/#order-request', 301);
  }

  return serveAsset(request, env, url);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const response = await handleRequest(request, env);
      return withSecurityHeaders(response, pathname);
    } catch (error) {
      let response;
      if (error instanceof HttpError) {
        response = json({ ok: false, error: error.message || 'Ошибка запроса' }, error.status || 500, error.headers || {});
      } else {
        console.error('AIRUS Worker error:', error?.stack || error?.message || String(error));
        response = json({ ok: false, error: 'Внутренняя ошибка сервера' }, 500);
      }
      return withSecurityHeaders(response, pathname);
    }
  }
};
