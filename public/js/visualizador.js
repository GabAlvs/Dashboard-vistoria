document.addEventListener('DOMContentLoaded', function () {
  const API_BASE_URL = 'http://localhost:3000/api';

  // Tabela / filtros / paginação
  const rotasTableBody = document.getElementById('rotasTableBody');
  const filterForm = document.getElementById('filter-form');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  const filterVistoriadorSelect = document.getElementById('filterVistoriador');
  const filterBairroSelect = document.getElementById('filterBairro');
  const filterAdministradoraSelect = document.getElementById('filterAdministradora');
  const paginationControls = document.getElementById('pagination-controls');
  const rotasTableMessage = document.getElementById('rotas-table-message');

  //seleção em massa
  const selectAllCheckbox = document.getElementById('select-all');
  const downloadSelectedBtn = document.getElementById('download-selected');

  let currentPage = 1;
  const limit = 10;

  function getToken() { return localStorage.getItem('jwtToken'); }

  function redirectToLogin() {
    alert('Sessão expirada ou não autenticada. Por favor, faça login novamente.');
    window.location.href = 'index.html';
  }

  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast-message');
    toast.textContent = message;
    toast.className = `toast-message show ${type}`;
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
  }

  async function loadVistoriadores() {
    const token = getToken();
    if (!token) return redirectToLogin();
    try {
      const response = await fetch(`${API_BASE_URL}/vistoriadores`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) redirectToLogin();
        throw new Error('Erro ao carregar vistoriadores');
      }
      const data = await response.json();
      filterVistoriadorSelect.innerHTML = '<option value="">Todos</option>';
      data.vistoriadores.forEach(v => {
        const o = document.createElement('option');
        o.value = v.id; o.textContent = v.nome;
        filterVistoriadorSelect.appendChild(o);
      });
    } catch (err) {
      console.error('Erro ao carregar vistoriadores:', err);
      showToast('Erro ao carregar vistoriadores.', 'error');
    }
  }

  async function loadBairros() {
    const token = getToken();
    if (!token) return redirectToLogin();
    try {
      const res = await fetch(`${API_BASE_URL}/bairros`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) redirectToLogin();
        throw new Error('Erro ao carregar bairros');
      }
      const data = await res.json();
      filterBairroSelect.innerHTML = '<option value="">Todos</option>';
      data.bairros.forEach(b => {
        const o = document.createElement('option');
        o.value = o.textContent = b;
        filterBairroSelect.appendChild(o);
      });
    } catch (err) {
      console.error('Erro ao carregar bairros:', err);
      showToast('Erro ao carregar bairros.', 'error');
    }
  }

  async function loadAdministradoras() {
    const token = getToken();
    if (!token) return redirectToLogin();
    try {
      const res = await fetch(`${API_BASE_URL}/administradoras`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) redirectToLogin();
        throw new Error('Erro ao carregar administradoras');
      }
      const data = await res.json();
      filterAdministradoraSelect.innerHTML = '<option value="">Todas</option>';
      data.administradoras.forEach(a => {
        const o = document.createElement('option');
        o.value = o.textContent = a;
        filterAdministradoraSelect.appendChild(o);
      });
    } catch (err) {
      console.error('Erro ao carregar administradoras:', err);
      showToast('Erro ao carregar administradoras.', 'error');
    }
  }

  async function loadRotas(page = 1) {
    const token = getToken();
    if (!token) return redirectToLogin();

    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', limit);
    params.append('status', 'Concluído');
    params.append('status', 'Cancelado');

    const vistoriadorId = filterVistoriadorSelect.value;
    if (vistoriadorId) params.append('vistoriadorId', vistoriadorId);
    const bairro = filterBairroSelect.value;
    if (bairro) params.append('bairro', bairro);
    const administradora = filterAdministradoraSelect.value;
    if (administradora) params.append('administradora', administradora);
    const startDate = document.getElementById('filterStartDate')?.value;
    if (startDate) params.append('startDate', startDate);
    const endDate = document.getElementById('filterEndDate')?.value;
    if (endDate) params.append('endDate', endDate);

    try {
      rotasTableBody.innerHTML = '<tr><td colspan="9" class="text-center">Carregando relatórios...</td></tr>';
      rotasTableMessage.style.display = 'none';

      const response = await fetch(`${API_BASE_URL}/rotas?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) redirectToLogin();
        throw new Error('Erro ao carregar relatórios');
      }

      const data = await response.json();
      rotasTableBody.innerHTML = '';

      if (!data.rotas.length) {
        rotasTableMessage.textContent = 'Nenhum relatório encontrado com os filtros aplicados.';
        rotasTableMessage.style.display = 'block';
        paginationControls.innerHTML = '';
        updateBulkBtnState();
        return;
      }

      data.rotas.forEach(rota => {
        const row = rotasTableBody.insertRow();

        // Coluna seleção
        const selectCell = row.insertCell();
        selectCell.className = 'select-cell';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'row-select';
        cb.dataset.id = rota._id;
        cb.addEventListener('change', updateBulkBtnState);
        selectCell.appendChild(cb);

        row.insertCell().textContent = rota.condominio;
        row.insertCell().textContent = rota.endereco;
        row.insertCell().textContent = rota.bairro;
        row.insertCell().textContent = rota.administradora;
        row.insertCell().textContent = rota.vistoriadorNome;
        row.insertCell().textContent = new Date(rota.data).toLocaleDateString('pt-BR');
        row.insertCell().textContent = rota.status;

        const actionsCell = row.insertCell();
        actionsCell.className = 'actions-cell';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-sm btn-primary me-2';
        downloadBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Baixar PDF';
        downloadBtn.title = 'Baixar Relatório PDF';
        downloadBtn.onclick = () => downloadPdf(rota._id);
        actionsCell.appendChild(downloadBtn);

        const viewObsBtn = document.createElement('button');
        viewObsBtn.className = 'btn btn-sm btn-secondary';
        viewObsBtn.innerHTML = '<i class="fas fa-eye"></i> Observações';
        viewObsBtn.title = 'Ver Observações';
        viewObsBtn.onclick = () => showObservationsModal(rota.observacaoCondominio);
        actionsCell.appendChild(viewObsBtn);
      });

      setupPagination(data.total, data.page, data.limit);
      updateBulkBtnState();
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
      showToast('Erro ao carregar relatórios.', 'error');
      rotasTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao carregar relatórios.</td></tr>';
      paginationControls.innerHTML = '';
      updateBulkBtnState();
    }
  }

  function setupPagination(totalItems, currentPageNum, limitNum) {
    paginationControls.innerHTML = '';
    const totalPages = Math.ceil(totalItems / limitNum);
    if (totalPages <= 1) return;

    const createPageBtn = (page, text, disabled = false) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline-primary mx-1';
      btn.textContent = text;
      btn.disabled = disabled;
      btn.onclick = () => { currentPage = page; loadRotas(currentPage); };
      if (page === currentPageNum && /^\d+$/.test(String(text))) btn.classList.add('active');
      return btn;
    };

    paginationControls.appendChild(createPageBtn(1, 'Primeira', currentPageNum === 1));
    paginationControls.appendChild(createPageBtn(currentPageNum - 1, 'Anterior', currentPageNum === 1));

    let start = Math.max(1, currentPageNum - 2);
    let end = Math.min(totalPages, currentPageNum + 2);
    if (end - start < 4) {
      if (start === 1) end = Math.min(totalPages, start + 4);
      else if (end === totalPages) start = Math.max(1, totalPages - 4);
    }
    for (let i = start; i <= end; i++) paginationControls.appendChild(createPageBtn(i, i));

    paginationControls.appendChild(createPageBtn(currentPageNum + 1, 'Próxima', currentPageNum === totalPages));
    paginationControls.appendChild(createPageBtn(totalPages, 'Última', currentPageNum === totalPages));
  }

  async function downloadPdf(rotaId) {
    const token = getToken();
    if (!token) return redirectToLogin();
    try {
      showToast('Gerando PDF...', 'info');
      const response = await fetch(`${API_BASE_URL}/rotas/${rotaId}/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) redirectToLogin();
        const err = await response.json();
        throw new Error(err.message || 'Erro ao gerar PDF');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const cd = response.headers.get('Content-Disposition');
      let filename = `relatorio_vistoria_${rotaId}.pdf`;
      if (cd && cd.indexOf('attachment') !== -1) {
        const m = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(cd);
        if (m && m[1]) filename = m[1].replace(/['"]/g, '');
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('PDF gerado e download iniciado!', 'success');
    } catch (err) {
      console.error('Erro ao baixar PDF:', err);
      showToast(`Erro ao baixar PDF: ${err.message}`, 'error');
    }
  }

  // Download em massa (selecionados)
  async function downloadSelectedPdfs() {
    const ids = Array.from(document.querySelectorAll('.row-select:checked')).map(cb => cb.dataset.id);
    if (!ids.length) return showToast('Selecione pelo menos um relatório.', 'error');
    // sequencial para não sobrecarregar
    for (const id of ids) { /* eslint-disable no-await-in-loop */ await downloadPdf(id); }
  }

  function updateBulkBtnState() {
    const checkboxes = Array.from(document.querySelectorAll('.row-select'));
    const checked = checkboxes.filter(cb => cb.checked);
    if (downloadSelectedBtn) downloadSelectedBtn.disabled = checked.length === 0;
    if (selectAllCheckbox) {
      selectAllCheckbox.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
      selectAllCheckbox.checked = checked.length > 0 && checked.length === checkboxes.length;
    }
  }

    // Listeners gerais
    filterForm?.addEventListener('submit', e => { e.preventDefault(); currentPage = 1; loadRotas(currentPage); });
    clearFiltersBtn?.addEventListener('click', () => { filterForm.reset(); currentPage = 1; loadRotas(currentPage); });
    downloadSelectedBtn?.addEventListener('click', downloadSelectedPdfs);
    selectAllCheckbox?.addEventListener('change', () => {
        const all = document.querySelectorAll('.row-select');
        all.forEach(cb => { cb.checked = selectAllCheckbox.checked; });
        updateBulkBtnState();
    });

    document.getElementById('logout-btn')?.addEventListener('click', function () {
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('user');
        window.location.replace('index.html');
    });

  const userString = localStorage.getItem('user');
  if (userString) {
    try {
      const user = JSON.parse(userString);
      if (user && user.name) {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = user.name;
        const roleEl = document.getElementById('userRole');
        if (roleEl) {
          const p = roleEl.parentNode;
          const prev = roleEl.previousSibling;
          const next = roleEl.nextSibling;
          if (prev && prev.nodeType === Node.TEXT_NODE && /\(/.test(prev.textContent)) p.removeChild(prev);
          if (next && next.nodeType === Node.TEXT_NODE && /\)/.test(next.textContent)) p.removeChild(next);
          roleEl.remove();
        }
      } else {
        redirectToLogin();
      }
    } catch (e) {
      console.error('Erro ao parsear dados do usuário:', e);
      redirectToLogin();
    }
  } else {
    redirectToLogin();
  }

  // Inicialização
  loadVistoriadores();
  loadBairros();
  loadAdministradoras();
  loadRotas();
});
