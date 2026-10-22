// Admin helpers: a generic edit dialog and the passenger/driver details dialog.
(function () {
  const { api, h, fmt, badge } = CAB;

  // fields: [{ name, label, type?, options?, required?, min?, max?, step?, pattern?, maxlength?, help? }]
  function editDialog(title, fields, values, onSave) {
    const input = (f) => {
      if (f.options) return h('select', { name: f.name, required: f.required }, f.options.map((o) => h('option', { value: o }, o)));
      if (f.type === 'textarea') return h('textarea', { name: f.name, required: f.required, maxlength: f.maxlength });
      return h('input', { name: f.name, type: f.type || 'text', required: f.required, min: f.min, max: f.max, step: f.step, pattern: f.pattern, maxlength: f.maxlength, minlength: f.minlength });
    };
    const form = h('form', { class: 'form' },
      h('div', { class: 'fields' }, fields.map((f) => f.type === 'checkbox'
        ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: f.name }), f.label)
        : h('label', { class: 'field' }, f.label, f.help ? h('small', {}, f.help) : null, input(f)))),
      h('p', { class: 'form-error', role: 'alert' }),
      h('button', { class: 'btn primary', type: 'submit' }, 'Save'));
    CAB.fill(form, values || {});
    const dlg = CAB.modal(title, form);
    CAB.form(form, async (data) => {
      const r = await onSave(data);
      CAB.toast((r && r.message) || 'Saved', 'ok');
      dlg.close();
    });
    return dlg;
  }

  async function userDialog(userId) {
    const d = await api(`/api/admin/users/${userId}`).catch((e) => (CAB.toast(e.message, 'bad'), null));
    if (!d) return;
    const u = d.user;
    const p = d.profile || {};
    const kv = [['Email', u.email], ['Mobile', u.mobile], ['Status', badge(u.status)], ['Joined', fmt.day(u.created_at)]];
    if (u.role === 'PASSENGER') kv.push(['Address', p.default_address || '—'], ['Emergency', p.emergency_contact || '—']);
    else kv.push(['Licence', `${p.license_no} (exp. ${fmt.day(p.license_expiry)})`], ['Verification', badge(p.verification_status)], ['Availability', badge(p.availability)], ['Rating', p.rating ? `★ ${p.rating}` : '—']);
    const box = h('div', { class: 'stack' },
      h('dl', { class: 'kv' }, kv.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      d.vehicles.length ? h('div', {}, h('h3', {}, 'Vehicles'), h('p', { class: 'mono' }, d.vehicles.map((x) => `${x.vehicle_number} ${x.vehicle_type} (${x.status})`).join(' · '))) : null,
      h('h3', {}, 'Recent bookings'), h('div', { id: 'ud-bookings' }));
    CAB.modal(`${u.name} · ${u.role}`, box);
    CAB.table(box.querySelector('#ud-bookings'), [
      { label: 'When', render: (r) => fmt.date(r.requested_at) },
      { label: 'Route', render: (r) => `${r.pickup_location} → ${r.destination}` },
      { label: 'Status', render: (r) => badge(r.stage) },
      { label: 'Fare', class: 'num', render: (r) => fmt.money(r.fare ?? r.estimated_fare) },
    ], d.bookings, 'No bookings.');
  }

  const stat = (label, value, note, alert) =>
    h('div', { class: `stat${alert ? ' alert' : ''}` }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), note ? h('div', { class: 'stat-note' }, note) : null);

  window.ADMIN = { editDialog, userDialog, stat };
})();
