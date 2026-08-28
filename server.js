const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');
const DB_FILE = path.join(ROOT, 'database.sqlite');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CONSENT_VERSION = '2026-08-28';
const ALLOWED_CITIES = new Set(['Челябинск', 'Уфа']);
const ALLOWED_STATUSES = new Set(['Новая', 'В работе', 'Ожидает оплаты', 'Выполнена']);

fs.mkdirSync(DATA_DIR, { recursive: true });
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https://climber74.ru; style-src 'self'; script-src 'self' 'sha256-yhwwvv8h1VvC+KbdpRdq9tpUptBGFciwn4HYOzQJB+M='; connect-src 'self'; font-src 'self'"
  );
  if (req.path.startsWith('/admin')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}

app.use(securityHeaders);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

const db = new sqlite3.Database(DB_FILE);

function ensureColumn(tableName, columnName, sqlTypeAndDefault) {
  db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlTypeAndDefault}`, (err) => {
    if (err && !String(err.message).includes('duplicate column name')) {
      console.error(`Failed adding column ${columnName}:`, err.message);
    }
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT DEFAULT 'Челябинск',
    zhk TEXT,
    street TEXT,
    house TEXT,
    entrance TEXT,
    flat TEXT,
    floor TEXT,
    service TEXT,
    comment TEXT,
    status TEXT DEFAULT 'Новая',
    admin_note TEXT DEFAULT '',
    next_contact TEXT DEFAULT '',
    consent_at DATETIME,
    consent_version TEXT DEFAULT '',
    source TEXT DEFAULT 'website',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  ensureColumn('orders', 'city', `TEXT DEFAULT 'Челябинск'`);
  ensureColumn('orders', 'street', `TEXT DEFAULT ''`);
  ensureColumn('orders', 'floor', `TEXT DEFAULT ''`);
  ensureColumn('orders', 'admin_note', `TEXT DEFAULT ''`);
  ensureColumn('orders', 'next_contact', `TEXT DEFAULT ''`);
  ensureColumn('orders', 'consent_at', `DATETIME`);
  ensureColumn('orders', 'consent_version', `TEXT DEFAULT ''`);
  ensureColumn('orders', 'source', `TEXT DEFAULT 'website'`);

  db.run(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)');
});

function scryptHash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createStoredAuth(login, password) {
  const salt = crypto.randomBytes(24).toString('hex');
  return {
    login,
    salt,
    passwordHash: scryptHash(password, salt),
    updatedAt: new Date().toISOString()
  };
}

function safeWriteJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch (_) {}
}

let generatedAdminPassword = '';
function loadAdminAuth() {
  const envLogin = String(process.env.ADMIN_LOGIN || '').trim();
  const envPassword = String(process.env.ADMIN_PASSWORD || '');
  if (envPassword) {
    return {
      mode: 'env',
      login: envLogin || 'airus-admin',
      password: envPassword
    };
  }

  if (fs.existsSync(AUTH_FILE)) {
    try {
      const stored = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
      if (stored.login && stored.salt && stored.passwordHash) {
        return { mode: 'stored', ...stored };
      }
    } catch (err) {
      console.error('Cannot read admin auth config:', err.message);
    }
  }

  const login = envLogin || 'airus-admin';
  generatedAdminPassword = crypto.randomBytes(15).toString('base64url');
  const stored = createStoredAuth(login, generatedAdminPassword);
  safeWriteJson(AUTH_FILE, stored);
  return { mode: 'stored', ...stored };
}

const adminAuth = loadAdminAuth();

function verifyAdminPassword(login, password) {
  if (!login || !password || login !== adminAuth.login) return false;

  if (adminAuth.mode === 'env') {
    const actual = Buffer.from(adminAuth.password);
    const supplied = Buffer.from(String(password));
    return actual.length === supplied.length && crypto.timingSafeEqual(actual, supplied);
  }

  const calculated = Buffer.from(scryptHash(String(password), adminAuth.salt), 'hex');
  const expected = Buffer.from(adminAuth.passwordHash, 'hex');
  return calculated.length === expected.length && crypto.timingSafeEqual(calculated, expected);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, pair) => {
    const index = pair.indexOf('=');
    if (index < 0) return acc;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function sessionTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cookieOptions(maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
    `Max-Age=${maxAgeSeconds}`
  ].filter(Boolean).join('; ');
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `airus_admin_session=${encodeURIComponent(token)}; ${cookieOptions(Math.floor(SESSION_TTL_MS / 1000))}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `airus_admin_session=; ${cookieOptions(0)}`);
}

function requireAdmin(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const token = parseCookies(req).airus_admin_session;
  if (!token) return res.status(401).json({ ok: false, error: 'Требуется вход в админ-панель' });

  const hash = sessionTokenHash(token);
  const now = Date.now();
  db.get('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?', [hash], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: 'Ошибка проверки сессии' });
    if (!row || Number(row.expires_at) <= now) {
      if (row) db.run('DELETE FROM admin_sessions WHERE token_hash = ?', [hash]);
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: 'Сессия истекла' });
    }
    req.adminSessionHash = hash;
    next();
  });
}

function requireAdminPage(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const token = parseCookies(req).airus_admin_session;
  if (!token) return res.redirect(302, '/admin/login.html');

  const hash = sessionTokenHash(token);
  const now = Date.now();
  db.get('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?', [hash], (err, row) => {
    if (err || !row || Number(row.expires_at) <= now) {
      if (row) db.run('DELETE FROM admin_sessions WHERE token_hash = ?', [hash]);
      clearSessionCookie(res);
      return res.redirect(302, '/admin/login.html');
    }
    req.adminSessionHash = hash;
    next();
  });
}

function requireAdminMutation(req, res, next) {
  if (String(req.get('X-Requested-With') || '').toLowerCase() !== 'airus-admin') {
    return res.status(403).json({ ok: false, error: 'Запрос отклонён' });
  }
  requireAdmin(req, res, next);
}

function makeRateLimiter({ windowMs, max, prefix }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${prefix}:${req.ip}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ ok: false, error: 'Слишком много запросов. Повторите попытку позже.' });
    }
    current.count += 1;
    next();
  };
}

const publicOrderLimiter = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 8, prefix: 'orders' });
const loginLimiter = makeRateLimiter({ windowMs: 15 * 60 * 1000, max: 8, prefix: 'login' });

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

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

app.post('/api/orders', publicOrderLimiter, (req, res) => {
  const o = req.body || {};

  // Honeypot: bots usually fill this hidden field. Return success without creating a record.
  if (cleanText(o.website, 120)) {
    return res.json({ ok: true, id: null });
  }

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

  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Укажите имя' });
  if (!phoneIsValid(phone)) return res.status(400).json({ ok: false, error: 'Проверьте номер телефона' });
  if (!ALLOWED_CITIES.has(city)) return res.status(400).json({ ok: false, error: 'Выберите город из списка' });
  if (!zhk) return res.status(400).json({ ok: false, error: 'Укажите ЖК или выберите другой адрес' });
  if (!address) return res.status(400).json({ ok: false, error: 'Укажите адрес дома' });
  if (!consent) return res.status(400).json({ ok: false, error: 'Нужно подтвердить согласие на обработку персональных данных' });

  const stmt = `INSERT INTO orders
    (name, phone, city, zhk, street, house, entrance, flat, floor, service, comment, status, admin_note, next_contact, consent_at, consent_version, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`;

  db.run(stmt, [
    name,
    phone,
    city,
    zhk,
    '',
    address,
    entrance,
    flat,
    floor,
    service,
    comment,
    'Новая',
    '',
    '',
    CONSENT_VERSION,
    'website'
  ], function onInsert(err) {
    if (err) {
      console.error('Order insert error:', err.message);
      return res.status(500).json({ ok: false, error: 'Не удалось сохранить заявку. Позвоните нам по телефону.' });
    }
    res.status(201).json({ ok: true, id: this.lastID });
  });
});

app.post('/api/login', loginLimiter, (req, res) => {
  const login = cleanText(req.body?.login, 100);
  const password = String(req.body?.password || '');
  if (!verifyAdminPassword(login, password)) {
    return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const hash = sessionTokenHash(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  db.run('DELETE FROM admin_sessions WHERE expires_at <= ?', [now], () => {
    db.run(
      'INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)',
      [hash, now, expiresAt],
      (err) => {
        if (err) return res.status(500).json({ ok: false, error: 'Не удалось создать сессию' });
        setSessionCookie(res, token);
        res.json({ ok: true, user: { login: adminAuth.login, role: 'admin' } });
      }
    );
  });
});

app.post('/api/logout', requireAdminMutation, (req, res) => {
  db.run('DELETE FROM admin_sessions WHERE token_hash = ?', [req.adminSessionHash], () => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true, user: { login: adminAuth.login, role: 'admin' } });
});

app.get('/api/orders/export.csv', requireAdmin, (req, res) => {
  db.all('SELECT * FROM orders ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: 'Не удалось сформировать экспорт' });
    const columns = [
      'id', 'created_at', 'status', 'city', 'zhk', 'house', 'entrance', 'flat', 'floor',
      'service', 'name', 'phone', 'comment', 'admin_note', 'next_contact', 'consent_at', 'consent_version'
    ];
    const body = [columns.join(';')]
      .concat((rows || []).map((row) => columns.map((col) => csvCell(row[col])).join(';')))
      .join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="airus-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\ufeff' + body);
  });
});

app.get('/api/orders', requireAdmin, (req, res) => {
  db.all('SELECT * FROM orders ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: 'Не удалось загрузить заявки' });
    res.json(rows || []);
  });
});

app.patch('/api/orders/:id', requireAdminMutation, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Некорректный ID' });

  const updates = [];
  const values = [];
  const body = req.body || {};

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = cleanText(body.status, 40);
    if (!ALLOWED_STATUSES.has(status)) return res.status(400).json({ ok: false, error: 'Некорректный статус' });
    updates.push('status = ?');
    values.push(status);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'admin_note')) {
    updates.push('admin_note = ?');
    values.push(cleanText(body.admin_note, 3000));
  }

  if (Object.prototype.hasOwnProperty.call(body, 'next_contact')) {
    const nextContact = cleanText(body.next_contact, 40);
    if (nextContact && Number.isNaN(Date.parse(nextContact))) {
      return res.status(400).json({ ok: false, error: 'Некорректная дата следующего контакта' });
    }
    updates.push('next_contact = ?');
    values.push(nextContact);
  }

  if (!updates.length) return res.status(400).json({ ok: false, error: 'Нет данных для изменения' });
  values.push(id);
  db.run(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, values, function onUpdate(err) {
    if (err) return res.status(500).json({ ok: false, error: 'Не удалось обновить заявку' });
    if (!this.changes) return res.status(404).json({ ok: false, error: 'Заявка не найдена' });
    res.json({ ok: true, changes: this.changes });
  });
});

app.delete('/api/orders/:id', requireAdminMutation, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Некорректный ID' });
  db.run('DELETE FROM orders WHERE id = ?', [id], function onDelete(err) {
    if (err) return res.status(500).json({ ok: false, error: 'Не удалось удалить заявку' });
    if (!this.changes) return res.status(404).json({ ok: false, error: 'Заявка не найдена' });
    res.json({ ok: true, changes: this.changes });
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/admin/dashboard.html', requireAdminPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'dashboard.html'));
});

app.get(['/cleaning/balcony', '/cleaning/balcony/'], (req, res) => {
  res.redirect(301, '/#order-request');
});

app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'API route not found' }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));

app.listen(PORT, () => {
  console.log(`AIRUS started on http://localhost:${PORT}`);
  console.log(`Admin login: ${adminAuth.login}`);
  if (generatedAdminPassword) {
    console.log('FIRST START: generated admin password:', generatedAdminPassword);
    console.log('Save it now. It is stored only as a secure hash.');
  } else if (adminAuth.mode === 'env') {
    console.log('Admin password source: ADMIN_PASSWORD environment variable');
  } else {
    console.log('Admin password: stored hash in data/admin-auth.json (use npm run admin:reset to replace it)');
  }
});
