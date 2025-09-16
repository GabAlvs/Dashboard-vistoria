document.addEventListener('DOMContentLoaded', async () => {
  try {
    checkLogin();
    populateUserDisplayName();
    setupEventListeners();
    setupModalFix();

    await Promise.all([
      loadDashboardSummary(),
      populateVistoriadoresDropdowns(),
      loadBairros(),
      loadAdministradoras(),
      loadRotas(1),
    ]);
  } catch (error) {
    console.error('Erro na inicialização:', error);
    showToast('Erro ao carregar dados iniciais', true);
  }
});


function checkLogin() {
  const token = localStorage.getItem('jwtToken');
  const user = JSON.parse(localStorage.getItem('user'));
  if (!token || !user) {
    window.location.href = `/index.html?redirect=${encodeURIComponent(window.location.pathname)}`;
    return;
  }
  if (user.role !== 'gestor_rotas') {
    window.location.href = '/unauthorized.html';
  }
}

function populateUserDisplayName() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (user && user.name) {
    const el = document.getElementById('userDisplayName') || document.getElementById('userName');
    if (el) el.textContent = `Olá, ${user.name}`;
  }
}

function logout() {
  localStorage.removeItem('jwtToken');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}


// Utilitários de UI //
function getAuthHeader() {
  const token = localStorage.getItem('jwtToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast-message');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast-message ${isError ? 'error' : ''} show`;
  setTimeout(() => toast.classList.remove('show'), 5000);
}

function showLoading(show = true) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.style.display = show ? 'flex' : 'none';
  overlay.style.zIndex = show ? '1040' : '-1';
}

function cleanupBackdrops() {
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
}

function setupModalFix() {
  const generic = document.getElementById('genericModal');
  if (generic) {
    generic.addEventListener('show.bs.modal', cleanupBackdrops);
    generic.addEventListener('hidden.bs.modal', cleanupBackdrops);
  }
}


function setupEventListeners() {
  // Filtros
  const filterForm = document.getElementById('filter-form');
  if (filterForm) {
    filterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loadRotas(1);
    });
  }
  document.getElementById('clear-filters-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearFilters();
  });

  // Importar Excel
  const importForm = document.getElementById('importExcelForm');
  if (importForm) {
    importForm.addEventListener('submit', handleExcelImport);
    document.getElementById('excelFile')?.addEventListener('change', (e) => {
      const fileName = e.target.files?.[0]?.name || 'Nenhum arquivo selecionado';
      const label = document.getElementById('file-name-display');
      if (label) label.textContent = fileName;
    });
  }

  // CRUD rota (se existir formulário de criação/edição fora do modal padrão)
  const rotaForm = document.getElementById('rotaForm');
  if (rotaForm) rotaForm.addEventListener('submit', handleRotaSubmit);

  // Delegação de eventos na tabela
  const body = document.getElementById('rotasTableBody');
  if (body) {
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;

      if (btn.classList.contains('btn-view')) {
        viewObservacao(id);
      } else if (btn.classList.contains('btn-delete')) {
        confirmDeleteRota(id);
      }
    });
  }

 
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('logoutButton')?.addEventListener('click', logout);

  // Fechamentos do modal custom de observação
  const obsModal = getObservationModalEl();
  if (obsModal) {
    const closeBtn = document.getElementById('close-observation-modal-btn');
    const okBtn = document.getElementById('ok-observation-btn');

    closeBtn?.addEventListener('click', () => closeCustomModal(obsModal));
    okBtn?.addEventListener('click', () => closeCustomModal(obsModal));

    obsModal.addEventListener('click', (ev) => {
      if (ev.target === obsModal) closeCustomModal(obsModal);
    });
  }
}

// ==============================
// Dashboard (cards)
// ==============================
async function loadDashboardSummary() {
  const container = document.getElementById('vistoriadoresStatsContainer');
  if (!container) return;
  container.innerHTML = '<div class="col-12 text-center text-muted">Carregando estatísticas...</div>';

  try {
    const resp = await fetch(`${API_BASE_URL}/dashboard/summary`, { headers: getAuthHeader() });
    if (!resp.ok) throw new Error(resp.status === 403 ? 'Acesso negado' : `Erro HTTP: ${resp.status}`);
    const data = await resp.json();
    renderVistoriadoresStats(data.vistoriadores || []);
  } catch (err) {
    console.error('Erro ao carregar resumo:', err);
    container.innerHTML = `<div class="col-12 text-center text-danger">Erro: ${err.message || 'Falha ao carregar'}</div>`;
  }
}

function renderVistoriadoresStats(vistoriadores) {
  const container = document.getElementById('vistoriadoresStatsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!vistoriadores.length) {
    container.innerHTML = '<div class="text-center text-muted">Nenhum vistoriador encontrado</div>';
    return;
  }

  vistoriadores.forEach(({ nome, cargo, stats }) => {
    const progresso = stats?.progresso || 0;
    container.insertAdjacentHTML(
      'beforeend',
      `
      <div class="vistoriador-card">
        <div class="vistoriador-header">
          <div class="vistoriador-avatar">${(nome || '?').charAt(0)}</div>
          <div class="vistoriador-info">
            <h3>${nome || '-'}</h3>
            <p>${cargo || ''}</p>
          </div>
        </div>
        <div class="stats-row">
          <div class="stat-item"><div class="stat-number">${stats?.totalRotas ?? 0}</div><div class="stat-label">Total</div></div>
          <div class="stat-item"><div class="stat-number">${stats?.rotasConcluidas ?? 0}</div><div class="stat-label">Concluídas</div></div>
          <div class="stat-item"><div class="stat-number">${stats?.rotasEmAndamento ?? 0}</div><div class="stat-label">Andamento</div></div>
          <div class="stat-item"><div class="stat-number">${stats?.rotasPendentes ?? 0}</div><div class="stat-label">Pendentes</div></div>
        </div>
        <div class="progress-container">
          <div class="progress-header"><span>Progresso</span><span>${progresso.toFixed(0)}%</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${progresso}%"></div></div>
        </div>
      </div>`
    );
  });
}

// Filtros e carga de dados //
async function populateVistoriadoresDropdowns() {
  const ids = ['vistoriadorSelect', 'filterVistoriador', 'vistoriador', 'import-vistoriador-excel'];
  try {
    const resp = await fetch(`${API_BASE_URL}/vistoriadores`, { headers: getAuthHeader() });
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const data = await resp.json();

    ids.forEach((id) => {
      const dd = document.getElementById(id);
      if (!dd) return;
      while (dd.options.length > 1) dd.remove(1);
      (data.vistoriadores || []).forEach((v) => dd.add(new Option(v.nome, v.id)));
    });
  } catch (e) {
    console.error('Erro ao carregar vistoriadores:', e);
    showToast('Erro ao carregar lista de vistoriadores', true);
  }
}

async function loadBairros() {
  const dd = document.getElementById('filterBairro');
  if (!dd) return;
  try {
    const resp = await fetch(`${API_BASE_URL}/bairros`, { headers: getAuthHeader() });
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const data = await resp.json();
    dd.innerHTML = '<option value="">Todos</option>';
    (data.bairros || []).sort().forEach((b) => dd.add(new Option(b, b)));
  } catch (e) {
    console.error('Erro ao carregar bairros:', e);
  }
}

async function loadAdministradoras() {
  const dd = document.getElementById('filterAdministradora');
  if (!dd) return;
  try {
    const resp = await fetch(`${API_BASE_URL}/administradoras`, { headers: getAuthHeader() });
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const data = await resp.json();
    dd.innerHTML = '<option value="">Todas</option>';
    (data.administradoras || []).sort().forEach((a) => dd.add(new Option(a, a)));
  } catch (e) {
    console.error('Erro ao carregar administradoras:', e);
  }
}

async function loadRotas(page = 1) {
  showLoading(true);
  try {
    const tableBody = document.getElementById('rotasTableBody');
    const pagination = document.getElementById('pagination-controls');
    if (!tableBody || !pagination) {
      console.error('IDs esperados não encontrados (#rotasTableBody, #pagination-controls)');
      showLoading(false);
      return;
    }

    tableBody.innerHTML = '<tr><td colspan="8" class="text-center">Carregando rotas...</td></tr>';
    pagination.innerHTML = '';

    const filters = {
      vistoriadorId: document.getElementById('filterVistoriador')?.value || '',
      status: document.getElementById('filterStatus')?.value || '',
      bairro: document.getElementById('filterBairro')?.value || '',
      administradora: document.getElementById('filterAdministradora')?.value || '',
      startDate: document.getElementById('filterStartDate')?.value || '',
      endDate: document.getElementById('filterEndDate')?.value || '',
      page,
      limit: 10,
    };

    const qs = Object.entries(filters)
      .filter(([_, v]) => v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const resp = await fetch(`${API_BASE_URL}/rotas?${qs}`, { headers: getAuthHeader() });
    if (!resp.ok) {
      let msg = `Erro HTTP: ${resp.status}`;
      try {
        const e = await resp.json();
        msg = e.message || msg;
      } catch {}
      if (resp.status === 403) msg = 'Acesso negado - Permissões insuficientes';
      throw new Error(msg);
    }

    const data = await resp.json();
    if (!Array.isArray(data.rotas)) throw new Error('Formato inválido de resposta');

    renderRotasTable(data.rotas);
    renderPagination(data.total, data.page, data.limit);
  } catch (error) {
    console.error('Erro ao carregar rotas:', error);
    const tableBody = document.getElementById('rotasTableBody');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-danger">
            ${error.message || 'Falha ao carregar rotas'}
          </td>
        </tr>`;
    }
    showToast('Falha ao carregar rotas. Veja o console para detalhes.', true);
  } finally {
    showLoading(false);
  }
}

function renderRotasTable(rotas) {
  const tableBody = document.getElementById('rotasTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';
  if (!rotas.length) {
    tableBody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhuma rota encontrada</td></tr>';
    return;
  }

  rotas.forEach((rota) => {
    const hasObs = !!rota.observacaoCondominio;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${rota.condominio || '-'}</td>
      <td>${rota.endereco || '-'}</td>
      <td>${rota.bairro || '-'}</td>
      <td>${rota.administradora || '-'}</td>
      <td>${rota.vistoriadorNome || '-'}</td>
      <td>${formatDate(rota.data)}</td>
      <td><span class="rota-status status-${(rota.status || '').toLowerCase().replace(/\s+/g, '-')}">${rota.status}</span></td>
      <td class="rota-actions">
        ${hasObs ? `
          <button class="rota-action-btn btn-view" data-id="${rota._id}" title="Ver observações">
            <i class="fas fa-eye"></i>
          </button>` : ''
        }
        <button class="rota-action-btn btn-delete" data-id="${rota._id}" title="Excluir">
          <i class="fas fa-times"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function renderPagination(totalItems, currentPage, itemsPerPage) {
  const pagination = document.getElementById('pagination-controls');
  if (!pagination) return;

  pagination.innerHTML = '';
  if (totalItems <= itemsPerPage) return;

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

  const makeItem = (label, page, disabled = false, active = false) => {
    const li = document.createElement('li');
    li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
    li.innerHTML = `<a class="page-link" href="#">${label}</a>`;
    if (!disabled && !active) {
      li.addEventListener('click', (e) => {
        e.preventDefault();
        loadRotas(page);
      });
    }
    return li;
  };

  pagination.appendChild(makeItem('«', currentPage - 1, currentPage === 1));

  if (start > 1) {
    pagination.appendChild(makeItem('1', 1));
    if (start > 2) {
      const dots = document.createElement('li');
      dots.className = 'page-item disabled';
      dots.innerHTML = `<span class="page-link">...</span>`;
      pagination.appendChild(dots);
    }
  }

  for (let i = start; i <= end; i++) {
    pagination.appendChild(makeItem(String(i), i, false, i === currentPage));
  }

  if (end < totalPages) {
    if (end < totalPages - 1) {
      const dots = document.createElement('li');
      dots.className = 'page-item disabled';
      dots.innerHTML = `<span class="page-link">...</span>`;
      pagination.appendChild(dots);
    }
    pagination.appendChild(makeItem(String(totalPages), totalPages));
  }

  pagination.appendChild(makeItem('»', currentPage + 1, currentPage === totalPages));
}


// Helpers
function getStatusBadgeClass(status) {
  switch (status) {
    case 'Pendente': return 'bg-warning';
    case 'Em Andamento': return 'bg-primary';
    case 'Concluído': return 'bg-success';
    case 'Cancelado': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const adj = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return adj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function clearFilters() {
  const setValue = (id, val = '') => { const el = document.getElementById(id); if (el) el.value = val; };
  setValue('filterVistoriador');
  setValue('filterStatus');
  setValue('filterBairro');
  setValue('filterAdministradora');
  setValue('filterStartDate');
  setValue('filterEndDate');
  loadRotas(1);
}


// Importação Excel
async function handleExcelImport(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const btn = form.querySelector('button[type="submit"]');
  const original = btn?.innerHTML;
  const importMsg = document.getElementById('import-message');

  showLoading(true);
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Importando...';
    }

    const resp = await fetch(`${API_BASE_URL}/rotas/import`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData,
    });

    const result = await resp.json();
    if (!resp.ok) throw new Error(result.message || 'Erro na importação');

    if (importMsg) {
      if (result.errors?.length) {
        importMsg.className = 'alert alert-warning';
        importMsg.style.display = 'block';
        importMsg.innerHTML = `
          <strong>${result.message}</strong>
          <ul class="mt-2 mb-0">
            ${result.errors.map((e) => `<li>${e}</li>`).join('')}
          </ul>`;
        showToast(result.message, true);
      } else {
        importMsg.className = 'alert alert-success';
        importMsg.style.display = 'block';
        importMsg.textContent = result.message;
        showToast(result.message);
      }
    }

    form.reset();
    const label = document.getElementById('file-name-display');
    if (label) label.textContent = 'Nenhum arquivo selecionado';

    await Promise.all([loadDashboardSummary(), loadRotas(1)]);
  } catch (e) {
    console.error('Erro na importação:', e);
    if (importMsg) {
      importMsg.className = 'alert alert-danger';
      importMsg.style.display = 'block';
      importMsg.textContent = e.message || 'Erro ao importar rotas';
    }
    showToast(e.message || 'Erro ao importar rotas', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
    showLoading(false);
  }
}


// CRUD de Rotas
async function viewRota(id) {
  showLoading(true);
  try {
    const resp = await fetch(`${API_BASE_URL}/rotas/${id}`, { headers: getAuthHeader() });
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const rota = await resp.json();
    showRotaDetailsModal(rota);
  } catch (e) {
    console.error('Erro ao visualizar rota:', e);
    showToast(e.message || 'Erro ao carregar detalhes da rota', true);
  } finally {
    showLoading(false);
  }
}

function showRotaDetailsModal(rota) {
  const modalEl = document.getElementById('genericModal');
  const title = document.getElementById('genericModalLabel');
  const body = document.getElementById('genericModalBody');

  if (modalEl && title && body && typeof bootstrap !== 'undefined') {
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);

    title.textContent = `Detalhes: ${rota.condominio}`;
    body.innerHTML = `
      <div class="mb-3">
        <h5 class="mb-2">Informações da Rota</h5>
        <p><strong>ID:</strong> ${rota.id}</p>
        <p><strong>Endereço:</strong> ${rota.endereco}, ${rota.bairro}</p>
        <p><strong>Administradora:</strong> ${rota.administradora}</p>
        <p><strong>Vistoriador:</strong> ${rota.vistoriadorNome}</p>
        <p><strong>Data:</strong> ${formatDate(rota.data)}</p>
        <p><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(rota.status)}">${rota.status}</span></p>
        <p><strong>Observações:</strong> ${rota.observacaoCondominio || 'Nenhuma'}</p>
      </div>
      ${rota.relatorioPdfId ? `
        <div class="text-center mt-3">
          <button class="btn btn-primary download-pdf-btn" data-rota-id="${rota._id}">
            <i class="fa-solid fa-file-pdf me-2"></i>Baixar Relatório
          </button>
        </div>` : ''}`;

    cleanupBackdrops();
    modal.show();

    const dlBtn = body.querySelector('.download-pdf-btn');
    if (dlBtn) dlBtn.addEventListener('click', () => downloadPdf(dlBtn.dataset.rotaId));
  } else {
    alert(`Condomínio: ${rota.condominio}\nObservações: ${rota.observacaoCondominio || 'Nenhuma'}`);
  }
}

async function editRota(id) {
  showLoading(true);
  try {
    const resp = await fetch(`${API_BASE_URL}/rotas/${id}`, { headers: getAuthHeader() });
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const rota = await resp.json();
    showEditRotaModal(rota);
  } catch (e) {
    console.error('Erro ao carregar rota para edição:', e);
    showToast(e.message || 'Erro ao carregar rota', true);
  } finally {
    showLoading(false);
  }
}

function showEditRotaModal(rota) {
  const modal = typeof bootstrap !== 'undefined' ? new bootstrap.Modal(document.getElementById('editRotaModal')) : null;
  const form = document.getElementById('rotaForm');
  if (!modal || !form) return;

  form.elements['rotaId'].value = rota.id || '';
  form.elements['condominio'].value = rota.condominio || '';
  form.elements['endereco'].value = rota.endereco || '';
  form.elements['bairro'].value = rota.bairro || '';
  form.elements['administradora'].value = rota.administradora || '';
  form.elements['vistoriador'].value = rota.vistoriadorId || '';
  form.elements['data'].value = (rota.data || '').slice(0, 10);
  form.elements['status'].value = rota.status || 'Pendente';
  form.elements['observacaoCondominio'].value = rota.observacaoCondominio || '';

  cleanupBackdrops();
  modal.show();
}

async function handleRotaSubmit(e) {
  e.preventDefault();
  showLoading(true);
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const resp = await fetch(`${API_BASE_URL}/rotas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.message || 'Erro ao salvar rota');

    showToast(result.message || 'Rota salva');
    const modalEl = form.closest('.modal');
    if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide();
    await Promise.all([loadDashboardSummary(), loadRotas(1)]);
  } catch (e) {
    console.error('Erro ao salvar rota:', e);
    showToast(e.message || 'Erro ao salvar rota', true);
  } finally {
    showLoading(false);
  }
}

function confirmDeleteRota(id) {
  if (confirm('Tem certeza que deseja excluir esta rota? Esta ação não pode ser desfeita.')) {
    deleteRota(id);
  }
}

async function deleteRota(id) {
  showLoading(true);
  try {
    const resp = await fetch(`${API_BASE_URL}/rotas/${id}`, { method: 'DELETE', headers: getAuthHeader() });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.message || 'Erro ao excluir rota');
    }
    showToast('Rota excluída com sucesso!');
    await Promise.all([loadDashboardSummary(), loadRotas(1)]);
  } catch (e) {
    console.error('Erro ao excluir rota:', e);
    showToast(e.message || 'Erro ao excluir rota', true);
  } finally {
    showLoading(false);
  }
}


// Observações (olho) + PDF
async function viewObservacao(id) {
  try {
    showLoading(true);
    const resp = await fetch(`${API_BASE_URL}/rotas/${id}`, { headers: getAuthHeader() });
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const rota = await resp.json();

    const customModal = getObservationModalEl();
    const textEl = document.getElementById('observation-text') || document.getElementById('cx-observation-text');

    if (customModal && textEl) {
      textEl.textContent = rota.observacaoCondominio || 'Nenhuma observação registrada';
      openCustomModal(customModal);
      return;
    }

    // Fallback: Bootstrap #genericModal
    const title = document.getElementById('genericModalLabel');
    const body = document.getElementById('genericModalBody');
    const modalEl = document.getElementById('genericModal');

    if (modalEl && title && body && typeof bootstrap !== 'undefined') {
      title.textContent = `Observações: ${rota.condominio}`;
      body.innerHTML = `
        <div class="observacao-content">
          <p><strong>Condomínio:</strong> ${rota.condominio}</p>
          <p><strong>Observações:</strong></p>
          <div class="observacao-text">${rota.observacaoCondominio || 'Nenhuma observação registrada'}</div>
        </div>`;
      cleanupBackdrops();
      (bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl)).show();
      return;
    }

    alert(rota.observacaoCondominio || 'Nenhuma observação registrada');
  } catch (e) {
    console.error('Erro ao carregar observações:', e);
    showToast('Erro ao carregar observações', true);
  } finally {
    showLoading(false);
  }
}

// Helpers de modal custom
function getObservationModalEl() {
  return (
    document.getElementById('observation-modal') ||
    document.getElementById('cx-observation-modal')
  );
}
function openCustomModal(modalEl) {
  modalEl.classList.add('is-active');
  document.body.style.overflow = 'hidden';
}
function closeCustomModal(modalEl) {
  modalEl.classList.remove('is-active');
  document.body.style.overflow = '';
}

async function downloadPdf(rotaId) {
  showLoading(true);
  try {
    const url = `${API_BASE_URL}/rotas/${rotaId}/pdf`;
    const resp = await fetch(url, { headers: getAuthHeader() });
    if (!resp.ok) throw new Error(`Erro ao gerar PDF (HTTP ${resp.status})`);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (e) {
    console.error('Erro ao baixar PDF:', e);
    showToast(e.message || 'Erro ao baixar relatório', true);
  } finally {
    showLoading(false);
  }
}

