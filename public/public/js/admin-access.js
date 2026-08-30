(() => {
  const links = Array.from(document.querySelectorAll('.admin-login-link'));
  if (!links.length) return;

  async function syncAdminAccess() {
    try {
      const response = await fetch('/api/admin/me', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (!response.ok) return;
      links.forEach((link) => {
        link.href = '/admin/dashboard.html';
        link.textContent = 'Админка';
        link.classList.add('is-authenticated');
        link.setAttribute('aria-label', 'Открыть панель заказов');
        link.title = 'Устройство уже авторизовано';
      });
    } catch (_) {}
  }

  syncAdminAccess();
})();
