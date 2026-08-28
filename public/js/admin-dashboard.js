(() => {
  const STATUS_TABS = [
    ['all', 'Все'],
    ['Новая', 'Новые'],
    ['В работе', 'В работе'],
    ['Ожидает оплаты', 'Оплата'],
    ['Выполнена', 'Выполнены']
  ];

  const state = { status: 'all', city: '', zhk: '', house: '', showAllAddresses: false, query: '' };
  let allOrders = [];
  let editingId = null;

  const statusTabs = document.getElementById('statusTabs');
  const breadcrumbs = document.getElementById('breadcrumbs');
  const panelTitle = document.getElementById('panelTitle');
  const panelMeta = document.getElementById('panelMeta');
  const panelContent = document.getElementById('panelContent');
  const statsGrid = document.getElementById('statsGrid');
  const searchInput = document.getElementById('searchInput');
  const resetViewBtn = document.getElementById('resetViewBtn');
  const allAddressesBtn = document.getElementById('allAddressesBtn');
  const backToCitiesBtn = document.getElementById('backToCitiesBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const orderDialog = document.getElementById('orderDialog');
  const orderEditForm = document.getElementById('orderEditForm');
  const dialogTitle = document.getElementById('dialogTitle');
  const dialogInfo = document.getElementById('dialogInfo');
  const dialogNote = document.getElementById('dialogNote');
  const dialogNextContact = document.getElementById('dialogNextContact');
  const dialogError = document.getElementById('dialogError');

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function smartCompare(a, b) {
    const na = parseInt(String(a).match(/\d+/)?.[0] || '', 10);
    const nb = parseInt(String(b).match(/\d+/)?.[0] || '', 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b), 'ru');
  }

  function guessCity(order) {
    const blob = [order.city, order.zhk, order.house, order.street, order.comment].filter(Boolean).join(' ').toLowerCase();
    if (blob.includes('уфа')) return 'Уфа';
    return 'Челябинск';
  }

  function normalizeAddress(order) {
    const house = String(order.house || '').trim();
    const street = String(order.street || '').trim();
    if (house && street && house !== street && !street.includes(house)) return `${street}, ${house}`;
    return house || street || 'Без адреса';
  }

  function normalizeOrder(order) {
    return {
      ...order,
      id: Number(order.id),
      city: String(order.city || '').trim() || guessCity(order),
      zhk: String(order.zhk || '').trim() || 'Без ЖК',
      house: normalizeAddress(order),
      entrance: String(order.entrance || '').trim() || 'Без подъезда',
      flat: String(order.flat || '').trim() || '—',
      floor: String(order.floor || '').trim() || '—',
      service: String(order.service || '').trim() || 'Без услуги',
      comment: String(order.comment || '').trim(),
      admin_note: String(order.admin_note || '').trim(),
      next_contact: String(order.next_contact || '').trim(),
      name: String(order.name || '').trim() || '—',
      phone: String(order.phone || '').trim() || '—',
      status: String(order.status || '').trim() || 'Новая'
    };
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function toDatetimeLocal(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function statusClass(status) {
    if (status === 'В работе') return 'work';
    if (status === 'Ожидает оплаты') return 'wait';
    if (status === 'Выполнена') return 'done';
    return 'new';
  }

  function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') headers['X-Requested-With'] = 'airus-admin';
    return fetch(url, { ...options, headers, cache: 'no-store' }).then((response) => {
      if (response.status === 401) {
        location.replace('/admin/login.html');
        throw new Error('Сессия истекла');
      }
      return response;
    });
  }

  function baseOrders() {
    return allOrders.filter((order) => {
      if (state.status !== 'all' && order.status !== state.status) return false;
      if (!state.query) return true;
      const blob = [order.id, order.city, order.zhk, order.house, order.entrance, order.flat, order.name, order.phone, order.comment, order.admin_note].join(' ').toLowerCase();
      return blob.includes(state.query);
    });
  }

  function scopedOrders() {
    let rows = baseOrders();
    if (state.city) rows = rows.filter((order) => order.city === state.city);
    if (state.zhk && !state.showAllAddresses) rows = rows.filter((order) => order.zhk === state.zhk);
    if (state.house) rows = rows.filter((order) => order.house === state.house);
    return rows;
  }

  function groupRows(rows, key) {
    const map = new Map();
    rows.forEach((row) => map.set(row[key], (map.get(row[key]) || 0) + 1));
    return Array.from(map, ([label, count]) => ({ label, count })).sort((a, b) => smartCompare(a.label, b.label));
  }

  function renderTabs() {
    const counts = { all: allOrders.length };
    allOrders.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
    statusTabs.innerHTML = STATUS_TABS.map(([key, label]) => `
      <button class="status-tab ${state.status === key ? 'active' : ''}" type="button" data-status="${escapeHtml(key)}">
        <span>${escapeHtml(label)}</span><span class="count">${counts[key] || 0}</span>
      </button>`).join('');
  }

  function renderBreadcrumbs() {
    const html = [];
    if (!state.city) html.push('<span class="crumb-current">Города</span>');
    else {
      html.push('<button class="crumb-link" data-crumb="root">Города</button><span class="crumb-sep">/</span>');
      if (!state.zhk && !state.house && !state.showAllAddresses) html.push(`<span class="crumb-current">${escapeHtml(state.city)}</span>`);
      else html.push(`<button class="crumb-link" data-crumb="city">${escapeHtml(state.city)}</button>`);
    }
    if (state.showAllAddresses) html.push('<span class="crumb-sep">/</span><span class="crumb-current">Все адреса</span>');
    else if (state.zhk) {
      html.push('<span class="crumb-sep">/</span>');
      if (!state.house) html.push(`<span class="crumb-current">${escapeHtml(state.zhk)}</span>`);
      else html.push(`<button class="crumb-link" data-crumb="zhk">${escapeHtml(state.zhk)}</button>`);
    }
    if (state.house) html.push(`<span class="crumb-sep">/</span><span class="crumb-current">${escapeHtml(state.house)}</span>`);
    breadcrumbs.innerHTML = html.join('');
    allAddressesBtn.hidden = !state.city || !!state.house || state.showAllAddresses;
  }

  function renderStats() {
    const rows = scopedOrders();
    const now = Date.now();
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);
    const due = rows.filter((row) => {
      if (!row.next_contact) return false;
      const ts = Date.parse(row.next_contact);
      return !Number.isNaN(ts) && ts <= dayEnd.getTime() && row.status !== 'Выполнена';
    }).length;
    const values = [
      ['Заявок', rows.length],
      ['Адресов', new Set(rows.map((r) => r.house)).size],
      ['В работе', rows.filter((r) => r.status === 'В работе').length],
      ['Контакт до сегодня', due],
      ['Новые', rows.filter((r) => r.status === 'Новая').length],
      ['Выполнены', rows.filter((r) => r.status === 'Выполнена').length]
    ];
    statsGrid.innerHTML = values.map(([label, value]) => `<div class="stat-card"><span class="stat-label">${escapeHtml(label)}</span><div class="stat-value">${value}</div></div>`).join('');
  }

  function renderEntityList(items, type, subLabel) {
    if (!items.length) {
      panelContent.innerHTML = '<div class="empty-state">Ничего не найдено. Измените фильтр или строку поиска.</div>';
      return;
    }
    panelContent.innerHTML = `<div class="entity-list">${items.map((item) => `
      <button class="entity-item" type="button" data-action="open-${type}" data-value="${escapeHtml(item.label)}">
        <span><span class="entity-label">${escapeHtml(item.label)}</span><span class="entity-sub">${escapeHtml(subLabel(item))}</span></span>
        <span class="entity-count">${item.count}</span>
      </button>`).join('')}</div>`;
  }

  function statusButtons(row) {
    return `
      <button class="small-btn ${row.status === 'Новая' ? 'active' : ''}" data-action="set-status" data-id="${row.id}" data-value="Новая">Новая</button>
      <button class="small-btn ${row.status === 'В работе' ? 'active' : ''}" data-action="set-status" data-id="${row.id}" data-value="В работе">В работу</button>
      <button class="small-btn ${row.status === 'Ожидает оплаты' ? 'active' : ''}" data-action="set-status" data-id="${row.id}" data-value="Ожидает оплаты">Оплата</button>
      <button class="small-btn primary ${row.status === 'Выполнена' ? 'active' : ''}" data-action="set-status" data-id="${row.id}" data-value="Выполнена">Готово</button>
      <button class="small-btn details" data-action="edit-order" data-id="${row.id}">Карточка${row.admin_note ? '<span class="note-dot"></span>' : ''}</button>
      <button class="small-btn danger" data-action="delete-order" data-id="${row.id}">Удалить</button>`;
  }

  function renderOrders(rows) {
    panelTitle.textContent = 'Заявки по адресу';
    panelMeta.textContent = `${rows.length} заявок · ${state.house}`;
    const entrances = new Map();
    rows.forEach((row) => {
      const arr = entrances.get(row.entrance) || [];
      arr.push(row);
      entrances.set(row.entrance, arr);
    });
    const groups = Array.from(entrances.entries()).sort((a, b) => smartCompare(a[0], b[0]));

    panelContent.innerHTML = `<div class="entrance-stack">${groups.map(([entrance, group]) => `
      <section class="entrance-card">
        <div class="entrance-head"><strong>${escapeHtml(entrance)}</strong><span>${group.length} заявок</span></div>
        <div class="orders-table-wrap">
          <table class="orders-table">
            <thead><tr><th>ID</th><th>Кв.</th><th>Клиент</th><th>Телефон</th><th>Услуга</th><th>Статус</th><th>След. контакт</th><th>Дата</th><th>Комментарий</th><th>Действия</th></tr></thead>
            <tbody>${group.slice().sort((a,b) => smartCompare(a.flat,b.flat)).map((row) => `
              <tr>
                <td><strong>#${row.id}</strong></td>
                <td>${escapeHtml(row.flat)}</td>
                <td>${escapeHtml(row.name)}</td>
                <td><a class="phone-link" href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a></td>
                <td>${escapeHtml(row.service)}</td>
                <td><span class="row-status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
                <td class="muted">${escapeHtml(formatDate(row.next_contact))}</td>
                <td class="muted">${escapeHtml(formatDate(row.created_at))}</td>
                <td class="muted">${escapeHtml(row.comment || '—')}</td>
                <td><div class="row-actions">${statusButtons(row)}</div></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="mobile-orders">${group.slice().sort((a,b) => smartCompare(a.flat,b.flat)).map((row) => `
          <article class="mobile-order">
            <div class="mobile-order-top"><div><h3>#${row.id} · ${escapeHtml(row.name)}</h3><p>Кв. ${escapeHtml(row.flat)} · ${escapeHtml(formatDate(row.created_at))}</p></div><span class="row-status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></div>
            <div class="mobile-order-contact"><a class="phone-link" href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a><span>${escapeHtml(row.service)}</span>${row.next_contact ? `<span>След. контакт: ${escapeHtml(formatDate(row.next_contact))}</span>` : ''}</div>
            <div class="row-actions">${statusButtons(row)}</div>
          </article>`).join('')}</div>
      </section>`).join('')}</div>`;
  }

  function renderContent() {
    const rows = baseOrders();
    if (!state.city) {
      panelTitle.textContent = 'Выберите город';
      panelMeta.textContent = `${rows.length} заявок в текущем фильтре`;
      renderEntityList(groupRows(rows, 'city'), 'city', (item) => `${item.count} заявок`);
      return;
    }

    const cityRows = rows.filter((row) => row.city === state.city);
    if (!state.showAllAddresses && !state.zhk) {
      panelTitle.textContent = 'Выберите ЖК';
      panelMeta.textContent = `${cityRows.length} заявок · ${state.city}`;
      renderEntityList(groupRows(cityRows, 'zhk'), 'zhk', (item) => item.label === 'Без ЖК' ? 'Без привязки к ЖК' : state.city);
      return;
    }

    const stageRows = state.showAllAddresses ? cityRows : cityRows.filter((row) => row.zhk === state.zhk);
    if (!state.house) {
      panelTitle.textContent = state.showAllAddresses ? 'Все адреса города' : 'Выберите адрес';
      panelMeta.textContent = `${stageRows.length} заявок${state.showAllAddresses ? ` · ${state.city}` : ` · ${state.zhk}`}`;
      renderEntityList(groupRows(stageRows, 'house'), 'house', (item) => {
        const zhks = new Set(stageRows.filter((row) => row.house === item.label).map((row) => row.zhk));
        return state.showAllAddresses ? Array.from(zhks).join(', ') : state.zhk;
      });
      return;
    }

    renderOrders(stageRows.filter((row) => row.house === state.house));
  }

  function returnToCities() {
    Object.assign(state, { city: '', zhk: '', house: '', showAllAddresses: false });
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    renderTabs();
    renderBreadcrumbs();
    renderStats();
    backToCitiesBtn.hidden = !state.city;
    renderContent();
  }

  async function loadOrders() {
    const response = await apiFetch('/api/orders');
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить заявки');
    allOrders = (data || []).map(normalizeOrder).sort((a,b) => b.id - a.id);
    render();
  }

  async function updateOrder(id, patch) {
    const response = await apiFetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось сохранить изменения');
    await loadOrders();
  }

  function openOrderDialog(id) {
    const row = allOrders.find((item) => item.id === Number(id));
    if (!row) return;
    editingId = row.id;
    dialogError.textContent = '';
    dialogTitle.textContent = `Заявка #${row.id}`;
    dialogNote.value = row.admin_note;
    dialogNextContact.value = toDatetimeLocal(row.next_contact);
    dialogInfo.innerHTML = [
      ['Клиент', row.name],
      ['Телефон', row.phone],
      ['Адрес', `${row.city}, ${row.zhk}, ${row.house}`],
      ['Квартира / этаж', `${row.flat} / ${row.floor}`],
      ['Услуга', row.service],
      ['Комментарий', row.comment || '—']
    ].map(([label, value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
    orderDialog.showModal();
  }

  async function deleteOrder(id) {
    if (!confirm(`Удалить заявку #${id}? Это действие нельзя отменить.`)) return;
    const response = await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось удалить заявку');
    await loadOrders();
  }

  statusTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    state.status = button.dataset.status;
    render();
  });

  breadcrumbs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-crumb]');
    if (!button) return;
    if (button.dataset.crumb === 'root') { returnToCities(); return; }
    if (button.dataset.crumb === 'city') Object.assign(state, { zhk: '', house: '', showAllAddresses: false });
    if (button.dataset.crumb === 'zhk') state.house = '';
    render();
  });

  panelContent.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    try {
      if (action === 'open-city') Object.assign(state, { city: button.dataset.value, zhk: '', house: '', showAllAddresses: false });
      else if (action === 'open-zhk') Object.assign(state, { zhk: button.dataset.value, house: '', showAllAddresses: false });
      else if (action === 'open-house') state.house = button.dataset.value;
      else if (action === 'set-status') await updateOrder(button.dataset.id, { status: button.dataset.value });
      else if (action === 'delete-order') await deleteOrder(button.dataset.id);
      else if (action === 'edit-order') openOrderDialog(button.dataset.id);
      if (action.startsWith('open-')) render();
    } catch (error) {
      alert(error.message || 'Ошибка');
    }
  });

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim().toLowerCase();
    render();
  });

  resetViewBtn.addEventListener('click', () => {
    Object.assign(state, { status: 'all', city: '', zhk: '', house: '', showAllAddresses: false, query: '' });
    searchInput.value = '';
    render();
  });

  allAddressesBtn.addEventListener('click', () => {
    Object.assign(state, { zhk: '', house: '', showAllAddresses: true });
    render();
  });

  backToCitiesBtn.addEventListener('click', returnToCities);

  logoutBtn.addEventListener('click', async () => {
    try { await apiFetch('/api/logout', { method: 'POST' }); } catch (_) {}
    location.replace('/admin/login.html');
  });

  document.getElementById('closeDialog').addEventListener('click', () => orderDialog.close());
  document.getElementById('cancelDialog').addEventListener('click', () => orderDialog.close());
  orderDialog.addEventListener('click', (event) => {
    if (event.target === orderDialog) orderDialog.close();
  });

  orderEditForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editingId) return;
    dialogError.textContent = '';
    const save = document.getElementById('saveDialog');
    save.disabled = true;
    try {
      await updateOrder(editingId, {
        admin_note: dialogNote.value.trim(),
        next_contact: dialogNextContact.value ? new Date(dialogNextContact.value).toISOString() : ''
      });
      orderDialog.close();
    } catch (error) {
      dialogError.textContent = error.message || 'Не удалось сохранить';
    } finally {
      save.disabled = false;
    }
  });

  loadOrders().catch((error) => {
    panelTitle.textContent = 'Ошибка загрузки';
    panelMeta.textContent = error.message || 'Не удалось загрузить заявки';
  });
})();
