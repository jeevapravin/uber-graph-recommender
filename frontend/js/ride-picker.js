// Pickup/destination selects + vehicle options with live estimates (search-ride and book-ride pages).
// ridePicker(form, { onEstimate(option, search) }) fills form.pickup_area_id, form.drop_area_id and the vehicle radios.
window.ridePicker = async function ridePicker(form, { onEstimate } = {}) {
  const { api, h, $, fmt } = CAB;
  const areas = await api('/api/areas');
  const params = new URLSearchParams(location.search);
  for (const name of ['pickup_area_id', 'drop_area_id']) {
    const sel = form.elements[name];
    sel.append(h('option', { value: '' }, 'Choose an area'), ...areas.map((a) => h('option', { value: a.area_id }, a.area_name)));
  }
  form.elements.pickup_area_id.value = params.get('from') || '';
  form.elements.drop_area_id.value = params.get('to') || '';
  const box = $('#options', form);
  let last = null;

  const chosen = () => last && last.options.find((o) => o.vehicle_type === (form.elements.vehicle_type && form.elements.vehicle_type.value));
  const emit = () => onEstimate && onEstimate(chosen() || null, last);

  async function refresh() {
    const from = form.elements.pickup_area_id.value;
    const to = form.elements.drop_area_id.value;
    if (!from || !to || from === to) {
      last = null;
      box.replaceChildren(h('p', { class: 'muted' }, from && from === to ? 'Pickup and destination must differ.' : 'Choose both areas to see fares.'));
      return emit();
    }
    box.replaceChildren(h('p', { class: 'muted' }, 'Checking fares…'));
    try {
      last = await api(`/api/rides/search?from=${from}&to=${to}`);
    } catch (ex) {
      box.replaceChildren(h('p', { class: 'form-error' }, ex.message));
      return;
    }
    const want = params.get('type') || (chosen() && chosen().vehicle_type);
    box.replaceChildren(
      h('p', { class: 'muted mono', style: { margin: 0 } },
        `${fmt.km(last.km)} · about ${last.minutes} min${last.surge > 1 ? ` · surge ×${last.surge}` : ''}`),
      h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Vehicle type' },
        last.options.map((o) =>
          h('label', {},
            h('input', { type: 'radio', name: 'vehicle_type', value: o.vehicle_type, required: true, checked: o.vehicle_type === want }),
            h('span', {}, h('b', {}, o.vehicle_type), h('em', {}, fmt.money(o.estimated_fare)),
              h('small', {}, o.drivers_available ? `${o.drivers_available} driver${o.drivers_available > 1 ? 's' : ''} free` : 'no driver online'))))),
      last.maintenance_mode ? h('p', { class: 'form-error' }, 'Bookings are paused for maintenance.') : null,
    );
    emit();
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'vehicle_type') emit();
    else if (['pickup_area_id', 'drop_area_id'].includes(e.target.name)) refresh();
  });
  const swap = $('[data-swap]', form);
  if (swap) swap.addEventListener('click', () => {
    const a = form.elements.pickup_area_id;
    const b = form.elements.drop_area_id;
    [a.value, b.value] = [b.value, a.value];
    refresh();
  });
  await refresh();
  return { get search() { return last; }, get option() { return chosen(); }, refresh };
};

// the taximeter figure wants { total, km, min, base, perKm, perMin, type }
window.meterData = (o, s) => (o && s ? { total: o.estimated_fare, km: s.km, min: s.minutes, base: o.base_fare, perKm: o.per_km_rate, perMin: o.per_minute_rate, type: o.vehicle_type } : null);
