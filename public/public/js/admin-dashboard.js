(() => {
  const STATUS_TABS = [
    ['all', 'Все'],
    ['Новая', 'Новые'],
    ['В работе', 'В работе'],
    ['Ожидает оплаты', 'Оплата'],
    ['Выполнена', 'Выполнены']
  ];

  const state = {
    status: 'all', city: '', zhk: '', house: '', showAllAddresses: false, query: '',
    unreadOnly: false, todayOnly: false, duplicatesOnly: false, filterCity: '', service: ''
  };
  let allOrders = [];
  let editingId = null;
  let phoneCounts = new Map();

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
  const serviceFilter = document.getElementById('serviceFilter');
  const newOrdersBadge = document.getElementById('newOrdersBadge');
  const unreadFilterCount = document.getElementById('unreadFilterCount');
  const quickFilters = document.querySelector('.quick-filters');
  const orderDialog = document.getElementById('orderDialog');
  const orderEditForm = document.getElementById('orderEditForm');
  const dialogTitle = document.getElementById('dialogTitle');
  const dialogInfo = document.getElementById('dialogInfo');
  const dialogNote = document.getElementById('dialogNote');
  const dialogNextContact = document.getElementById('dialogNextContact');
  const dialogHistory = document.getElementById('dialogHistory');
  const historyMeta = document.getElementById('historyMeta');
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

  function phoneKey(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    return digits;
  }

  function duplicateCount(row) {
    const key = phoneKey(row.phone);
    return key ? (phoneCounts.get(key) || 1) : 1;
  }

  function guessCity(order) {
    const blob = [order.city, order.zhk, order.house, order.street, order.comment].filter(Boolean).join(' ').toLowerCase();
    return blob.includes('уфа') ? 'Уфа' : 'Челябинск';
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
      status: String(order.status || '').trim() || 'Новая',
      is_read: Number(order.is_read) === 1,
      viewed_at: String(order.viewed_at || '').trim(),
      updated_at: String(order.updated_at || '').trim()
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

  function isToday(value) {
    if (!value) return false;
    const d = new Date(String(value).replace(' ', 'T'));
    const n = new Date();
    return !Number.isNaN(d.getTime()) && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
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

  function rebuildPhoneCounts() {
    phoneCounts = new Map();
    allOrders.forEach((row) => {
      const key = phoneKey(row.phone);
      if (key) phoneCounts.set(key, (phoneCounts.get(key) || 0) + 1);
    });
  }

  function baseOrders() {
    return allOrders.filter((order) => {
      if (state.status !== 'all' && order.status !== state.status) return false;
      if (state.unreadOnly && order.is_read) return false;
      if (state.todayOnly && !isToday(order.created_at)) return false;
      if (state.duplicatesOnly && duplicateCount(order) < 2) return false;
      if (state.filterCity && order.city !== state.filterCity) return false;
      if (state.service && order.service !== state.service) return false;
      if (!state.query) return true;
      const blob = [order.id, order.city, order.zhk, order.house, order.entrance, order.flat, order.name, order.phone, order.service, order.comment, order.admin_note].join(' ').toLowerCase();
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
    rows.forEach((row) => {
      const current = map.get(row[key]) || { label: row[key], count: 0, unread: 0 };
      current.count += 1;
      if (!row.is_read) current.unread += 1;
      map.set(row[key], current);
    });
    return Array.from(map.values()).sort((a, b) => smartCompare(a.label, b.label));
  }

  function renderTabs() {
    const counts = { all: allOrders.length };
    allOrders.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
    statusTabs.innerHTML = STATUS_TABS.map(([key, label]) => `
      <button class="status-tab ${state.status === key ? 'active' : ''}" type="button" data-status="${escapeHtml(key)}">
        <span>${escapeHtml(label)}</span><span class="count">${counts[key] || 0}</span>
      </button>`).join('');
    const newCount = counts['Новая'] || 0;
    const unreadCount = allOrders.filter((row) => !row.is_read).length;
    newOrdersBadge.textContent = `${newCount} новых`;
    unreadFilterCount.textContent = unreadCount;
  }

  function renderQuickFilters() {
    quickFilters.querySelector('[data-quick="unread"]')?.classList.toggle('active', state.unreadOnly);
    quickFilters.querySelector('[data-quick="today"]')?.classList.toggle('active', state.todayOnly);
    quickFilters.querySelector('[data-quick="duplicates"]')?.classList.toggle('active', state.duplicatesOnly);
    quickFilters.querySelectorAll('[data-quick-city]').forEach((btn) => btn.classList.toggle('active', state.filterCity === btn.dataset.quickCity));
    serviceFilter.value = state.service;
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
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);
    const due = rows.filter((row) => {
      if (!row.next_contact) return false;
      const ts = Date.parse(row.next_contact);
      return !Number.isNaN(ts) && ts <= dayEnd.getTime() && row.status !== 'Выполнена';
    }).length;
    const values = [
      ['Заявок', rows.length],
      ['Непрочитано', rows.filter((r) => !r.is_read).length],
      ['Сегодня', rows.filter((r) => isToday(r.created_at)).length],
      ['Дубли', rows.filter((r) => duplicateCount(r) > 1).length],
      ['В работе', rows.filter((r) => r.status === 'В работе').length],
      ['Контакт до сегодня', due]
    ];
    statsGrid.innerHTML = values.map(([label, value]) => `<div class="stat-card"><span class="stat-label">${escapeHtml(label)}</span><div class="stat-value">${value}</div></div>`).join('');
  }

  function renderEntityList(items, type, subLabel) {
    if (!items.length) {
      panelContent.innerHTML = '<div class="empty-state">Ничего не найдено. Измените фильтр или строку поиска.</div>';
      return;
    }
    panelContent.innerHTML = `<div class="entity-list">${items.map((item) => `
      <button class="entity-item ${item.unread ? 'has-unread' : ''}" type="button" data-action="open-${type}" data-value="${escapeHtml(item.label)}">
        <span><span class="entity-label">${escapeHtml(item.label)}${item.unread ? `<i class="unread-dot" title="${item.unread} непрочитанных"></i>` : ''}</span><span class="entity-sub">${escapeHtml(subLabel(item))}</span></span>
        <span class="entity-count">${item.count}</span>
      </button>`).join('')}</div>`;
  }

  function repeatBadge(row) {
    const count = duplicateCount(row);
    return count > 1 ? `<span class="repeat-badge" title="По этому телефону ${count} заявок">Повтор ×${count}</span>` : '';
  }

  function statusButtons(row) {
    return `
      <button class="small-btn ${row.status === 'Новая' ? 'active' : ''}" data-action="set-status" data-id="${row.id}" data-value="Новая">Новая</button>
      <button class="small-btn ${row.status === 'В работе' ? 'active' : ''}" data-action="set-status" data-id="${row.id}" data-value="В работе">В работу</button>
      <button class="small-btn ${row.status === 'Ожидает оплаты' ? 'active' : ''}" data-action="set-status" data-id="${row.id}" data-value="Ожидает оплаты">Оплата</button>
      <button class="small-btn primary ${row.status === 'Выполнена' ? 'active' : ''}" data-action="set-status" data-id="${row.id}" data-value="Выполнена">Готово</button>
      <button class="small-btn details ${!row.is_read ? 'unread-action' : ''}" data-action="edit-order" data-id="${row.id}">Карточка${row.admin_note ? '<span class="note-dot"></span>' : ''}</button>
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
              <tr class="${!row.is_read ? 'order-unread' : ''}">
                <td><strong>#${row.id}</strong>${!row.is_read ? '<span class="unread-label">NEW</span>' : ''}</td>
                <td>${escapeHtml(row.flat)}</td>
                <td>${escapeHtml(row.name)}</td>
                <td><a class="phone-link" href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a>${repeatBadge(row)}</td>
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
          <article class="mobile-order ${!row.is_read ? 'order-unread' : ''}">
            <div class="mobile-order-top"><div><h3>${!row.is_read ? '<span class="unread-label">NEW</span>' : ''} #${row.id} · ${escapeHtml(row.name)}</h3><p>Кв. ${escapeHtml(row.flat)} · ${escapeHtml(formatDate(row.created_at))}</p></div><span class="row-status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></div>
            <div class="mobile-order-contact"><a class="phone-link" href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a>${repeatBadge(row)}<span>${escapeHtml(row.service)}</span>${row.next_contact ? `<span>След. контакт: ${escapeHtml(formatDate(row.next_contact))}</span>` : ''}</div>
            <div class="row-actions">${statusButtons(row)}</div>
          </article>`).join('')}</div>
      </section>`).join('')}</div>`;
  }

  function renderContent() {
    const rows = baseOrders();
    if (!state.city) {
      panelTitle.textContent = 'Выберите город';
      panelMeta.textContent = `${rows.length} заявок в текущем фильтре`;
      renderEntityList(groupRows(rows, 'city'), 'city', (item) => item.unread ? `${item.unread} непрочитанных` : `${item.count} заявок`);
      return;
    }

    const cityRows = rows.filter((row) => row.city === state.city);
    if (!state.showAllAddresses && !state.zhk) {
      panelTitle.textContent = 'Выберите ЖК';
      panelMeta.textContent = `${cityRows.length} заявок · ${state.city}`;
      renderEntityList(groupRows(cityRows, 'zhk'), 'zhk', (item) => item.unread ? `${item.unread} непрочитанных` : (item.label === 'Без ЖК' ? 'Без привязки к ЖК' : state.city));
      return;
    }

    const stageRows = state.showAllAddresses ? cityRows : cityRows.filter((row) => row.zhk === state.zhk);
    if (!state.house) {
      panelTitle.textContent = state.showAllAddresses ? 'Все адреса города' : 'Выберите адрес';
      panelMeta.textContent = `${stageRows.length} заявок${state.showAllAddresses ? ` · ${state.city}` : ` · ${state.zhk}`}`;
      renderEntityList(groupRows(stageRows, 'house'), 'house', (item) => {
        const zhks = new Set(stageRows.filter((row) => row.house === item.label).map((row) => row.zhk));
        return item.unread ? `${item.unread} непрочитанных` : (state.showAllAddresses ? Array.from(zhks).join(', ') : state.zhk);
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
    renderQuickFilters();
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
    rebuildPhoneCounts();
    render();
  }

  async function updateOrder(id, patch, reload = true) {
    const response = await apiFetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось сохранить изменения');
    if (reload) await loadOrders();
    return data;
  }

  async function loadHistory(id) {
    historyMeta.textContent = 'События по заявке';
    dialogHistory.innerHTML = '<div class="history-loading">Загрузка истории…</div>';
    const response = await apiFetch(`/api/orders/${id}/events`);
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить историю');
    historyMeta.textContent = `${data.length} событий`;
    dialogHistory.innerHTML = data.length ? data.map((event) => `
      <article class="history-item history-${escapeHtml(event.event_type)}">
        <span class="history-dot"></span>
        <div><strong>${escapeHtml(event.label)}</strong>${event.details ? `<p>${escapeHtml(event.details)}</p>` : ''}<time>${escapeHtml(formatDate(event.created_at))}</time></div>
      </article>`).join('') : '<div class="history-loading">История пока пуста.</div>';
  }

  async function openOrderDialog(id) {
    let row = allOrders.find((item) => item.id === Number(id));
    if (!row) return;
    editingId = row.id;
    dialogError.textContent = '';

    if (!row.is_read) {
      await updateOrder(row.id, { is_read: true }, false);
      row.is_read = true;
      row.viewed_at = new Date().toISOString();
      render();
    }

    const repeats = duplicateCount(row);
    dialogTitle.textContent = `Заявка #${row.id}`;
    dialogNote.value = row.admin_note;
    dialogNextContact.value = toDatetimeLocal(row.next_contact);
    dialogInfo.innerHTML = [
      ['Клиент', row.name],
      ['Телефон', row.phone],
      ['Адрес', `${row.city}, ${row.zhk}, ${row.house}`],
      ['Квартира / этаж', `${row.flat} / ${row.floor}`],
      ['Услуга', row.service],
      ['Повторные заявки', repeats > 1 ? `${repeats} заявки с этим телефоном` : 'Нет дублей'],
      ['Комментарий', row.comment || '—'],
      ['Впервые просмотрена', row.viewed_at ? formatDate(row.viewed_at) : 'Сейчас']
    ].map(([label, value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
    orderDialog.showModal();
    loadHistory(row.id).catch((error) => { dialogHistory.innerHTML = `<div class="history-loading">${escapeHtml(error.message)}</div>`; });
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

  quickFilters.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.quick === 'unread') state.unreadOnly = !state.unreadOnly;
    if (button.dataset.quick === 'today') state.todayOnly = !state.todayOnly;
    if (button.dataset.quick === 'duplicates') state.duplicatesOnly = !state.duplicatesOnly;
    if (button.dataset.quickCity) state.filterCity = state.filterCity === button.dataset.quickCity ? '' : button.dataset.quickCity;
    render();
  });

  serviceFilter.addEventListener('change', () => {
    state.service = serviceFilter.value;
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
      else if (action === 'edit-order') await openOrderDialog(button.dataset.id);
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
    Object.assign(state, {
      status: 'all', city: '', zhk: '', house: '', showAllAddresses: false, query: '',
      unreadOnly: false, todayOnly: false, duplicatesOnly: false, filterCity: '', service: ''
    });
    searchInput.value = '';
    serviceFilter.value = '';
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
    dialogError.classList.remove('success');
    const save = document.getElementById('saveDialog');
    save.disabled = true;
    try {
      await updateOrder(editingId, {
        admin_note: dialogNote.value.trim(),
        next_contact: dialogNextContact.value ? new Date(dialogNextContact.value).toISOString() : ''
      }, false);
      await loadOrders();
      await loadHistory(editingId);
      dialogError.classList.add('success');
      dialogError.textContent = 'Сохранено';
      setTimeout(() => { if (dialogError.textContent === 'Сохранено') { dialogError.textContent = ''; dialogError.classList.remove('success'); } }, 1600);
    } catch (error) {
      dialogError.classList.remove('success');
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
