const user = localStorage.getItem('airus_admin');
if (!user) location.href = '/admin/login.html';

const stats = document.getElementById('stats');
const ordersList = document.getElementById('ordersList');
const searchInput = document.getElementById('searchInput');
const filterButtons = Array.from(document.querySelectorAll('.chip'));
const logoutBtn = document.getElementById('logoutBtn');

let allOrders = [];
let currentFilter = 'all';

logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('airus_admin');
  location.href = '/admin/login.html';
});

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

searchInput?.addEventListener('input', render);

function badgeClass(status) {
  if (status === 'В работе') return 'work';
  if (status === 'Выполнена') return 'done';
  return 'new';
}

function statCards(orders) {
  const total = orders.length;
  const newCount = orders.filter(o => o.status === 'Новая').length;
  const workCount = orders.filter(o => o.status === 'В работе').length;
  const doneCount = orders.filter(o => o.status === 'Выполнена').length;
  stats.innerHTML = `
    <div class="stat"><strong>${total}</strong><span>Всего заказов</span></div>
    <div class="stat"><strong>${newCount}</strong><span>Новые</span></div>
    <div class="stat"><strong>${workCount}</strong><span>В работе</span></div>
    <div class="stat"><strong>${doneCount}</strong><span>Выполненные</span></div>
  `;
}

function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleString('ru-RU');
}

function render() {
  const q = (searchInput.value || '').trim().toLowerCase();
  let items = allOrders.filter(order => {
    if (currentFilter !== 'all' && order.status !== currentFilter) return false;
    if (!q) return true;
    const blob = [order.name, order.phone, order.zhk, order.service, order.comment].join(' ').toLowerCase();
    return blob.includes(q);
  });

  statCards(allOrders);

  if (!items.length) {
    ordersList.innerHTML = '<div class="empty">Заказов по текущему фильтру пока нет.</div>';
    return;
  }

  ordersList.innerHTML = items.map(order => `
    <article class="order-card">
      <div class="order-top">
        <div>
          <h3>${order.service || 'Заказ #' + order.id}</h3>
          <div style="color:#64748b; margin-top:6px;">Заказ #${order.id} · ${formatDate(order.created_at)}</div>
        </div>
        <span class="badge ${badgeClass(order.status)}">${order.status}</span>
      </div>
      <div class="order-meta">
        <div class="order-box"><strong>Клиент</strong>${order.name || '—'}</div>
        <div class="order-box"><strong>Телефон</strong>${order.phone || '—'}</div>
        <div class="order-box"><strong>ЖК / объект</strong>${order.zhk || '—'}</div>
        <div class="order-box"><strong>Дом / подъезд / квартира</strong>${order.house || '—'} / ${order.entrance || '—'} / ${order.flat || '—'}</div>
        <div class="order-box" style="grid-column:1/-1;"><strong>Комментарий</strong>${order.comment || 'Без комментария'}</div>
      </div>
      <div class="order-actions">
        <button class="btn btn-ghost" onclick="updateStatus(${order.id}, 'Новая')">Новая</button>
        <button class="btn btn-ghost" onclick="updateStatus(${order.id}, 'В работе')">В работу</button>
        <button class="btn btn-primary" onclick="updateStatus(${order.id}, 'Выполнена')">Выполнено</button>
        <button class="btn btn-ghost" onclick="deleteOrder(${order.id})">Удалить</button>
      </div>
    </article>
  `).join('');
}

async function loadOrders() {
  const res = await fetch('/api/orders');
  allOrders = await res.json();
  render();
}

async function updateStatus(id, status) {
  await fetch('/api/orders/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  await loadOrders();
}

async function deleteOrder(id) {
  if (!confirm('Удалить заказ #' + id + '?')) return;
  await fetch('/api/orders/' + id, { method: 'DELETE' });
  await loadOrders();
}

window.updateStatus = updateStatus;
window.deleteOrder = deleteOrder;
loadOrders();
