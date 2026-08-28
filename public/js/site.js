(() => {
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

  const OTHER_ZHK = '__other_zhk__';
  const OTHER_ADDRESS = '__other_address__';
  const form = document.getElementById('orderForm');
  const formSuccess = document.getElementById('formSuccess');
  const successText = document.getElementById('successText');
  const newOrderButton = document.getElementById('newOrderButton');
  const alertBox = document.getElementById('formAlert');
  const submitButton = document.getElementById('submitOrder');
  const citySelect = document.getElementById('city');
  const zhkSelect = document.getElementById('zhk');
  const addressSelect = document.getElementById('address');
  const addressSelectWrap = document.getElementById('addressSelectWrap');
  const manualAddressWrap = document.getElementById('manualAddressWrap');
  const customZhkWrap = document.getElementById('customZhkWrap');
  const customZhkInput = document.getElementById('customZhk');
  const manualAddressInput = document.getElementById('manualAddress');
  const phoneInput = document.getElementById('phone');
  const serviceInputs = Array.from(document.querySelectorAll('input[name="service"]'));
  const steps = Array.from(document.querySelectorAll('.wizard-step'));
  const panels = Array.from(document.querySelectorAll('.wizard-panel'));
  const openButtons = document.querySelectorAll('.open-order');
  let currentStep = 1;

  function setAlert(type = '', text = '') {
    if (!alertBox) return;
    alertBox.className = `form-alert${type ? ` ${type}` : ''}`;
    alertBox.textContent = text;
  }

  function fillSelect(select, values, placeholder, extraOption) {
    if (!select) return;
    select.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if (extraOption) {
      const option = document.createElement('option');
      option.value = extraOption.value;
      option.textContent = extraOption.label;
      select.appendChild(option);
    }
  }

  function updateZhkOptions() {
    const city = citySelect.value;
    const zhks = city && dataset[city] ? Object.keys(dataset[city]) : [];
    fillSelect(
      zhkSelect,
      zhks,
      city ? 'Выберите ЖК' : 'Сначала выберите город',
      city ? { value: OTHER_ZHK, label: 'Другой объект / адрес' } : null
    );
    zhkSelect.disabled = !city;
    fillSelect(addressSelect, [], 'Сначала выберите ЖК');
    addressSelect.disabled = true;
    manualAddressWrap.hidden = true;
    addressSelectWrap.hidden = false;
    customZhkInput.value = '';
    manualAddressInput.value = '';
  }

  function updateAddressOptions() {
    const city = citySelect.value;
    const zhk = zhkSelect.value;

    if (zhk === OTHER_ZHK) {
      addressSelectWrap.hidden = true;
      manualAddressWrap.hidden = false;
      customZhkWrap.hidden = false;
      addressSelect.disabled = true;
      manualAddressInput.required = true;
      requestAnimationFrame(() => manualAddressInput.focus());
      return;
    }

    addressSelectWrap.hidden = false;
    manualAddressWrap.hidden = true;
    customZhkWrap.hidden = false;
    manualAddressInput.required = false;
    const addresses = city && zhk && dataset[city]?.[zhk] ? dataset[city][zhk] : [];
    fillSelect(
      addressSelect,
      addresses,
      zhk ? 'Выберите дом / адрес' : 'Сначала выберите ЖК',
      zhk ? { value: OTHER_ADDRESS, label: 'Моего адреса нет — ввести вручную' } : null
    );
    addressSelect.disabled = !zhk;
  }

  function handleAddressChange() {
    if (addressSelect.value === OTHER_ADDRESS) {
      manualAddressWrap.hidden = false;
      customZhkWrap.hidden = true;
      manualAddressInput.required = true;
      requestAnimationFrame(() => manualAddressInput.focus());
    } else if (zhkSelect.value !== OTHER_ZHK) {
      manualAddressWrap.hidden = true;
      customZhkWrap.hidden = false;
      manualAddressInput.required = false;
      manualAddressInput.value = '';
    }
  }

  function renderSteps() {
    steps.forEach((button) => {
      const step = Number(button.dataset.step);
      button.classList.toggle('is-active', step === currentStep);
      button.classList.toggle('is-complete', step < currentStep);
      button.setAttribute('aria-current', step === currentStep ? 'step' : 'false');
    });
    panels.forEach((panel) => panel.classList.toggle('is-active', Number(panel.dataset.panel) === currentStep));
  }

  function resolveAddress() {
    if (zhkSelect.value === OTHER_ZHK || addressSelect.value === OTHER_ADDRESS) {
      return manualAddressInput.value.trim();
    }
    return addressSelect.value.trim();
  }

  function resolveZhk() {
    if (zhkSelect.value === OTHER_ZHK) return customZhkInput.value.trim() || 'Другой объект / адрес';
    return zhkSelect.value.trim();
  }

  function selectedService() {
    return serviceInputs.find((input) => input.checked)?.value || '';
  }

  function validateStep(step) {
    setAlert();

    if (step >= 2 && !selectedService()) {
      setAlert('error', 'Выберите вид работ.');
      serviceInputs[0]?.focus();
      return false;
    }

    if (step >= 2 && !citySelect.value) {
      setAlert('error', 'Выберите город.');
      citySelect.focus();
      return false;
    }

    if (step >= 3) {
      if (!zhkSelect.value) {
        setAlert('error', 'Выберите ЖК или пункт для ручного ввода.');
        zhkSelect.focus();
        return false;
      }
      if (!resolveAddress()) {
        setAlert('error', 'Выберите или введите адрес дома.');
        if (zhkSelect.value === OTHER_ZHK || addressSelect.value === OTHER_ADDRESS) manualAddressInput.focus();
        else addressSelect.focus();
        return false;
      }
    }
    return true;
  }

  function goToStep(target) {
    if (target > currentStep && !validateStep(target)) return;
    currentStep = Math.max(1, Math.min(3, target));
    renderSteps();
  }

  function formatRuPhone(value) {
    let digits = String(value).replace(/\D/g, '');
    if (!digits) return '';
    if (digits[0] === '8') digits = `7${digits.slice(1)}`;
    if (digits[0] !== '7') digits = `7${digits}`;
    digits = digits.slice(0, 11);
    const rest = digits.slice(1);
    let out = '+7';
    if (rest.length) out += ` (${rest.slice(0, 3)}`;
    if (rest.length >= 3) out += ')';
    if (rest.length > 3) out += ` ${rest.slice(3, 6)}`;
    if (rest.length > 6) out += `-${rest.slice(6, 8)}`;
    if (rest.length > 8) out += `-${rest.slice(8, 10)}`;
    return out;
  }

  function validRuPhone(value) {
    const digits = String(value).replace(/\D/g, '');
    return digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'));
  }

  serviceInputs.forEach((input) => input.addEventListener('change', () => setAlert()));

  citySelect.addEventListener('change', () => {
    updateZhkOptions();
    setAlert();
  });
  zhkSelect.addEventListener('change', () => {
    updateAddressOptions();
    setAlert();
  });
  addressSelect.addEventListener('change', () => {
    handleAddressChange();
    setAlert();
  });
  phoneInput.addEventListener('input', () => {
    phoneInput.value = formatRuPhone(phoneInput.value);
  });

  document.querySelectorAll('[data-next-step]').forEach((button) => button.addEventListener('click', () => goToStep(currentStep + 1)));
  document.querySelectorAll('[data-prev-step]').forEach((button) => button.addEventListener('click', () => goToStep(currentStep - 1)));
  steps.forEach((button) => button.addEventListener('click', () => {
    const target = Number(button.dataset.step);
    if (target <= currentStep) goToStep(target);
    else goToStep(target);
  }));

  function scrollToOrder() {
    const orderCard = document.getElementById('order-request');
    orderCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      const focusTarget = currentStep === 1 ? citySelect : currentStep === 2 ? zhkSelect : document.getElementById('name');
      focusTarget?.focus({ preventScroll: true });
    }, 450);
  }
  openButtons.forEach((button) => button.addEventListener('click', scrollToOrder));

  function selectService(serviceName, shouldScroll = true) {
    const target = serviceInputs.find((input) => input.value === serviceName);
    if (!target) return false;
    target.checked = true;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    currentStep = 1;
    renderSteps();
    if (shouldScroll) scrollToOrder();
    return true;
  }

  document.querySelectorAll('[data-order-service]').forEach((button) => {
    button.addEventListener('click', () => selectService(button.dataset.orderService));
  });

  const initialService = new URLSearchParams(location.search).get('service');
  if (initialService) {
    selectService(initialService, location.hash === '#order-request' || location.hash === '#request');
  }

  function resetForm() {
    form.reset();
    form.hidden = false;
    formSuccess.hidden = true;
    currentStep = 1;
    updateZhkOptions();
    renderSteps();
    setAlert();
  }
  newOrderButton?.addEventListener('click', resetForm);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep(3)) return;

    const name = document.getElementById('name').value.trim();
    const phone = phoneInput.value.trim();
    const consent = document.getElementById('consent').checked;

    if (name.length < 2) {
      setAlert('error', 'Укажите имя.');
      document.getElementById('name').focus();
      return;
    }
    if (!validRuPhone(phone)) {
      setAlert('error', 'Проверьте номер телефона.');
      phoneInput.focus();
      return;
    }
    if (!consent) {
      setAlert('error', 'Подтвердите согласие на обработку персональных данных.');
      document.getElementById('consent').focus();
      return;
    }

    const payload = {
      service: selectedService(),
      city: citySelect.value,
      zhk: resolveZhk(),
      house: resolveAddress(),
      entrance: document.getElementById('entrance').value.trim(),
      flat: document.getElementById('flat').value.trim(),
      floor: document.getElementById('floor').value.trim(),
      name,
      phone,
      comment: document.getElementById('comment').value.trim(),
      consent: true,
      website: document.getElementById('website').value
    };

    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Отправляем…';
    setAlert();

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось отправить заявку');

      form.hidden = true;
      formSuccess.hidden = false;
      successText.textContent = data.id
        ? `Заявка №${data.id} сохранена. Свяжемся с вами для уточнения расчёта и даты.`
        : 'Заявка принята.';
    } catch (error) {
      setAlert('error', error.message || 'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });

  updateZhkOptions();
  renderSteps();
})();
