const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const adminUser = {
  login: 'sarosaasa',
  password: 'rozamimoza123',
  role: 'admin'
};

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  ensureColumn('orders', 'city', `TEXT DEFAULT 'Челябинск'`);
  ensureColumn('orders', 'street', `TEXT DEFAULT ''`);
  ensureColumn('orders', 'floor', `TEXT DEFAULT ''`);
});

app.post('/api/orders', (req, res) => {
  const o = req.body || {};
  if (!o.name || !o.phone) {
    return res.status(400).json({ ok: false, error: 'Имя и телефон обязательны' });
  }

  const stmt = `INSERT INTO orders
    (name, phone, city, zhk, street, house, entrance, flat, floor, service, comment, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(stmt, [
    o.name,
    o.phone,
    (o.city || '').trim() || 'Челябинск',
    o.zhk || '',
    o.street || '',
    o.house || '',
    o.entrance || '',
    o.flat || '',
    o.floor || '',
    o.service || '',
    o.comment || '',
    'Новая'
  ], function(err) {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true, id: this.lastID });
  });
});

app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json(rows || []);
  });
});

app.patch('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const allowed = ['Новая', 'В работе', 'Ожидает оплаты', 'Выполнена'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: 'Некорректный статус' });
  }

  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, id], function(err) {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true, changes: this.changes });
  });
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true, changes: this.changes });
  });
});

app.post('/api/login', (req, res) => {
  const { login, password } = req.body || {};
  if (login === adminUser.login && password === adminUser.password) {
    return res.json({ ok: true, user: { login: adminUser.login, role: adminUser.role } });
  }
  res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`AIRUS CRM started on http://localhost:${PORT}`);
});
