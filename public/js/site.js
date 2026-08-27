const form = document.getElementById('orderForm');
const alertBox = document.getElementById('formAlert');
const orderModal = document.getElementById('orderModal');
const heroTitle = document.getElementById('heroTitle');
const heroLead = document.getElementById('heroLead');
const heroCopy = document.getElementById('heroCopy');
const heroOrderButton = document.getElementById('heroOrderButton');
const serviceSelect = document.getElementById('service');

const openButtons = document.querySelectorAll('.open-order');
const closeButtons = document.querySelectorAll('[data-close-modal]');
const serviceTabs = document.querySelectorAll('.service-tab');

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

const clientTitle = document.getElementById('clientTitle');
const clientSubtitle = document.getElementById('clientSubtitle');
const clientText = document.getElementById('clientText');
const clientVisual = document.getElementById('clientVisual');
const clientProgress = document.getElementById('clientProgress');
const clientPrev = document.getElementById('clientPrev');
const clientNext = document.getElementById('clientNext');

let clientIndex = 0;

function setAlert(type, text) {
  if (!alertBox) return;
  alertBox.className = 'alert ' + type;
  alertBox.textContent = text;
}

function openModal(selectedService) {
  if (selectedService && serviceSelect) {
    serviceSelect.value = selectedService;
  }
  orderModal?.classList.add('is-open');
  orderModal?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  orderModal?.classList.remove('is-open');
  orderModal?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

openButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const service = btn.dataset.service || heroOrderButton?.dataset.service || 'Мойка окон и фасадов';
    openModal(service);
  });
});

closeButtons.forEach((btn) => btn.addEventListener('click', closeModal));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function updateHeroFromTab(tab) {
  if (!tab) return;
  serviceTabs.forEach((item) => item.classList.remove('is-active'));
  tab.classList.add('is-active');

  const title = tab.dataset.title || '';
  const lead = tab.dataset.lead || '';
  const text = tab.dataset.text || '';
  const button = tab.dataset.button || 'Оставить заявку';
  const service = tab.dataset.service || 'Мойка окон и фасадов';

  heroTitle.textContent = title;
  heroLead.textContent = lead;
  heroCopy.textContent = text;
  heroOrderButton.textContent = button;
  heroOrderButton.dataset.service = service;
  if (serviceSelect) serviceSelect.value = service;
}

serviceTabs.forEach((tab) => {
  tab.addEventListener('click', () => updateHeroFromTab(tab));
});

function renderClient(index) {
  const item = clientCases[index];
  if (!item) return;
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
    name: document.getElementById('name').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    zhk: document.getElementById('zhk').value.trim(),
    house: document.getElementById('house').value.trim(),
    entrance: document.getElementById('entrance').value.trim(),
    flat: document.getElementById('flat').value.trim(),
    service: document.getElementById('service').value,
    comment: document.getElementById('comment').value.trim(),
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = {};
    try {
      data = await res.json();
    } catch (jsonError) {
      data = {};
    }

    if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка отправки заявки');

    form.reset();
    setAlert('success', 'Заявка успешно отправлена. Она уже появилась в админке.');
    setTimeout(closeModal, 1200);
  } catch (err) {
    setAlert('error', err.message || 'Ошибка отправки заявки');
  }
});

updateHeroFromTab(document.querySelector('.service-tab.is-active'));
renderClient(clientIndex);
