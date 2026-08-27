const user = localStorage.getItem('airus_admin');
if (!user) location.href = '/admin/login.html';

const statusTabsEl = document.getElementById('statusTabs');
const breadcrumbsEl = document.getElementById('breadcrumbs');
const panelTitleEl = document.getElementById('panelTitle');
const panelMetaEl = document.getElementById('panelMeta');
const panelContentEl = document.getElementById('panelContent');
const statsGridEl = document.getElementById('statsGrid');
const searchInput = document.getElementById('searchInput');
const logoutBtn = document.getElementById('logoutBtn');
const resetViewBtn = document.getElementById('resetViewBtn');
const showAllWrap = document.getElementById('showAllWrap');
const showAllAddressesInput = document.getElementById('showAllAddresses');

const STATUS_TABS = [
  { key: 'all', label: 'Все' },
  { key: 'Новая', label: 'Новые' },
  { key: 'В работе', label: 'В работе' },
  { key: 'Ожидает оплаты', label: 'Ожидает оплаты' },
  { key: 'Выполнена', label: 'Выполненные' },
];

const state = {
  status: 'all',
  city: '',
  zhk: '',
  house: '',
  showAllAddresses: false,
  query: ''
};

let allOrders = [];

logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('airus_admin');
  location.href = '/admin/login.html';
});

resetViewBtn?.addEventListener('click', () => {
  state.status = 'all';
  state.city = '';
  state.zhk = '';
  state.house = '';
  state.showAllAddresses = false;
  state.query = '';
  if (searchInput) searchInput.value = '';
  if (showAllAddressesInput) showAllAddressesInput.checked = false;
  render();
});

searchInput?.addEventListener('input', () => {
  state.query = searchInput.value.trim().toLowerCase();
  render();
});

showAllAddressesInput?.addEventListener('change', () => {
  state.showAllAddresses = !!showAllAddressesInput.checked;
  state.zhk = '';
  state.house = '';
  render();
});

panelContentEl?.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const value = button.dataset.value || '';
  const id = button.dataset.id || '';

  if (action === 'open-city') {
    state.city = value;
    state.zhk = '';
    state.house = '';
    state.showAllAddresses = false;
    if (showAllAddressesInput) showAllAddressesInput.checked = false;
    render();
    return;
  }

  if (action === 'open-zhk') {
    state.zhk = value;
    state.house = '';
    render();
    return;
  }

  if (action === 'open-house') {
    state.house = value;
    render();
    return;
  }

  if (action === 'set-status') {
    await updateStatus(id, value);
    return;
  }

  if (action === 'delete-order') {
    await deleteOrder(id);
    return;
  }
});

breadcrumbsEl?.addEventListener('click', (e) => {
  const button = e.target.closest('[data-crumb]');
  if (!button) return;

  const crumb = button.dataset.crumb;
  if (crumb === 'root') {
    state.city = '';
    state.zhk = '';
    state.house = '';
    state.showAllAddresses = false;
    if (showAllAddressesInput) showAllAddressesInput.checked = false;
  }
  if (crumb === 'city') {
    state.zhk = '';
    state.house = '';
    state.showAllAddresses = false;
    if (showAllAddressesInput) showAllAddressesInput.checked = false;
  }
  if (crumb === 'zhk') {
    state.house = '';
  }
  render();
});

statusTabsEl?.addEventListener('click', (e) => {
  const button = e.target.closest('[data-status]');
  if (!button) return;
  state.status = button.dataset.status;
  render();
});

function guessCity(order) {
  const combined = [order.city, order.zhk, order.house, order.comment].filter(Boolean).join(' ').toLowerCase();
  if (combined.includes('уфа')) return 'Уфа';
  if (combined.includes('челябин')) return 'Челябинск';
  if (combined.includes('екатерин')) return 'Екатеринбург';
  return 'Челябинск';
}

function normalizeOrder(order) {
  return {
    ...order,
    city: (order.city || '').trim() || guessCity(order),
    zhk: (order.zhk || '').trim() || 'Без ЖК',
    house: (order.house || '').trim() || 'Без адреса',
    entrance: (order.entrance || '').trim() || 'Без подъезда',
    flat: (order.flat || '').trim() || '—',
    floor: (order.floor || '').trim() || '—',
    street: (order.street || '').trim(),
    service: (order.service || '').trim() || 'Без услуги',
    comment: (order.comment || '').trim(),
    name: (order.name || '').trim() || '—',
    phone: (order.phone || '').trim() || '—',
    status: (order.status || '').trim() || 'Новая',
  };
}

function smartCompare(a, b) {
  const na = parseInt(String(a).match(/\d+/)?.[0] || '', 10);
  const nb = parseInt(String(b).match(/\d+/)?.[0] || '', 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), 'ru');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(date) {
  if (!date) return '—';
  const d = new Date(String(date).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function statusClass(status) {
  if (status === 'В работе') return 'work';
  if (status === 'Ожидает оплаты') return 'wait';
  if (status === 'Выполнена') return 'done';
  return 'new';
}

function filterByStatus(order) {
  if (state.status === 'all') return true;
  return order.status === state.status;
}

function filterByQuery(order) {
  if (!state.query) return true;
  const blob = [
    order.id,
    order.city,
    order.zhk,
    order.house,
    order.entrance,
    order.flat,
    order.service,
    order.name,
    order.phone,
    order.comment
  ].join(' ').toLowerCase();
  return blob.includes(state.query);
}

function baseOrders() {
  return allOrders.filter(filterByStatus).filter(filterByQuery);
}

function scopedOrders() {
  let items = baseOrders();
  if (state.city) items = items.filter((item) => item.city === state.city);
  if (!state.showAllAddresses && state.zhk) items = items.filter((item) => item.zhk === state.zhk);
  if (state.house) items = items.filter((item) => item.house === state.house);
  return items;
}

function hasMeaningfulZhks(orders) {
  const values = new Set(orders.map((item) => item.zhk).filter(Boolean));
  return values.size > 1 || !values.has('Без ЖК');
}

function groupCount(items, key) {
  const map = new Map();
  items.forEach((item) => {
    const groupKey = item[key] || '—';
    map.set(groupKey, (map.get(groupKey) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => smartCompare(a.label, b.label));
}

function renderStatusTabs() {
  const counts = Object.fromEntries(STATUS_TABS.map((tab) => [tab.key, 0]));
  counts.all = allOrders.length;
  allOrders.forEach((order) => {
    counts[order.status] = (counts[order.status] || 0) + 1;
  });

  statusTabsEl.innerHTML = STATUS_TABS
    .filter((tab) => tab.key === 'all' || counts[tab.key] > 0 || tab.key === state.status)
    .map((tab) => `
      <button class="status-tab ${state.status === tab.key ? 'active' : ''}" data-status="${escapeHtml(tab.key)}">
        <span class="dot"></span>
        <span>${escapeHtml(tab.label)}</span>
        <span class="count">${counts[tab.key] || 0}</span>
      </button>
    `)
    .join('');
}

function renderBreadcrumbs() {
  const parts = [];
  if (!state.city) {
    parts.push('<span class="crumb-current">Города</span>');
  } else {
    parts.push('<button class="crumb-link" data-crumb="root">Города</button>');
    parts.push('<span class="crumb-sep">/</span>');
    if (!state.zhk && !state.house) {
      parts.push(`<span class="crumb-current">${escapeHtml(state.city)}</span>`);
    } else {
      parts.push(`<button class="crumb-link" data-crumb="city">${escapeHtml(state.city)}</button>`);
    }
  }

  if (state.city && state.zhk && !state.showAllAddresses) {
    parts.push('<span class="crumb-sep">/</span>');
    if (!state.house) {
      parts.push(`<span class="crumb-current">${escapeHtml(state.zhk)}</span>`);
    } else {
      parts.push(`<button class="crumb-link" data-crumb="zhk">${escapeHtml(state.zhk)}</button>`);
    }
  }

  if (state.house) {
    parts.push('<span class="crumb-sep">/</span>');
    parts.push(`<span class="crumb-current">${escapeHtml(state.house)}</span>`);
  }

  breadcrumbsEl.innerHTML = parts.join('');

  const cityOrders = state.city ? baseOrders().filter((item) => item.city === state.city) : [];
  const canShowToggle = !!state.city && hasMeaningfulZhks(cityOrders);
  showAllWrap.hidden = !canShowToggle;
  if (!canShowToggle) {
    state.showAllAddresses = false;
    if (showAllAddressesInput) showAllAddressesInput.checked = false;
  }
}

function renderStats() {
  const visible = scopedOrders();
  const total = visible.length;
  const cityCount = new Set(visible.map((item) => item.city)).size;
  const zhkCount = new Set(visible.map((item) => item.zhk)).size;
  const houseCount = new Set(visible.map((item) => item.house)).size;
  const workCount = visible.filter((item) => item.status === 'В работе').length;
  const waitCount = visible.filter((item) => item.status === 'Ожидает оплаты').length;
  const doneCount = visible.filter((item) => item.status === 'Выполнена').length;

  const cards = [
    ['Всего в выборке', total],
    ['Городов', cityCount],
    ['ЖК / групп', zhkCount],
    ['Адресов', houseCount],
    ['В работе', workCount],
    ['Ожидают оплаты', waitCount],
    ['Выполнены', doneCount],
  ];

  statsGridEl.innerHTML = cards.map(([label, value]) => `
    <div class="stat-card">
      <span class="stat-label">${escapeHtml(label)}</span>
      <div class="stat-value">${value}</div>
    </div>
  `).join('');
}

function renderEntityList(items, type) {
  if (!items.length) {
    panelContentEl.innerHTML = `
      <div class="empty-state">
        <div>
          <h3 style="margin:0 0 10px; color:white;">Ничего не найдено</h3>
          <div>Смените статус, поиск или попробуйте сбросить фильтры.</div>
        </div>
      </div>`;
    return;
  }

  const icons = {
    city: '🏙',
    zhk: '▦',
    house: '⌂'
  };

  panelContentEl.innerHTML = `
    <div class="entity-list">
      ${items.map((item) => `
        <button class="entity-item" data-action="open-${type}" data-value="${escapeHtml(item.label)}">
          <span class="entity-left">
            <span class="entity-icon">${icons[type] || '•'}</span>
            <span>
              <span class="entity-label">${escapeHtml(item.label)}</span>
              ${item.sub ? `<span class="entity-sub">${escapeHtml(item.sub)}</span>` : ''}
            </span>
          </span>
          <span class="entity-count">${item.count}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderCities(items) {
  panelTitleEl.textContent = 'Выберите город';
  panelMetaEl.textContent = `${items.length} заявок`;
  renderEntityList(groupCount(items, 'city'), 'city');
}

function renderZhks(items) {
  panelTitleEl.textContent = 'Выберите ЖК';
  panelMetaEl.textContent = `${items.length} заявок в городе ${state.city}`;
  const groups = groupCount(items, 'zhk').map((item) => ({
    ...item,
    sub: item.label === 'Без ЖК' ? 'Заявки без привязки к ЖК' : `Город: ${state.city}`
  }));
  renderEntityList(groups, 'zhk');
}

function renderHouses(items) {
  panelTitleEl.textContent = state.showAllAddresses || !state.zhk ? 'Выберите адрес' : 'Адреса в ЖК';
  panelMetaEl.textContent = `${items.length} заявок${state.zhk && !state.showAllAddresses ? ` · ${state.zhk}` : ''}`;
  const grouped = groupCount(items, 'house').map((item) => {
    const entranceCount = new Set(items.filter((row) => row.house === item.label).map((row) => row.entrance)).size;
    return {
      ...item,
      sub: entranceCount > 1 ? `Подъездов: ${entranceCount}` : '1 подъезд / группа'
    };
  });
  renderEntityList(grouped, 'house');
}

function renderEntranceTables(items) {
  panelTitleEl.textContent = 'Заявки по адресу';
  panelMetaEl.textContent = `${items.length} заявок · ${state.house}`;

  const entranceMap = new Map();
  items.forEach((item) => {
    const key = item.entrance || 'Без подъезда';
    const list = entranceMap.get(key) || [];
    list.push(item);
    entranceMap.set(key, list);
  });

  const entrances = Array.from(entranceMap.entries()).sort((a, b) => smartCompare(a[0], b[0]));

  panelContentEl.innerHTML = `
    <div class="entrance-stack">
      ${entrances.map(([entrance, rows]) => {
        const sortedRows = rows.slice().sort((a, b) => smartCompare(a.flat, b.flat));
        return `
          <section class="entrance-card">
            <div class="entrance-head">
              <div class="entrance-title-row">
                <span class="entrance-badge">${escapeHtml(entrance)}</span>
                <span>${entrance === 'Без подъезда' ? 'Общая группа заявок' : 'Подъезд / группа'}</span>
              </div>
              <div class="entrance-tools">
                <span class="entrance-count">${rows.length} заявок</span>
              </div>
            </div>
            <div class="orders-table-wrap">
              <table class="orders-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>КВ</th>
                    <th>Услуга</th>
                    <th>Телефон</th>
                    <th>Клиент</th>
                    <th>Статус</th>
                    <th>Дата</th>
                    <th>Комментарий</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  ${sortedRows.map((row) => `
                    <tr>
                      <td><strong>${row.id}</strong></td>
                      <td>${escapeHtml(row.flat)}</td>
                      <td>${escapeHtml(row.service)}</td>
                      <td><a class="phone-link" href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a></td>
                      <td>${escapeHtml(row.name)}</td>
                      <td><span class="row-status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
                      <td class="muted">${escapeHtml(formatDate(row.created_at))}</td>
                      <td class="muted">${escapeHtml(row.comment || '—')}</td>
                      <td>
                        <div class="row-actions">
                          <button class="small-btn ${row.status === 'Новая' ? 'active-filter' : ''}" data-action="set-status" data-id="${row.id}" data-value="Новая">Новая</button>
                          <button class="small-btn ${row.status === 'В работе' ? 'active-filter' : ''}" data-action="set-status" data-id="${row.id}" data-value="В работе">В работу</button>
                          <button class="small-btn ${row.status === 'Ожидает оплаты' ? 'active-filter' : ''}" data-action="set-status" data-id="${row.id}" data-value="Ожидает оплаты">Оплата</button>
                          <button class="small-btn primary ${row.status === 'Выполнена' ? '' : ''}" data-action="set-status" data-id="${row.id}" data-value="Выполнена">Готово</button>
                          <button class="small-btn danger" data-action="delete-order" data-id="${row.id}">Удалить</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `;
}

function renderContent() {
  const items = baseOrders();

  if (!state.city) {
    renderCities(items);
    return;
  }

  const cityOrders = items.filter((item) => item.city === state.city);
  if (!cityOrders.length) {
    renderEntityList([], 'city');
    panelTitleEl.textContent = 'Нет заявок';
    panelMetaEl.textContent = '';
    return;
  }

  const withZhks = hasMeaningfulZhks(cityOrders);

  if (withZhks && !state.showAllAddresses && !state.zhk && !state.house) {
    renderZhks(cityOrders);
    return;
  }

  let stageOrders = cityOrders;
  if (!state.showAllAddresses && state.zhk) {
    stageOrders = stageOrders.filter((item) => item.zhk === state.zhk);
  }

  if (!state.house) {
    renderHouses(stageOrders);
    return;
  }

  renderEntranceTables(stageOrders.filter((item) => item.house === state.house));
}

function render() {
  renderStatusTabs();
  renderBreadcrumbs();
  renderStats();
  renderContent();
}

async function loadOrders() {
  const res = await fetch('/api/orders');
  const rows = await res.json();
  allOrders = (rows || []).map(normalizeOrder).sort((a, b) => Number(b.id) - Number(a.id));
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

loadOrders();
