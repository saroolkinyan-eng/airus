const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: document.getElementById('login').value.trim(),
        password: document.getElementById('password').value
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка входа');
    localStorage.setItem('airus_admin', JSON.stringify(data.user));
    location.href = '/admin/dashboard.html';
  } catch (err) {
    loginError.textContent = err.message || 'Ошибка входа';
  }
});
