(() => {
  const form = document.getElementById('loginForm');
  const errorBox = document.getElementById('loginError');
  const button = document.getElementById('loginButton');

  async function checkExistingSession() {
    try {
      const response = await fetch('/api/admin/me', { cache: 'no-store' });
      if (response.ok) location.replace('/admin/dashboard.html');
    } catch (_) {}
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.textContent = '';
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Проверяем…';

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: document.getElementById('login').value.trim(),
          password: document.getElementById('password').value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось войти');
      location.replace('/admin/dashboard.html');
    } catch (error) {
      errorBox.textContent = error.message || 'Ошибка входа';
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  checkExistingSession();
})();
