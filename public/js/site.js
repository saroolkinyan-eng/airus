const form = document.getElementById('orderForm');
const alertBox = document.getElementById('formAlert');
const openButtons = document.querySelectorAll('.open-order');
const citySelect = document.getElementById('city');
const zhkSelect = document.getElementById('zhk');
const streetSelect = document.getElementById('street');
const steps = [...document.querySelectorAll('.request-step')];
const panels = [...document.querySelectorAll('.wizard-panel')];
const nextButtons = document.querySelectorAll('[data-next-step]');
const prevButtons = document.querySelectorAll('[data-prev-step]');

const clientCases = [
  {
    title: 'ЖК «Территория»',
    subtitle: 'Мойка окон и балконов',
    text: 'Жители заказывали послестроительную мойку окон и балконов. За короткий срок выполнили большой объём заявок по одному жилому комплексу.',
    visualClass: 'client-visual-1'
  },
  {
    title: 'Бизнес-центр «Панорама»',
    subtitle: 'Фасадное обслуживание',
    text: 'Провели сезонную мойку фасадного остекления и обслуживание наружных участков здания с безопасной организацией работ для арендаторов.',
    visualClass: 'client-visual-2'
  },
  {
    title: 'ЖК «Новый берег»',
    subtitle: 'Очистка крыши от снега',
    text: 'Организовали срочную очистку кровли и опасных зон от снега и наледи. Заявки поступали через сайт и сразу распределялись через админку.',
    visualClass: 'client-visual-3'
  }
];

const dataset = {
  'Уфа': {
    'Квартал Энтузиастов': [
      'Лесотехникума 1',
      'Лесотехникума 21',
      'Лесотехникума, Туфана 1',
      'Рудольфа Нуреева 1',
      'Энтузиастов 124',
      'Энтузиастов 14',
      'Энтузиастов 16'
    ]
  },
  'Челябинск': {
    'AcademRiverside': ['Университетская Набережная 97', 'Университетская Набережная 99'],
    'EvoPark': ['Телевизионная 6В', 'Орджоникидзе 64'],
    'Без ЖК': ['Частный адрес'],
    'Вместе': ['Дзержинского 93Б'],
    'Конфетти': ['Бейвеля 22', 'Бейвеля 24'],
    'Король Плаза': ['Братьев Кашириных 158'],
    'Манхэттен': [
      'Героя России Александра Яковлева 12',
      'Героя России Александра Яковлева 3',
      'Героя России Александра Яковлева 9',
      'Набережная Героя России Сергея Кислова 23',
      'Набережная Героя России Сергея Кислова 27'
    ],
    'Ньютон': ['Татищева 256', 'Академика Макеева 17'],
    'Олимп': ['Братьев Кашириных 131Б'],
    'Парковый': ['Краснопольский проспект 3', 'Краснопольский проспект 5'],
    'Парковый 2': ['Петра Сумина 26'],
    'Парковый Premium': ['Ласковая 6'],
    'Парус': ['Братьев Кашириных 8'],
    'Подсолнухи': ['Салавата Юлаева 29'],
    'Притяжение': ['Генерала Мартынова 14'],
    'Самоцвет': ['Петра Столыпина 15'],
    'Территория': ['1-я Окружная 5', '1-я Окружная 7'],
    'Шишкин': ['Шершневская 81'],
    'Ярославский': ['Ярославская 11']
  }
};

const clientTitle = document.getElementById('clientTitle');
const clientSubtitle = document.getElementById('clientSubtitle');
const clientText = document.getElementById('clientText');
const clientVisual = document.getElementById('clientVisual');
const clientProgress = document.getElementById('clientProgress');
const clientPrev = document.getElementById('clientPrev');
const clientNext = document.getElementById('clientNext');

let clientIndex = 0;
let currentStep = 1;

const addressData = {
  'Челябинск': {
    'Манхэттен': {
      'Героя России Александра Яковлева 3': {
        '1': ['14', '45', '64', '113', '154']
      },
      'Героя России Александра Яковлева 12': {
        '1': ['12','24','58']
      }
    },
    'Территория': {
      '1-я Окружная 5': {'1':['11','24','52']}
    },
    'Шишкин': {
      'Шишкинская 1': {'1':['3','15']}
    }
  },
  'Уфа': {
    'Квартал Энтузиастов': {
      'Энтузиастов 14': {'1':['12','34','56']},
      'Лесотехникума 21': {'1':['21','45']}
    }
  }
};

function fillHouseOptions() {
  const house = document.getElementById('house');
  if (!house) return;
  const city = citySelect.value;
  const zhk = zhkSelect.value;
  const streets = addressData[city]?.[zhk] ? Object.keys(addressData[city][zhk]) : [];
  fillSelect(streetSelect, streets, zhk ? 'Выберите улицу / адрес' : 'Сначала выберите ЖК');
}


function setAlert(type, text) {
  if (!alertBox) return;
  alertBox.className = 'alert ' + type;
  alertBox.textContent = text;
}

function scrollToForm() {
  const block = document.getElementById('order-request');
  if (!block) return;
  block.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => citySelect?.focus(), 300);
}

openButtons.forEach((btn) => {
  btn.addEventListener('click', () => scrollToForm());
});

function fillSelect(select, items, placeholder) {
  if (!select) return;
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = placeholder;
  select.appendChild(empty);
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
}

function updateZhkOptions() {
  const city = citySelect?.value || '';
  const zhks = city && dataset[city] ? Object.keys(dataset[city]) : [];
  fillSelect(zhkSelect, zhks, city ? 'Выберите ЖК' : 'Сначала выберите город');
  fillSelect(streetSelect, [], 'Сначала выберите ЖК');
}

function updateStreetOptions() {
  const city = citySelect?.value || '';
  const zhk = zhkSelect?.value || '';
  const streets = city && zhk && dataset[city] && dataset[city][zhk] ? dataset[city][zhk] : [];
  fillSelect(streetSelect, streets, zhk ? 'Выберите улицу / адрес' : 'Сначала выберите ЖК');
}

function canMoveTo(step) {
  if (step === 2) {
    if (!citySelect?.value) {
      setAlert('error', 'Сначала выберите город.');
      citySelect?.focus();
      return false;
    }
  }
  if (step === 3) {
    if (!citySelect?.value) {
      setAlert('error', 'Сначала выберите город.');
      currentStep = 1;
      renderSteps();
      citySelect?.focus();
      return false;
    }
    if (!zhkSelect?.value) {
      setAlert('error', 'Выберите ЖК.');
      zhkSelect?.focus();
      return false;
    }
  }
  setAlert('', '');
  return true;
}

function renderSteps() {
  steps.forEach((stepBtn) => {
    const step = Number(stepBtn.dataset.step);
    stepBtn.classList.toggle('is-active', step === currentStep);
    stepBtn.classList.toggle('is-complete', step < currentStep);
  });
  panels.forEach((panel) => {
    panel.classList.toggle('is-active', Number(panel.dataset.panel) === currentStep);
  });
}

steps.forEach((stepBtn) => {
  stepBtn.addEventListener('click', () => {
    const target = Number(stepBtn.dataset.step);
    if (target <= currentStep) {
      currentStep = target;
      renderSteps();
      return;
    }
    if (canMoveTo(target)) {
      currentStep = target;
      renderSteps();
    }
  });
});

nextButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const next = Math.min(currentStep + 1, 3);
    if (canMoveTo(next)) {
      currentStep = next;
      renderSteps();
    }
  });
});

prevButtons.forEach((button) => {
  button.addEventListener('click', () => {
    currentStep = Math.max(currentStep - 1, 1);
    renderSteps();
  });
});

citySelect?.addEventListener('change', () => {
  updateZhkOptions();
  setAlert('', '');
});
zhkSelect?.addEventListener('change', () => {
  updateStreetOptions();
  fillHouseOptions();
  setAlert('', '');
});

function renderClient(index) {
  const item = clientCases[index];
  if (!item || !clientTitle || !clientSubtitle || !clientText || !clientVisual || !clientProgress) return;
  clientTitle.textContent = item.title;
  clientSubtitle.textContent = item.subtitle;
  clientText.textContent = item.text;
  clientVisual.className = `client-visual ${item.visualClass}`;
  clientProgress.style.width = `${((index + 1) / clientCases.length) * 100}%`;
}

clientPrev?.addEventListener('click', () => {
  clientIndex = (clientIndex - 1 + clientCases.length) % clientCases.length;
  renderClient(clientIndex);
});

clientNext?.addEventListener('click', () => {
  clientIndex = (clientIndex + 1) % clientCases.length;
  renderClient(clientIndex);
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    service: document.getElementById('service')?.value || 'Коллективная мойка балконов',
    city: document.getElementById('city')?.value || '',
    zhk: document.getElementById('zhk')?.value || '',
    street: document.getElementById('street')?.value || '',
    name: document.getElementById('name')?.value.trim() || '',
    phone: document.getElementById('phone')?.value.trim() || '',
    house: document.getElementById('house')?.value.trim() || '',
    entrance: document.getElementById('entrance')?.value.trim() || '',
    flat: document.getElementById('flat')?.value.trim() || '',
    floor: document.getElementById('floor')?.value.trim() || '',
    comment: document.getElementById('comment')?.value.trim() || ''
  };

  if (!payload.city) {
    currentStep = 1;
    renderSteps();
    setAlert('error', 'Выберите город.');
    citySelect?.focus();
    return;
  }

  if (!payload.zhk) {
    currentStep = 2;
    renderSteps();
    setAlert('error', 'Выберите ЖК.');
    zhkSelect?.focus();
    return;
  }

  if (!payload.name || !payload.phone) {
    setAlert('error', 'Имя и телефон обязательны.');
    return;
  }

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = {};
    try {
      data = await res.json();
    } catch (error) {
      data = {};
    }

    if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка отправки заявки');

    form.reset();
    updateZhkOptions();
    currentStep = 1;
    renderSteps();
    setAlert('success', 'Заявка успешно отправлена. Она уже появилась в админке.');
  } catch (err) {
    setAlert('error', err.message || 'Ошибка отправки заявки');
  }
});

updateZhkOptions();
renderSteps();
renderClient(clientIndex);
