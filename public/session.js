// Event session page: mounts the Kaltura webcast player and the Chat & Collaboration (CnC)
// embedded widgets directly into this page's DOM, using tokens issued by our server.
(() => {
  const $ = (id) => document.getElementById(id);
  const state = (window.__epPoc = { player: null, cnc: null });

  const ERRORS = {
    session_not_found: 'This session could not be found.',
    unsupported_session_type: 'This session type is not supported by this site yet (webcast and simulive only).',
    upstream_error: 'We could not reach the event service. Please refresh to try again.',
  };

  function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  function renderPage(cfg) {
    if (cfg.site?.brandColor) document.documentElement.style.setProperty('--brand', cfg.site.brandColor);
    $('event-name').textContent = cfg.event.name;
    $('user-name').textContent = cfg.user.name;
    $('session-name').textContent = cfg.session.name;
    $('session-description').textContent = cfg.session.description;
    document.title = `${cfg.session.name} · ${cfg.event.name}`;
    if (cfg.session.startDate) {
      const fmt = { dateStyle: 'medium', timeStyle: 'short' };
      const start = new Date(cfg.session.startDate).toLocaleString(undefined, fmt);
      const end = cfg.session.endDate ? new Date(cfg.session.endDate).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '';
      $('session-time').textContent = end ? `${start} – ${end}` : start;
    }

    if (cfg.sessions.length > 1) {
      const select = $('session-switcher');
      for (const s of cfg.sessions) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        opt.selected = s.id === cfg.session.id;
        select.appendChild(opt);
      }
      select.hidden = false;
      select.addEventListener('change', () => {
        window.location.assign(`/session?id=${encodeURIComponent(select.value)}`);
      });
    }
  }

  // ---- Kaltura Player (webcast) ----------------------------------------------------------
  function setupPlayer(cfg) {
    const player = window.KalturaPlayer.setup({
      targetId: 'player',
      provider: {
        partnerId: cfg.player.partnerId,
        uiConfId: cfg.player.uiConfId,
        ks: cfg.player.ks,
      },
    });
    player.loadMedia({ entryId: cfg.player.entryId });
    state.player = player;
  }

  // ---- Chat & Collaboration --------------------------------------------------------------
  function setupCnc(cfg) {
    const c = cfg.cnc;
    const panel = $('chat-panel');
    const reactionsOn = Boolean(c.reactionsSourceUrl);

    const cncConfig = {
      consent: {
        legalTextUrls: { en: new URL(c.legalTextUrl, window.location.origin).href },
        defaultSettings: { receiveNotifications: true, showFullName: true, allowChatAndCollaboration: true },
        cookieConsent: true,
      },
      server: { jwtToken: c.jwt, serviceUrl: c.serviceUrl },
      reactions: reactionsOn
        ? { mode: 'on', sourceUrl: c.reactionsSourceUrl, endpointUrl: c.analyticsUrl, ks: c.ks }
        : { mode: 'off' },
      ui: {
        theme: { brandColor: c.brandColor, mode: c.themeMode, meta: { version: 2 } },
        locale: 'en',
        zIndex: 500,
        groupChat: { enabled: true, reactions: true, reply: true },
        instanceOptions: { enableChat: true, enableSearch: true, enableAssistant: false },
      },
      moderation: { moderatorUrl: c.moderatorUrl },
    };

    const api = window.KalturaEventsPlatform.collaboration.widgets.embedded.new();
    state.cnc = api;

    api.addOnLoadFinished(() => {
      api.renderCnc($('cnc-chat'));
      api.renderSidebarButtons($('cnc-sidebar-buttons'));
      api.renderSidebarSettings($('cnc-sidebar-settings'));
      if (reactionsOn) {
        api.renderReactions($('cnc-reactions'));
        api.renderLiveReactions($('live-reactions'));
      }
    });
    api.addOnClose(() => panel.classList.add('collapsed'));
    api.addOnOpen(() => panel.classList.remove('collapsed'));
    api.renderCncContainer($('cnc-container'), cncConfig);
  }

  // ---- Boot ------------------------------------------------------------------------------
  async function main() {
    $('logout').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      window.location.assign('/');
    });

    const id = new URLSearchParams(window.location.search).get('id');
    const res = await fetch(`/api/session-config${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store' });
    if (res.status === 401) return window.location.replace('/');
    const cfg = await res.json().catch(() => ({}));
    if (!res.ok) {
      $('content').hidden = true;
      return showError($('page-error'), ERRORS[cfg.error] || ERRORS.upstream_error);
    }

    renderPage(cfg);

    // Load the player bundle first and set it up, then the CnC bundle, so the two
    // embedPlaykitJs bundles never race over the shared KalturaPlayer global.
    try {
      await loadScript(cfg.player.scriptUrl);
      setupPlayer(cfg);
    } catch (e) {
      console.error(e);
      showError($('page-error'), 'The video player failed to load. Please refresh the page.');
    }

    try {
      await loadScript(cfg.cnc.scriptUrl);
      setupCnc(cfg);
    } catch (e) {
      console.error(e);
      showError($('chat-error'), 'Chat failed to load. Please refresh the page.');
    }
  }

  main().catch((e) => {
    console.error(e);
    showError($('page-error'), ERRORS.upstream_error);
  });
})();
