/* ============================================
   PlanTrip APC — Application Logic
   ============================================ */

const App = (() => {
  // ---- State ----
  let user = null;
  let trips = [];
  let currentTripId = null;
  let currentScreen = 'home';
  let splitType = 'equal';
  let editingActivityId = null;
  let editingExpenseId = null;
  let onConfirmAction = null;

  // ---- Member Colors ----
  const MEMBER_COLORS = [
    '#6C5CE7', '#FD79A8', '#00CEC9', '#FAB1A0',
    '#636E72', '#00B894', '#D63031', '#FF7675',
    '#4834D4', '#E17055'
  ];

  // ---- Destination Images (Unsplash Source Fallback) ----
  function getDestinationImage(destination) {
    const query = encodeURIComponent(destination + ' travel landmark');
    return `https://source.unsplash.com/800x400/?${query}`;
  }

  // ---- Fetch Real Images (Wikipedia API) ----
  async function fetchDestinationImage(destination) {
    try {
      const res = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(destination)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.originalimage && data.originalimage.source) {
          return data.originalimage.source;
        } else if (data.thumbnail && data.thumbnail.source) {
          return data.thumbnail.source.replace(/\d+px-/, '800px-');
        }
      }
    } catch (e) {
      console.warn('Wikipedia image fetch failed:', e);
    }
    return '';
  }

  // ---- Generate Trip Code ----
  function generateCode(destination) {
    const prefix = destination
      .replace(/[^a-zA-Z]/g, '')
      .substring(0, 5)
      .toUpperCase();
    const year = new Date().getFullYear();
    return `${prefix}${year}`;
  }

  // ---- LocalStorage & API ----
  const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api/trips' : '/api/trips';

  function save() {
    localStorage.setItem('plantrip_user', JSON.stringify(user));
    if (currentTripId) localStorage.setItem('plantrip_currentTrip', currentTripId);

    // Sincronizar el viaje actual con el backend siempre que haya cambios
    const trip = getCurrentTrip();
    if (trip && trip.id) {
      fetch(`${API_URL}/${trip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trip)
      }).catch(e => console.error('Error sincronizando el viaje:', e));
    }
  }

  async function load() {
    try {
      user = JSON.parse(localStorage.getItem('plantrip_user'));
      currentTripId = localStorage.getItem('plantrip_currentTrip') || null;

      if (user) {
        const res = await fetch(`${API_URL}/user/${user.id}`);
        if (res.ok) {
          trips = await res.json();
        } else {
          trips = [];
        }
      }
    } catch(e) {
      console.error('Error cargando datos:', e);
      user = null;
      trips = [];
    }
  }

  // ---- Current Trip ----
  function getCurrentTrip() {
    return trips.find(t => t.id === currentTripId) || null;
  }

  // ---- Toast ----
  function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ---- Navigation ----
  function navigate(screen) {
    currentScreen = screen;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screen}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-screen="${screen}"]`);
    if (navBtn) navBtn.classList.add('active');

    const fab = document.getElementById('fab');
    if (screen === 'itinerary' || screen === 'expenses') {
      fab.classList.remove('hidden');
    } else {
      fab.classList.add('hidden');
    }

    // Refresh screen content
    if (screen === 'home') renderHome();
    if (screen === 'dashboard') renderDashboard();
    if (screen === 'itinerary') renderItinerary();
    if (screen === 'expenses') renderExpenses();
  }

  // ---- FAB Click ----
  function onFabClick() {
    if (currentScreen === 'itinerary') openActivityModal();
    if (currentScreen === 'expenses') openExpenseModal();
  }

  // ---- Modal Helpers ----
  function openModal(id) {
    document.getElementById(id).classList.add('active');
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'activityModal') editingActivityId = null;
    if (id === 'expenseModal') editingExpenseId = null;
  }

  // ---- Confirmation Modal ----
  function appConfirm(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const btn = document.getElementById('confirmActionBtn');
    
    // Replace listener
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.onclick = () => {
      callback();
      closeModal('confirmModal');
    };
    
    openModal('confirmModal');
  }

  // ---- Name Setup ----
  function saveName() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) { showToast('Introduce tu nombre', 'error'); return; }
    user = { id: 'user_' + Date.now(), name };
    save();
    document.getElementById('nameSetup').classList.add('hidden');
    renderHome();
  }

  function showSettings() {
    document.getElementById('settingsName').value = user?.name || '';
    openModal('settingsModal');
  }

  function updateName() {
    const name = document.getElementById('settingsName').value.trim();
    if (!name) { showToast('Introduce tu nombre', 'error'); return; }
    user.name = name;
    save();
    closeModal('settingsModal');
    renderHome();
    showToast('Nombre actualizado ✓', 'success');
  }

  // ---- CREATE TRIP ----
  async function createTrip() {
    const destination = document.getElementById('tripDestination').value.trim();
    const startDate = document.getElementById('tripStartDate').value;
    const endDate = document.getElementById('tripEndDate').value;

    if (!destination) { showToast('Introduce un destino', 'error'); return; }
    if (!startDate || !endDate) { showToast('Selecciona las fechas', 'error'); return; }
    if (new Date(endDate) < new Date(startDate)) { showToast('La fecha de fin debe ser posterior', 'error'); return; }

    showToast('Buscando foto del destino...', 'success');
    const imageUrl = await fetchDestinationImage(destination);
    showToast('Creando viaje...', 'success');

    const code = generateCode(destination);
    const trip = {
      id: 'trip_' + Date.now(),
      code,
      destination,
      startDate,
      endDate,
      members: [{ id: user.id, name: user.name }],
      imageUrl,
      activities: [],
      expenses: [],
      createdAt: new Date().toISOString()
    };

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trip)
      });
      if (!res.ok) throw new Error('Error en el servidor');
      
      const savedTrip = await res.json();
      trips.push(savedTrip);
      currentTripId = savedTrip.id;
      
      // Solo guardamos en localStorage, no llamamos a save() para evitar un PUT innecesario
      localStorage.setItem('plantrip_currentTrip', currentTripId);

      // Limpiar formulario
      document.getElementById('tripDestination').value = '';
      document.getElementById('tripStartDate').value = '';
      document.getElementById('tripEndDate').value = '';

      showToast(`¡Viaje a ${destination} creado! Código: #${code}`, 'success');
      navigate('dashboard');
    } catch (e) {
      console.error(e);
      showToast('Error al crear el viaje', 'error');
    }
  }

  // ---- JOIN TRIP ----
  async function joinTrip() {
    const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
    if (!code) { showToast('Introduce un código de viaje', 'error'); return; }

    try {
      const res = await fetch(`${API_URL}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, user })
      });
      
      if (!res.ok) {
        showToast('Viaje no encontrado o error. Comprueba el código.', 'error');
        return;
      }
      
      const trip = await res.json();
      
      const existingIdx = trips.findIndex(t => t.id === trip.id);
      if (existingIdx !== -1) {
        trips[existingIdx] = trip;
        showToast('¡Ya estás en este viaje!');
      } else {
        trips.push(trip);
        showToast(`¡Te uniste al viaje a ${trip.destination}!`, 'success');
      }

      currentTripId = trip.id;
      localStorage.setItem('plantrip_currentTrip', currentTripId);
      
      document.getElementById('joinCodeInput').value = '';
      navigate('dashboard');
    } catch (e) {
      console.error(e);
      showToast('Error de conexión', 'error');
    }
  }

  // ---- SELECT TRIP ----
  function selectTrip(tripId) {
    currentTripId = tripId;
    save();
    navigate('dashboard');
  }

  // ---- COPY CODE ----
  function copyCode() {
    const trip = getCurrentTrip();
    if (!trip) return;
    navigator.clipboard.writeText(trip.code).then(() => {
      showToast('Código copiado: #' + trip.code, 'success');
    }).catch(() => {
      showToast('#' + trip.code);
    });
  }

  function deleteTrip(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    appConfirm('Eliminar viaje', `¿Seguro que quieres eliminar el viaje a ${trip.destination}?`, async () => {
      try {
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        trips = trips.filter(t => t.id !== id);
        if (currentTripId === id) {
          currentTripId = null;
          localStorage.removeItem('plantrip_currentTrip');
        }
        renderHome();
        showToast('Viaje eliminado');
      } catch (e) {
        console.error(e);
        showToast('Error al eliminar', 'error');
      }
    });
  }

  // ==============================
  //   RENDER: HOME
  // ==============================
  function renderHome() {
    if (!user) return;

    // Greeting
    const hour = new Date().getHours();
    let greeting = '¡Buenos días!';
    if (hour >= 14 && hour < 21) greeting = '¡Buenas tardes!';
    else if (hour >= 21 || hour < 6) greeting = '¡Buenas noches!';

    document.getElementById('greetingName').textContent = user.name;
    document.querySelector('.greeting h1').innerHTML = `${greeting},<br><span class="user-name">${user.name}</span>.`;

    // Recent trips
    const container = document.getElementById('recentTrips');
    const userTrips = trips.filter(t => t.members.some(m => m.id === user.id));

    if (userTrips.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
          <p>Aún no tienes viajes. ¡Crea uno o únete con un código!</p>
        </div>`;
      return;
    }

    container.innerHTML = userTrips
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(trip => `
        <div class="trip-card">
          <img class="trip-card-img" src="${trip.imageUrl || getDestinationImage(trip.destination)}" alt="${trip.destination}" onclick="App.selectTrip('${trip.id}')" loading="lazy">
          <div class="trip-card-info" onclick="App.selectTrip('${trip.id}')">
            <h3>${trip.destination}</h3>
            <p>${formatDateRange(trip.startDate, trip.endDate)} · ${trip.members.length} viajero${trip.members.length > 1 ? 's' : ''}</p>
          </div>
          <div class="trip-card-actions">
            <span class="trip-card-code">#${trip.code}</span>
            <button class="action-btn-sm" onclick="event.stopPropagation(); App.copyCode('${trip.id}')" title="Copiar código">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
            <button class="action-btn-sm delete" onclick="event.stopPropagation(); App.deleteTrip('${trip.id}')" title="Eliminar viaje">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>
      `).join('');
  }

  // ==============================
  //   RENDER: DASHBOARD
  // ==============================
  function renderDashboard() {
    const trip = getCurrentTrip();
    const noTrip = document.getElementById('dashNoTrip');
    const content = document.getElementById('dashContent');

    if (!trip) {
      noTrip.style.display = '';
      content.style.display = 'none';
      return;
    }

    noTrip.style.display = 'none';
    content.style.display = '';

    // Hero
    document.getElementById('dashHeroImg').src = trip.imageUrl || getDestinationImage(trip.destination);
    document.getElementById('dashTripTitle').textContent = `Viaje a ${trip.destination}`;
    document.getElementById('dashCodeText').textContent = trip.code;

    // Add delete trip button to hero
    const heroBtn = document.createElement('button');
    heroBtn.className = 'dash-delete-btn';
    heroBtn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
    heroBtn.onclick = () => deleteTrip(trip.id);
    document.querySelector('.dash-hero').appendChild(heroBtn);

    // Members
    const membersEl = document.getElementById('dashMembers');
    membersEl.innerHTML = trip.members.map((m, i) => `
      <div class="member-chip">
        <div class="member-avatar" style="background:${MEMBER_COLORS[i % MEMBER_COLORS.length]}">${m.name.charAt(0).toUpperCase()}</div>
        ${m.name}
      </div>
    `).join('');

    // Stats
    const totalExpenses = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
    const balances = calculateBalances(trip);
    const myBalance = balances[user.id] || 0;

    document.getElementById('dashTotalExpenses').textContent = formatCurrency(totalExpenses);
    const balanceEl = document.getElementById('dashYourBalance');
    balanceEl.textContent = formatCurrency(Math.abs(myBalance));
    balanceEl.className = 'stat-value ' + (myBalance >= 0 ? 'stat-positive' : 'stat-negative');

    document.getElementById('dashBalanceAmount').textContent = formatCurrency(myBalance);

    // Balance bar
    const maxAbs = Math.max(Math.abs(myBalance), totalExpenses / (trip.members.length || 1), 1);
    const percent = Math.min(Math.max(((myBalance + maxAbs) / (2 * maxAbs)) * 100, 5), 95);
    const fill = document.getElementById('dashBalanceFill');
    fill.style.width = percent + '%';
    fill.style.background = myBalance >= 0 ? 'var(--positive)' : 'var(--negative)';
  }

  // ==============================
  //   RENDER: ITINERARY
  // ==============================
  function renderItinerary() {
    const trip = getCurrentTrip();
    const noTrip = document.getElementById('itinNoTrip');
    const content = document.getElementById('itinContent');

    if (!trip) {
      noTrip.style.display = '';
      content.style.display = 'none';
      return;
    }

    noTrip.style.display = 'none';
    content.style.display = '';

    document.getElementById('itinTripLabel').textContent = 'El Viajero';
    document.getElementById('itinTitle').textContent = `Viaje a ${trip.destination}`;
    document.getElementById('itinDates').textContent = formatDateRange(trip.startDate, trip.endDate);

    // Group activities by day
    const days = getDaysBetween(trip.startDate, trip.endDate);
    const body = document.getElementById('itinBody');

    if (trip.activities.length === 0) {
      body.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <p>Aún no hay actividades.<br>Pulsa + para añadir la primera.</p>
        </div>`;
      return;
    }

    let html = '';
    days.forEach((day, idx) => {
      const dayActivities = trip.activities
        .filter(a => a.day === idx)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      if (dayActivities.length === 0) return;

      const themes = ['Llegada', 'Cultura', 'Aventura', 'Gastronomía', 'Relax', 'Exploración'];
      const theme = themes[idx % themes.length];

      html += `
        <div class="day-group">
          <div class="day-label">Día ${idx + 1}: ${theme}</div>
          <div class="timeline">
            ${dayActivities.map(act => `
              <div class="timeline-item">
                <div class="activity-card">
                  <div class="activity-time">${act.time || '—'}</div>
                  <div class="activity-title">${escapeHtml(act.title)}</div>
                  <div class="activity-location">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    ${escapeHtml(act.location || 'Sin ubicación')}
                  </div>
                  ${act.notes ? `<div class="activity-notes">${escapeHtml(act.notes)}</div>` : ''}
                  <div class="activity-actions" style="margin-top: 10px; display: flex; gap: 8px;">
                     <button class="btn-secondary btn-sm" onclick="App.openEditActivityModal('${act.id}')">Editar</button>
                     <button class="btn-secondary btn-sm btn-danger" onclick="App.deleteActivity('${act.id}')">Eliminar</button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    body.innerHTML = html;
  }

  // ---- Activity Modal ----
  function openActivityModal() {
    const trip = getCurrentTrip();
    if (!trip) { showToast('Selecciona un viaje primero', 'error'); return; }

    const days = getDaysBetween(trip.startDate, trip.endDate);
    const daySelect = document.getElementById('actDay');
    daySelect.innerHTML = days.map((d, i) => `<option value="${i}">Día ${i + 1} — ${formatShortDate(d)}</option>`).join('');

    document.getElementById('actTitle').value = '';
    document.getElementById('actTime').value = '';
    document.getElementById('actLocation').value = '';
    document.getElementById('actNotes').value = '';

    openModal('activityModal');
  }

  function saveActivity() {
    const trip = getCurrentTrip();
    if (!trip) return;

    const title = document.getElementById('actTitle').value.trim();
    if (!title) { showToast('Introduce un título', 'error'); return; }

    const activityData = {
      title,
      time: document.getElementById('actTime').value,
      day: parseInt(document.getElementById('actDay').value),
      location: document.getElementById('actLocation').value.trim(),
      notes: document.getElementById('actNotes').value.trim()
    };

    if (editingActivityId) {
      const idx = trip.activities.findIndex(a => a.id === editingActivityId);
      if (idx !== -1) {
        trip.activities[idx] = { ...trip.activities[idx], ...activityData };
        showToast('Actividad actualizada ✓', 'success');
      }
    } else {
      const activity = {
        id: 'act_' + Date.now(),
        ...activityData,
        createdBy: user.id
      };
      trip.activities.push(activity);
      showToast('Actividad añadida ✓', 'success');
    }

    save();
    closeModal('activityModal');
    renderItinerary();
  }

  function openEditActivityModal(id) {
    const trip = getCurrentTrip();
    const act = trip.activities.find(a => a.id === id);
    if (!act) return;

    openActivityModal();
    editingActivityId = id;
    document.getElementById('actTitle').value = act.title;
    document.getElementById('actTime').value = act.time;
    document.getElementById('actDay').value = act.day;
    document.getElementById('actLocation').value = act.location;
    document.getElementById('actNotes').value = act.notes;
    document.querySelector('#activityModal h3').textContent = 'Editar actividad';
    document.getElementById('saveActivityBtn').textContent = 'Guardar cambios';
  }

  function deleteActivity(actId) {
    appConfirm('Eliminar actividad', '¿Seguro que quieres eliminar esta actividad?', () => {
      const trip = getCurrentTrip();
      if (!trip) return;
      trip.activities = trip.activities.filter(a => a.id !== actId);
      save();
      renderItinerary();
      showToast('Actividad eliminada');
    });
  }

  // ==============================
  //   RENDER: EXPENSES
  // ==============================
  function renderExpenses() {
    const trip = getCurrentTrip();
    const noTrip = document.getElementById('expNoTrip');
    const content = document.getElementById('expContent');

    if (!trip) {
      noTrip.style.display = '';
      content.style.display = 'none';
      return;
    }

    noTrip.style.display = 'none';
    content.style.display = '';

    const totalExpenses = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('expTotal').innerHTML = `<span class="currency">€</span>${totalExpenses.toFixed(2)}`;

    // Per person spent
    const perPersonEl = document.getElementById('expPerPerson');
    const perPersonSpent = {};
    trip.members.forEach(m => perPersonSpent[m.id] = 0);
    trip.expenses.forEach(e => {
      if (perPersonSpent[e.paidBy] !== undefined) {
        perPersonSpent[e.paidBy] += e.amount;
      }
    });

    perPersonEl.innerHTML = trip.members.map((m, i) => `
      <div class="exp-per-person-item">
        <div class="exp-per-person-dot" style="background:${MEMBER_COLORS[i % MEMBER_COLORS.length]}"></div>
        ${formatCurrency(perPersonSpent[m.id] || 0)}
      </div>
    `).join('');

    // Balances
    const balances = calculateBalances(trip);
    const balancesEl = document.getElementById('expBalances');
    balancesEl.innerHTML = trip.members.map((m, i) => {
      const bal = balances[m.id] || 0;
      return `
        <div class="balance-card">
          <div class="balance-card-left">
            <div class="member-avatar" style="background:${MEMBER_COLORS[i % MEMBER_COLORS.length]}">${m.name.charAt(0).toUpperCase()}</div>
            <div>
              <div class="balance-card-name">${escapeHtml(m.name)}${m.id === user.id ? ' (tú)' : ''}</div>
              <div class="balance-card-role">${bal >= 0 ? 'Le deben' : 'Debe'}</div>
            </div>
          </div>
          <div class="balance-card-amount ${bal >= 0 ? 'positive' : 'negative'}">${bal >= 0 ? '+' : ''}${formatCurrency(bal)}</div>
        </div>
      `;
    }).join('');

    // Settlements
    const settlements = simplifyDebts(trip);
    const settEl = document.getElementById('expSettlements');
    if (settlements.length > 0) {
      settEl.innerHTML = `
        <div class="settlement-card">
          <h3>💡 Cómo liquidar deudas</h3>
          ${settlements.map(s => {
            const fromName = trip.members.find(m => m.id === s.from)?.name || 'Desconocido';
            const toName = trip.members.find(m => m.id === s.to)?.name || 'Desconocido';
            return `
              <div class="settlement-item">
                <strong>${escapeHtml(fromName)}</strong>
                <span class="settlement-arrow">→</span>
                <strong>${escapeHtml(toName)}</strong>
                <span class="settlement-amount">${formatCurrency(s.amount)}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      settEl.innerHTML = '';
    }

    // Expense list
    const listEl = document.getElementById('expList');
    if (trip.expenses.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          <p>Sin gastos registrados.<br>Pulsa + para añadir uno.</p>
        </div>`;
      return;
    }

    const expenseIcons = ['🍽️', '🏨', '🚗', '✈️', '🎫', '🛒', '☕', '🎉', '💊', '📱'];
    listEl.innerHTML = trip.expenses
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((e, idx) => {
        const payer = trip.members.find(m => m.id === e.paidBy);
        const payerIdx = trip.members.findIndex(m => m.id === e.paidBy);
        const icon = expenseIcons[idx % expenseIcons.length];
        const color = MEMBER_COLORS[payerIdx % MEMBER_COLORS.length];
        return `
          <div class="expense-item">
            <div class="expense-item-left">
              <div class="expense-icon" style="background:${color}15; color:${color}">${icon}</div>
              <div class="expense-info">
                <h4>${escapeHtml(e.description)}</h4>
                <p>Pagado por ${escapeHtml(payer?.name || '?')} · ${formatShortDate(e.date)}</p>
                <div class="expense-actions" style="margin-top: 8px; display: flex; gap: 8px;">
                   <button class="btn-primary btn-sm" style="flex: 1; padding: 6px;" onclick="App.openEditExpenseModal('${e.id}')">Editar</button>
                   <button class="btn-secondary btn-sm btn-danger" style="flex: 1; padding: 6px;" onclick="App.deleteExpense('${e.id}')">Borrar</button>
                </div>
              </div>
            </div>
            <div class="expense-amount">
              ${formatCurrency(e.amount)}
              <small>${e.splitBetween.length} persona${e.splitBetween.length > 1 ? 's' : ''}</small>
            </div>
          </div>
        `;
      }).join('');
  }

  // ---- Expense Modal ----
  function openExpenseModal() {
    const trip = getCurrentTrip();
    if (!trip) { showToast('Selecciona un viaje primero', 'error'); return; }

    // Payer select
    const paidByEl = document.getElementById('expPaidBy');
    paidByEl.innerHTML = trip.members.map(m =>
      `<option value="${m.id}" ${m.id === user.id ? 'selected' : ''}>${m.name}${m.id === user.id ? ' (tú)' : ''}</option>`
    ).join('');

    // Split members
    const splitEl = document.getElementById('expSplitMembers');
    splitEl.innerHTML = trip.members.map(m =>
      `<div class="chip-option selected" data-member-id="${m.id}" onclick="this.classList.toggle('selected')">${m.name}</div>`
    ).join('');

    document.getElementById('expDesc').value = '';
    document.getElementById('expAmount').value = '';
    splitType = 'equal';
    document.querySelectorAll('#splitToggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'equal');
    });
    document.getElementById('customAmounts').style.display = 'none';

    openModal('expenseModal');
  }

  function setSplitType(type) {
    splitType = type;
    document.querySelectorAll('#splitToggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.type === type);
    });

    const customDiv = document.getElementById('customAmounts');
    if (type === 'custom') {
      const trip = getCurrentTrip();
      if (!trip) return;
      const amount = parseFloat(document.getElementById('expAmount').value) || 0;
      const selected = getSelectedMembers();
      const perPerson = selected.length > 0 ? (amount / selected.length).toFixed(2) : '0.00';

      customDiv.style.display = 'block';
      customDiv.innerHTML = trip.members
        .filter(m => selected.includes(m.id))
        .map(m => `
          <div class="form-group">
            <label>${m.name}</label>
            <input type="number" class="form-input custom-split-input" data-member-id="${m.id}" value="${perPerson}" step="0.01" min="0">
          </div>
        `).join('');
    } else {
      customDiv.style.display = 'none';
    }
  }

  function getSelectedMembers() {
    return Array.from(document.querySelectorAll('#expSplitMembers .chip-option.selected'))
      .map(el => el.dataset.memberId);
  }

  function saveExpense() {
    const trip = getCurrentTrip();
    if (!trip) return;

    const description = document.getElementById('expDesc').value.trim();
    const amount = parseFloat(document.getElementById('expAmount').value);
    const paidBy = document.getElementById('expPaidBy').value;
    const splitBetween = getSelectedMembers();

    if (!description) { showToast('Introduce una descripción', 'error'); return; }
    if (!amount || amount <= 0) { showToast('Introduce una cantidad válida', 'error'); return; }
    if (splitBetween.length === 0) { showToast('Selecciona al menos una persona', 'error'); return; }

    let shares = {};
    if (splitType === 'equal') {
      const perPerson = amount / splitBetween.length;
      splitBetween.forEach(id => shares[id] = perPerson);
    } else {
      document.querySelectorAll('.custom-split-input').forEach(inp => {
        shares[inp.dataset.memberId] = parseFloat(inp.value) || 0;
      });
    }

    const expenseData = {
      description,
      amount,
      paidBy,
      splitBetween,
      shares,
      splitType
    };

    if (editingExpenseId) {
      const idx = trip.expenses.findIndex(e => e.id === editingExpenseId);
      if (idx !== -1) {
        trip.expenses[idx] = { ...trip.expenses[idx], ...expenseData };
        showToast('Gasto actualizado ✓', 'success');
      }
    } else {
      const expense = {
        id: 'exp_' + Date.now(),
        ...expenseData,
        date: new Date().toISOString(),
        createdBy: user.id
      };
      trip.expenses.push(expense);
      showToast('Gasto registrado ✓', 'success');
    }

    save();
    closeModal('expenseModal');
    renderExpenses();
  }

  function openEditExpenseModal(id) {
    const trip = getCurrentTrip();
    const exp = trip.expenses.find(e => e.id === id);
    if (!exp) return;

    openExpenseModal();
    editingExpenseId = id;
    
    document.getElementById('expDesc').value = exp.description;
    document.getElementById('expAmount').value = exp.amount;
    document.getElementById('expPaidBy').value = exp.paidBy;
    
    // Set split between chips
    document.querySelectorAll('#expSplitMembers .chip-option').forEach(chip => {
      chip.classList.toggle('selected', exp.splitBetween.includes(chip.dataset.memberId));
    });
    
    setSplitType(exp.splitType);
    
    // If custom, set custom amounts
    if (exp.splitType === 'custom') {
      document.querySelectorAll('.custom-split-input').forEach(inp => {
        inp.value = exp.shares[inp.dataset.memberId] || 0;
      });
    }

    document.querySelector('#expenseModal h3').textContent = 'Editar gasto';
    document.getElementById('saveExpenseBtn').textContent = 'Guardar cambios';
  }

  function deleteExpense(expId) {
    appConfirm('Eliminar gasto', '¿Seguro que quieres eliminar este gasto?', () => {
      const trip = getCurrentTrip();
      if (!trip) return;
      trip.expenses = trip.expenses.filter(e => e.id !== expId);
      save();
      renderExpenses();
      showToast('Gasto eliminado');
    });
  }

  // ==============================
  //   TRICOUNT ALGORITHM
  // ==============================

  // Calculate net balance for each member
  function calculateBalances(trip) {
    const balances = {};
    trip.members.forEach(m => balances[m.id] = 0);

    trip.expenses.forEach(expense => {
      // Payer gets credit for the full amount
      if (balances[expense.paidBy] !== undefined) {
        balances[expense.paidBy] += expense.amount;
      }

      // Each person in the split owes their share
      if (expense.shares) {
        Object.entries(expense.shares).forEach(([memberId, share]) => {
          if (balances[memberId] !== undefined) {
            balances[memberId] -= share;
          }
        });
      } else {
        // Fallback: equal split
        const perPerson = expense.amount / expense.splitBetween.length;
        expense.splitBetween.forEach(memberId => {
          if (balances[memberId] !== undefined) {
            balances[memberId] -= perPerson;
          }
        });
      }
    });

    return balances;
  }

  // Simplify debts (minimize transactions)
  function simplifyDebts(trip) {
    const balances = calculateBalances(trip);
    const settlements = [];

    // Create arrays of debtors and creditors
    let debtors = [];  // people who owe (negative balance)
    let creditors = []; // people who are owed (positive balance)

    Object.entries(balances).forEach(([id, balance]) => {
      if (balance < -0.01) {
        debtors.push({ id, amount: Math.abs(balance) });
      } else if (balance > 0.01) {
        creditors.push({ id, amount: balance });
      }
    });

    // Sort by amount (largest first) for efficiency
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    // Match debtors with creditors
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const transferAmount = Math.min(debtors[i].amount, creditors[j].amount);

      if (transferAmount > 0.01) {
        settlements.push({
          from: debtors[i].id,
          to: creditors[j].id,
          amount: Math.round(transferAmount * 100) / 100
        });
      }

      debtors[i].amount -= transferAmount;
      creditors[j].amount -= transferAmount;

      if (debtors[i].amount < 0.01) i++;
      if (creditors[j].amount < 0.01) j++;
    }

    return settlements;
  }

  // ==============================
  //   UTILITY FUNCTIONS
  // ==============================

  function formatCurrency(amount) {
    return '€' + Math.abs(amount).toFixed(2);
  }

  function formatDateRange(start, end) {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const s = new Date(start);
    const e = new Date(end);
    return `${s.getDate()} ${months[s.getMonth()]} — ${e.getDate()} ${months[e.getMonth()]}, ${e.getFullYear()}`;
  }

  function formatShortDate(dateStr) {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const d = new Date(dateStr);
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

  function getDaysBetween(start, end) {
    const days = [];
    const s = new Date(start);
    const e = new Date(end);
    const cur = new Date(s);
    while (cur <= e) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==============================
  //   INIT
  // ==============================
  function init() {
    load().then(() => {
      if (!user) {
        document.getElementById('nameSetup').classList.remove('hidden');
      } else {
        document.getElementById('nameSetup').classList.add('hidden');
        renderHome();
      }
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('active');
        }
      });
    });
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);

  // ---- Public API ----
  return {
    navigate,
    createTrip,
    joinTrip,
    selectTrip,
    saveName,
    showSettings,
    updateName,
    copyCode,
    onFabClick,
    openModal,
    closeModal,
    saveActivity,
    deleteActivity,
    openEditActivityModal,
    saveExpense,
    deleteExpense,
    openEditExpenseModal,
    deleteTrip,
    setSplitType
  };
})();
