// Shared browser code for every page: session, fetch wrapper, role guard + nav, DOM helpers, figures.
(function () {
  'use strict';

  // append/replaceChildren render null as the text "null"; drop empty children so `cond ? node : null` works everywhere
  for (const name of ['append', 'replaceChildren']) {
    const native = Element.prototype[name];
    Element.prototype[name] = function (...kids) {
      return native.apply(this, kids.filter((k) => k !== null && k !== undefined && k !== false));
    };
  }

  // ---------- session (token + user in localStorage) ----------
  const store = {
    get(k) {
      try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
    },
    set(k, v) {
      try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
    },
  };
  const session = {
    get token() { return store.get('cab.token'); },
    get user() { return store.get('cab.user'); },
    save(token, user) { store.set('cab.token', token); store.set('cab.user', user); },
    clear() { store.set('cab.token', null); store.set('cab.user', null); },
  };

  const HOME = {
    PASSENGER: '/passenger-dashboard.html',
    DRIVER: '/driver-dashboard.html',
    ADMIN: '/admin-dashboard.html',
    SUPER_ADMIN: '/superadmin-dashboard.html',
  };

  // ---------- AJAX: every call goes through fetch, JSON in and out ----------
  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (session.token) headers.Authorization = `Bearer ${session.token}`;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error('Network error: is the server running?');
    }
    if (raw && res.ok) return res;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && session.token) {
      session.clear();
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    }
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  // ---------- DOM builder: h('a', {href}, 'text', child) — text is always set as text, never HTML ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- formatting ----------
  const fmt = {
    money: (n) => (n === null || n === undefined || n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`),
    num: (n, d = 0) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d })),
    km: (n) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(1)} km`),
    date(s) {
      if (!s) return '—';
      const d = new Date(String(s).replace(' ', 'T'));
      // non-breaking spaces keep "26 Oct, 10:44 am" on one line in narrow table cells
      return isNaN(d) ? s : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/ /g, '\u00a0');
    },
    day(s) {
      if (!s) return '—';
      const d = new Date(String(s).slice(0, 10) + 'T00:00');
      return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    stars: (n) => (n ? h('span', { class: 'stars', title: `${n} / 5`, 'aria-label': `${n} out of 5 stars` }, '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))) : '—'),
  };

  const TONE = {
    ACTIVE: 'ok', APPROVED: 'ok', COMPLETED: 'ok', PAID: 'ok', ONLINE: 'ok', RESOLVED: 'ok',
    PENDING: 'warn', SEARCHING: 'warn', REQUESTED: 'warn', OPEN: 'warn', ACCEPTED: 'info', STARTED: 'info',
    BLOCKED: 'bad', REJECTED: 'bad', CANCELLED: 'bad', INACTIVE: 'mute', OFFLINE: 'mute', REFUNDED: 'mute', SOS: 'bad',
  };
  const LIVE = new Set(['SEARCHING', 'ACCEPTED', 'STARTED', 'ONLINE', 'OPEN']);
  function badge(status) {
    if (!status) return h('span', { class: 'muted' }, '—');
    return h('span', { class: `badge ${TONE[status] || 'mute'}${LIVE.has(status) ? ' live' : ''}` }, String(status).replace(/_/g, ' '));
  }

  // ---------- toasts ----------
  function toast(msg, kind = 'info') {
    let box = $('.toasts');
    if (!box) document.body.append((box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })));
    const t = h('div', { class: `toast ${kind}` }, msg);
    box.append(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 260);
    }, 3800);
  }

  // ---------- tables ----------
  // cols: [{ label, key } | { label, render(row) => Node|string, class }]
  function table(container, cols, rows, emptyText = 'Nothing here yet.') {
    container.replaceChildren();
    if (!rows.length) return container.append(h('div', { class: 'table-wrap' }, h('div', { class: 'empty' }, emptyText)));
    const body = rows.map((r, i) =>
      h('tr', { class: 'enter', style: { animationDelay: `${Math.min(i, 12) * 25}ms` } },
        cols.map((c) => h('td', { class: c.class }, c.render ? c.render(r) : r[c.key] ?? '—'))),
    );
    container.append(h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.class, scope: 'col' }, c.label)))), h('tbody', {}, body))));
  }

  // ---------- forms: HTML5 validation first, then the API; errors land next to the button ----------
  function form(el, onSubmit) {
    const err = el.querySelector('.form-error') || el.appendChild(h('p', { class: 'form-error', role: 'alert' }));
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!el.reportValidity()) return;
      const data = {};
      for (const [k, v] of new FormData(el)) data[k] = typeof v === 'string' ? v.trim() : v;
      $$('input[type=checkbox][name]', el).forEach((c) => (data[c.name] = c.checked));
      const btn = el.querySelector('[type=submit]');
      btn && (btn.disabled = true, btn.classList.add('busy'));
      try {
        await onSubmit(data, el);
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn && (btn.disabled = false, btn.classList.remove('busy'));
      }
    });
  }
  function fill(el, data) {
    for (const [k, v] of Object.entries(data || {})) {
      const input = el.elements[k];
      if (!input) continue;
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v ?? '';
    }
  }

  // run an action from a button: busy state, toast on success or error, then refresh
  async function act(btn, fn, after) {
    btn.disabled = true;
    btn.classList.add('busy');
    try {
      const r = await fn();
      if (r && r.message) toast(r.message, 'ok');
      if (after) await after(r);
      return r;
    } catch (ex) {
      toast(ex.message, 'bad');
    } finally {
      btn.disabled = false;
      btn.classList.remove('busy');
    }
  }

  // ---------- dialog ----------
  function modal(title, content) {
    const dlg = h('dialog', { 'aria-label': title },
      h('div', { class: 'dlg-head' }, h('h2', {}, title), h('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
      h('div', { class: 'dlg-body' }, content));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }

  // ---------- polling that pauses while the tab is hidden ----------
  function poll(fn, ms) {
    let timer;
    const tick = async () => {
      if (!document.hidden) await fn().catch(() => {});
      timer = setTimeout(tick, ms);
    };
    tick();
    return () => clearTimeout(timer);
  }

  // ---------- CSV download (needs the auth header, so fetch + blob instead of a plain link) ----------
  async function download(path, filename) {
    const res = await api(path, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- isometric figures (public/figures/*.js); a missing figure never breaks the page ----------
  const FIG_KEYS = { taximeter: 'taximeter', 'taxi-sign': 'taxiSign', 'trip-route': 'tripRoute', 'receipt-printer': 'receiptPrinter' };
  const loading = {};
  const NOOP = { set() {}, destroy() {} };
  function figure(name, el, opts = {}) {
    if (!el) return Promise.resolve(NOOP);
    loading[name] = loading[name] || new Promise((resolve) => {
      const s = h('script', { src: `/figures/${name}.js` });
      s.onload = resolve;
      s.onerror = resolve;
      document.head.append(s);
    });
    return loading[name].then(() => {
      const lib = window.CabFig && window.CabFig[FIG_KEYS[name]];
      if (!lib) {
        el.remove();
        return NOOP;
      }
      try {
        return lib.mount(el, opts) || NOOP;
      } catch (ex) {
        console.warn('figure failed', name, ex);
        return NOOP;
      }
    });
  }

  // ---------- nav per role (admin links depend on permissions) ----------
  const NAV = {
    PUBLIC: [['/index.html', 'Home'], ['/search-ride.html', 'Search rides'], ['/login.html', 'Log in'], ['/register.html', 'Sign up']],
    PASSENGER: [['/passenger-dashboard.html', 'Dashboard'], ['/book-ride.html', 'Book a ride'], ['/active-trip.html', 'Active trip'], ['/trip-history.html', 'Trip history'], ['/support.html', 'Support'], ['/profile.html', 'Profile']],
    DRIVER: [['/driver-dashboard.html', 'Dashboard'], ['/ride-requests.html', 'Ride requests'], ['/active-trip.html', 'Active trip'], ['/vehicles.html', 'Vehicles'], ['/earnings.html', 'Earnings'], ['/trip-history.html', 'Trips'], ['/support.html', 'Support'], ['/profile.html', 'Profile']],
    ADMIN: [
      ['/admin-dashboard.html', 'Dashboard'],
      ['/manage-passengers.html', 'Passengers', 'MANAGE_PASSENGERS'],
      ['/manage-drivers.html', 'Drivers', 'MANAGE_DRIVERS'],
      ['/manage-vehicles.html', 'Vehicles', 'MANAGE_VEHICLES'],
      ['/manage-trips.html', 'Trips', 'MANAGE_TRIPS'],
      ['/manage-tickets.html', 'Tickets', 'MANAGE_TRIPS'],
      ['/fare-rules.html', 'Fares & areas', 'MANAGE_FARES'],
      ['/reports.html', 'Reports', 'VIEW_REPORTS'],
      ['/system-logs.html', 'Logs', 'VIEW_LOGS'],
      ['/system-settings.html', 'Settings'],
      ['/profile.html', 'Profile'],
    ],
  };
  NAV.SUPER_ADMIN = [
    ['/superadmin-dashboard.html', 'Dashboard'], ['/manage-admins.html', 'Admins'], ['/permissions.html', 'Permissions'],
    ...NAV.ADMIN.filter(([href]) => !['/admin-dashboard.html', '/profile.html'].includes(href)),
    ['/admin-dashboard.html', 'Operations'], ['/profile.html', 'Profile'],
  ];

  function renderNav(user) {
    const role = user ? user.role : 'PUBLIC';
    const perms = (user && user.permissions) || [];
    const links = NAV[role].filter(([, , perm]) => !perm || role === 'SUPER_ADMIN' || perms.includes(perm));
    const here = location.pathname === '/' ? '/index.html' : location.pathname;
    const header = $('#nav') || document.body.prepend(h('header', { id: 'nav' })) || $('#nav');
    header.className = 'topbar';
    header.replaceChildren(
      h('div', { class: 'topbar-in' },
        h('a', { class: 'brand', href: user ? HOME[role] : '/' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'TAXI'), h('span', { class: 'app-name' }, window.CAB_APP_NAME || 'CabGo')),
        h('nav', { class: 'nav', 'aria-label': 'Main' }, links.map(([href, label]) => h('a', { href, 'aria-current': href === here ? 'page' : null }, label))),
        user
          ? h('div', { class: 'who' }, h('span', { class: 'who-name' }, user.name), h('span', { class: 'role-chip' }, role.replace('_', ' ')),
              h('button', { class: 'btn small', onclick: logout }, 'Log out'))
          : null,
      ),
    );
    const cur = $('.nav [aria-current]');
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    session.clear();
    location.href = '/login.html';
  }

  // page({ roles }) → the fresh user from /api/auth/me, or redirects to login / the user's own home
  async function page({ roles } = {}) {
    api('/api/config').then((c) => {
      window.CAB_APP_NAME = c.app_name;
      $$('.app-name').forEach((e) => (e.textContent = c.app_name));
    }).catch(() => {});
    if (!roles) {
      renderNav(null);
      if (session.token) {
        const u = await api('/api/auth/me').then((r) => r.user).catch(() => null);
        if (u) renderNav(u);
        return u;
      }
      return null;
    }
    if (!session.token) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname)}`;
      return new Promise(() => {});
    }
    const user = await api('/api/auth/me').then((r) => r.user).catch(() => null);
    if (!user) {
      session.clear();
      location.href = '/login.html';
      return new Promise(() => {});
    }
    const ok = roles.includes(user.role) || (user.role === 'SUPER_ADMIN' && roles.includes('ADMIN'));
    if (!ok) {
      location.href = HOME[user.role];
      return new Promise(() => {});
    }
    renderNav(user);
    return user;
  }

  // fare lines for receipts (and the receipt-printer figure) from a booking row
  function receiptLines(b) {
    const f = typeof b.fare_details === 'string' ? JSON.parse(b.fare_details) : b.fare_details;
    if (!f) return [{ label: b.stage === 'CANCELLED' ? 'Cancellation fee' : 'Fare', amount: Number(b.payment_amount ?? b.fare ?? 0) }];
    const lines = [
      { label: 'Base fare', amount: f.base_fare },
      { label: `Distance ${f.km} km × ${f.per_km_rate}`, amount: f.distance },
      { label: `Time ${f.minutes} min × ${f.per_minute_rate}`, amount: f.time },
    ];
    if (f.surge > 1) lines.push({ label: `Surge × ${f.surge}`, amount: Math.round(f.subtotal - (f.base_fare + f.distance + f.time)) });
    if (f.discount) lines.push({ label: 'Promo discount', amount: -f.discount });
    return lines;
  }

  // a confirm dialog that resolves true/false (no window.confirm)
  function confirmBox(title, text, okLabel = 'Confirm', danger = false) {
    return new Promise((resolve) => {
      let answer = false;
      const dlg = modal(title, h('div', { class: 'stack' }, h('p', {}, text),
        h('div', { class: 'row' }, h('span', { class: 'spacer' }),
          h('button', { class: 'btn', onclick: () => dlg.close() }, 'Back'),
          h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { answer = true; dlg.close(); } }, okLabel))));
      dlg.addEventListener('close', () => resolve(answer));
    });
  }

  window.CAB = { api, session, h, $, $$, fmt, badge, toast, table, form, fill, act, modal, confirmBox, poll, download, figure, page, HOME, logout, receiptLines };
})();
