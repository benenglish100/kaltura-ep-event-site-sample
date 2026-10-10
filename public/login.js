(() => {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submit = document.getElementById('login-submit');

  const MESSAGES = {
    missing_credentials: 'Enter your username and password.',
    invalid_credentials: 'Incorrect username or password.',
    not_registered: 'You are not registered for this event.',
    too_many_attempts: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  };

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  fetch('/api/event')
    .then((r) => (r.ok ? r.json() : null))
    .then((event) => {
      if (!event) return;
      if (event.site?.brandColor) document.documentElement.style.setProperty('--brand', event.site.brandColor);
      if (event.site?.title) document.getElementById('site-title').textContent = event.site.title;
      if (!event.name) return;
      document.getElementById('event-name').textContent = event.name;
      document.title = `Sign in · ${event.name}`;
      if (event.startDate) {
        const el = document.getElementById('event-date');
        el.textContent = new Date(event.startDate).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
        el.hidden = false;
      }
    })
    .catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) return showError(MESSAGES.missing_credentials);

    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.assign(body.redirect || '/session');
        return;
      }
      showError(MESSAGES[body.error] || 'Sign-in is unavailable right now. Please try again.');
    } catch {
      showError('Network error. Check your connection and try again.');
    }
    submit.disabled = false;
    submit.textContent = 'Sign in';
  });
})();
