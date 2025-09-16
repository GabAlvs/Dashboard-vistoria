const App = (function () {
  const VISTORIA_STATUS = {
    PENDENTE: "Pendente",
    EM_ANDAMENTO: "Em Andamento",
    CONCLUIDO: "Concluído",
    CANCELADO: "Cancelado",
  };

  const API_BASE_URL = "http://localhost:3000/api";

  let currentUser = null;
  let allVistorias = [];
  let mediaStream = null;

  const DOM = {
    // Header
    currentDateSpan: document.getElementById("current-date"),
    userNameDisplay: document.getElementById("user-name-display"),
    logoutBtn: document.getElementById("logout-btn"),

    // Filtros
    filterDateSelect: document.getElementById("filter-date"),
    sortByBairroSelect: document.getElementById("sort-by-bairro"),

    // Stats e progresso
    totalVistoriasSpan: document.getElementById("total-vistorias"),
    vistoriasConcluidasSpan: document.getElementById("vistorias-concluidas"),
    vistoriasPendentesSpan: document.getElementById("vistorias-pendentes"),
    progressPercentageSpan: document.getElementById("progress-percentage"),
    progressFillDiv: document.getElementById("progress-fill"),

    // Tabela
    vistoriasTableBody: document.getElementById("vistorias-table-body"),

    // Sidebar retrátil
    sidebarToggleBtn: document.getElementById("sidebar-toggle"),
    sidebarBackdrop: document.getElementById("sidebar-backdrop"),
    appContainer: document.querySelector(".app-container"),

    // Modal de Observação
    observationModal: document.getElementById("observation-modal"),
    closeObservationModalBtn: document.getElementById("close-observation-modal-btn"),
    okObservationBtn: document.getElementById("ok-observation-btn"),
    observationTextParagraph: document.getElementById("observation-text"),

    // Modal de Cancelamento
    cancelModal: document.getElementById("cancel-modal"),
    closeCancelModalBtn: document.getElementById("close-cancel-modal-btn"),
    cancelCancelBtn: document.getElementById("cancel-cancel-btn"),
    cancelForm: document.getElementById("cancel-form"),
    vistoriaIdInput: document.getElementById("vistoria-id"),
    cancelReasonSelect: document.getElementById("cancel-reason"),
    otherReasonContainer: document.getElementById("other-reason-container"),
    cancelPhotoInput: document.getElementById("cancel-photo"),
    photoPreviewContainer: document.getElementById("photo-preview"),
    openCameraBtn: document.getElementById("open-camera-btn"),

    // Câmera (modal separado para captura)
    cameraModal: document.getElementById("camera-modal"),
    closeCameraModalBtn: document.getElementById("close-camera-modal"),
    cancelCameraBtn: document.getElementById("cancel-camera-btn"),
    capturePhotoBtn: document.getElementById("capture-photo-btn"),
    cameraStreamVideo: document.getElementById("camera-stream"),
  };

 
  // Util: fetch com token JWT
  
  async function authorizedFetch(url, options = {}) {
    const authToken = localStorage.getItem("jwtToken");
    if (!authToken) {
      console.error("Token ausente — redirecionando para login.");
      handleLogout();
      throw new Error("Não autenticado.");
    }

    const headers = {
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const valid = ["GET", "POST", "PUT", "DELETE", "PATCH"];
    if (options.method && !valid.includes(options.method.toUpperCase())) {
      throw new Error(`Método HTTP ${options.method} não suportado.`);
    }

    const resp = await fetch(url, { ...options, headers });

    if (resp.status === 401 || resp.status === 403) {
      alert("Sessão expirada ou acesso negado. Faça login novamente.");
      handleLogout();
      throw new Error("Acesso negado ou sessão inválida.");
    }

    if (!resp.ok) {
      const ct = resp.headers.get("content-type");
      if (ct && ct.includes("application/json")) {
        const err = await resp.json();
        throw new Error(err.message || `Erro: ${resp.status} ${resp.statusText}`);
      }
      throw new Error(`Erro: ${resp.status} ${resp.statusText}`);
    }

    const ct = resp.headers.get("content-type");
    if (ct && ct.includes("application/json")) {
      return resp.json();
    }
    return {};
  }


  // Sessão e header
  function loadCurrentUser() {
    const raw = localStorage.getItem("user");
    if (!raw) {
      alert("Você não está logado. Redirecionando para login.");
      window.location.href = "index.html";
      return false;
    }
    try {
      currentUser = JSON.parse(raw);
      if (currentUser.role !== "vistoriador") {
        alert("Acesso negado. Perfil sem permissão.");
        window.location.href = "index.html";
        return false;
      }
      return true;
    } catch (e) {
      console.error("Erro ao ler usuário:", e);
      alert("Erro ao carregar usuário. Redirecionando para login.");
      window.location.href = "index.html";
      return false;
    }
  }

  function updateGreeting() {
    if (DOM.userNameDisplay && currentUser) {
      DOM.userNameDisplay.textContent = currentUser.nome || currentUser.name || "Vistoriador";
    }
  }

  function updateCurrentDate() {
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    const currentDate = new Date().toLocaleDateString("pt-BR", options);
    if (DOM.currentDateSpan) DOM.currentDateSpan.textContent = currentDate;
  }


  // Carregamento de vistorias
  async function loadVistorias() {
    try {
      if (!currentUser?.id) {
        console.error("Sem ID do vistoriador para carregar vistorias.");
        return;
      }

      const data = await authorizedFetch(`${API_BASE_URL}/rotas?vistoriadorId=${currentUser.id}`);
      allVistorias = (data.rotas || []).map(rota => ({
        id: rota._id,
        administradora: rota.administradora || "N/A",
        condominio: rota.condominio || "N/A",
        endereco: rota.endereco || "N/A",
        bairro: rota.bairro || "Desconhecido",
        observacao: rota.observacaoCondominio || "",
        status: rota.status || VISTORIA_STATUS.PENDENTE,
        data: new Date(rota.data),
        vistoriadorId: rota.vistoriadorId,
        vistoriadorNome: rota.vistoriadorNome,
      }));

      updateDashboardStats(allVistorias);
      populateBairroFilter();
      applyFiltersAndSort();
    } catch (err) {
      console.error("Erro ao carregar vistorias:", err);
      if (DOM.vistoriasTableBody) {
        DOM.vistoriasTableBody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center; padding:20px; color:#e74c3c;">
              Erro ao carregar vistorias. Tente novamente mais tarde.
            </td>
          </tr>`;
      }
    }
  }

  function populateBairroFilter() {
    if (!DOM.sortByBairroSelect) return;
    const bairros = [...new Set(allVistorias.map(v => v.bairro).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    DOM.sortByBairroSelect.innerHTML = '<option value="">Ordenar por Bairro</option>';
    bairros.forEach(b => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = b;
      DOM.sortByBairroSelect.appendChild(opt);
    });
  }

  // Filtro + Ordenação + Render
  function applyFiltersAndSort() {
    let items = [...allVistorias];
    const filterValue = DOM.filterDateSelect ? DOM.filterDateSelect.value : "all";

    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    if (filterValue === "today") {
      items = items.filter(v => v.data.toDateString() === today.toDateString());
    } else if (filterValue === "tomorrow") {
      items = items.filter(v => v.data.toDateString() === tomorrow.toDateString());
    }

    const bairroSel = DOM.sortByBairroSelect ? DOM.sortByBairroSelect.value : "";
    if (bairroSel) {
      items.sort((a, b) => {
        const A = a.bairro || "", B = b.bairro || "";
        if (A === bairroSel && B !== bairroSel) return -1;
        if (A !== bairroSel && B === bairroSel) return 1;
        return A.localeCompare(B);
      });
    } else {
      items.sort((a, b) => a.data.getTime() - b.data.getTime());
    }

    renderVistoriasList(items);
  }

  function updateDashboardStats(vistorias) {
    const total = vistorias.length;
    const completed = vistorias.filter(v => v.status === VISTORIA_STATUS.CONCLUIDO).length;
    const inProgress = vistorias.filter(v => v.status === VISTORIA_STATUS.EM_ANDAMENTO).length;
    const cancelled = vistorias.filter(v => v.status === VISTORIA_STATUS.CANCELADO).length;
    const pending = vistorias.filter(v => v.status === VISTORIA_STATUS.PENDENTE).length;

    const totalConsiderado = total - cancelled;
    const progress = totalConsiderado > 0
      ? Math.round(((completed + inProgress) / totalConsiderado) * 100)
      : 0;

    if (DOM.totalVistoriasSpan) DOM.totalVistoriasSpan.textContent = total;
    if (DOM.vistoriasConcluidasSpan) DOM.vistoriasConcluidasSpan.textContent = completed;
    if (DOM.vistoriasPendentesSpan) DOM.vistoriasPendentesSpan.textContent = pending + inProgress;
    if (DOM.progressPercentageSpan) DOM.progressPercentageSpan.textContent = `${progress}%`;
    if (DOM.progressFillDiv) DOM.progressFillDiv.style.width = `${progress}%`;
  }

  function renderVistoriasList(vistorias) {
    if (!DOM.vistoriasTableBody) return;
    DOM.vistoriasTableBody.innerHTML = "";

    if (vistorias.length === 0) {
      DOM.vistoriasTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:20px; color:#718096;">
            Nenhuma vistoria encontrada para esta seleção.
          </td>
        </tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    vistorias.forEach(v => {
      const tr = document.createElement("tr");

      let badge = "";
      let actions = "";

      switch (v.status) {
        case VISTORIA_STATUS.PENDENTE:
          badge = "pending";
          actions = `
            <button class="btn btn-primary btn-start" onclick="App.startVistoria('${v.id}')">
              <i class="fas fa-play"></i> Iniciar
            </button>
            <button class="btn btn-cancel" onclick="App.showCancelModal('${v.id}')">
              <i class="fas fa-times"></i> Cancelar
            </button>`;
          break;
        case VISTORIA_STATUS.EM_ANDAMENTO:
          badge = "in-progress";
          actions = `
            <button class="btn btn-primary btn-continue" onclick="App.continueVistoria('${v.id}')">
              <i class="fas fa-play"></i> Continuar
            </button>
            <button class="btn btn-cancel" onclick="App.showCancelModal('${v.id}')">
              <i class="fas fa-times"></i> Cancelar
            </button>`;
          break;
        case VISTORIA_STATUS.CONCLUIDO:
          badge = "completed";
          actions = `
            <button class="btn btn-info btn-view" onclick="App.viewVistoria('${v.id}')">
              <i class="fas fa-eye"></i> Visualizar
            </button>`;
          break;
        case VISTORIA_STATUS.CANCELADO:
          badge = "cancelled";
          actions = `
            <button class="btn btn-info btn-view" onclick="App.viewVistoria('${v.id}')">
              <i class="fas fa-eye"></i> Visualizar Cancelamento
            </button>`;
          break;
        default:
          badge = "unknown";
      }

      const dateStr = v.data.toLocaleDateString("pt-BR");
      const hasObs = !!(v.observacao && v.observacao.trim().length > 0);
      const safeObs = hasObs ? v.observacao.replace(/'/g, "\\'") : "";

      tr.innerHTML = `
        <td>${v.administradora}</td>
        <td>${v.condominio}</td>
        <td>${v.endereco}</td>
        <td>${v.bairro}</td>
        <td>${dateStr}</td>
        <td><span class="status-badge ${badge}">${v.status}</span></td>
        <td>
          ${hasObs
            ? `<button class="btn-observation-icon" title="Ver observação" onclick="App.showObservationModal('${safeObs}')">
                 <i class="fas fa-eye"></i>
               </button>`
            : `<span class="no-obs">—</span>`
          }
        </td>
        <td>
          <div class="actions-buttons">${actions}</div>
        </td>`;
      frag.appendChild(tr);
    });
    DOM.vistoriasTableBody.appendChild(frag);
  }
 
  // Ações de usuário
  async function startVistoria(id) {
    const idx = allVistorias.findIndex(v => v.id === id);
    if (idx === -1 || allVistorias[idx].status !== VISTORIA_STATUS.PENDENTE) {
      alert("Não é possível iniciar esta vistoria (status inválido).");
      return;
    }
    try {
      await authorizedFetch(`${API_BASE_URL}/rotas/${id}/iniciar`, { method: "PATCH" });
      allVistorias[idx].status = VISTORIA_STATUS.EM_ANDAMENTO;
      updateDashboardStats(allVistorias);
      applyFiltersAndSort();
      window.location.href = `vistoria.html?vistoriaId=${id}&action=start`;
    } catch (e) {
      console.error("Erro ao iniciar:", e);
      alert("Não foi possível iniciar a vistoria. Tente novamente.");
    }
  }

  function continueVistoria(id) {
    const v = allVistorias.find(v => v.id === id);
    if (v && v.status === VISTORIA_STATUS.EM_ANDAMENTO) {
      window.location.href = `vistoria.html?vistoriaId=${id}&action=continue`;
    } else {
      alert("Não é possível continuar esta vistoria. Verifique o status.");
    }
  }

  function viewVistoria(id) {
    const v = allVistorias.find(v => v.id === id);
    if (v) {
      alert(`Visualizando relatório da vistoria: ${v.condominio}.`);
      // Ex.: window.location.href = `relatorio.html?id=${id}`;
    }
  }


  // Modal de Observação
  function showObservationModal(text) {
    if (DOM.observationTextParagraph) {
      DOM.observationTextParagraph.innerText = text || "Nenhuma observação disponível.";
    }
    if (DOM.observationModal) {
      DOM.observationModal.classList.add("is-active");
    }
  }

  function closeObservationModal() {
    if (DOM.observationModal) {
      DOM.observationModal.classList.remove("is-active");
      if (DOM.observationTextParagraph) DOM.observationTextParagraph.innerText = "";
    }
  }

 
  // Modal de Cancelamento
  function showCancelModal(id) {
    if (!DOM.vistoriaIdInput || !DOM.cancelModal) return;

    DOM.vistoriaIdInput.value = id;
    DOM.cancelModal.classList.add("is-active");

    DOM.cancelForm?.reset();
    if (DOM.otherReasonContainer) {
      DOM.otherReasonContainer.style.display = "none";
      const textarea = document.getElementById("other-reason-desc");
      if (textarea) textarea.removeAttribute("required");
    }

    // Limpa foto vinculada
    if (DOM.cancelPhotoInput) {
      const dt = new DataTransfer();
      DOM.cancelPhotoInput.files = dt.files;
    }
    if (DOM.photoPreviewContainer) {
      DOM.photoPreviewContainer.innerHTML = "";
      DOM.photoPreviewContainer.style.display = "none";
    }
  }

  function closeCancelModal() {
    if (!DOM.cancelModal) return;
    DOM.cancelModal.classList.remove("is-active");
    DOM.cancelForm?.reset();
    handlePhotoPreview(null);

    if (DOM.otherReasonContainer) {
      DOM.otherReasonContainer.style.display = "none";
      const otherReasonInput = DOM.otherReasonContainer.querySelector("textarea");
      if (otherReasonInput) otherReasonInput.removeAttribute("required");
    }
  }

  function handlePhotoPreview(file) {
    if (!DOM.photoPreviewContainer) return;
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        DOM.photoPreviewContainer.innerHTML =
          `<img src="${e.target.result}" alt="Preview foto" style="max-width:100%;height:auto;border-radius:4px;">`;
        DOM.photoPreviewContainer.style.display = "block";
      };
      reader.readAsDataURL(file);
    } else {
      DOM.photoPreviewContainer.style.display = "none";
      DOM.photoPreviewContainer.innerHTML = "";
    }
  }

  async function submitCancelForm() {
    const vistoriaId = DOM.vistoriaIdInput?.value;
    const reason = DOM.cancelReasonSelect?.value;
    const otherReason = document.getElementById("other-reason-desc")?.value || "";
    const photoFile = DOM.cancelPhotoInput?.files?.[0];

    if (!vistoriaId || !reason) {
      alert("Selecione um motivo para o cancelamento.");
      return;
    }
    if (reason === "outro" && !otherReason.trim()) {
      alert("Por favor, especifique o motivo do cancelamento.");
      return;
    }
    if (!photoFile) {
      alert("É obrigatório anexar uma foto da fachada.");
      return;
    }

    const formData = new FormData();
    formData.append("status", VISTORIA_STATUS.CANCELADO);
    formData.append("cancelReason", reason);
    if (reason === "outro") {
      formData.append("otherCancelReason", otherReason);
    }
    formData.append("cancel-photo", photoFile);

    try {
      await authorizedFetch(`${API_BASE_URL}/rotas/${vistoriaId}`, {
        method: "PUT",
        body: formData, // NÃO definir Content-Type manualmente
      });

      // Atualiza cache local
      const idx = allVistorias.findIndex(v => v.id === vistoriaId);
      if (idx !== -1) {
        allVistorias[idx].status = VISTORIA_STATUS.CANCELADO;
        allVistorias[idx].observacao = `Cancelado: ${reason === "outro" ? otherReason : reason}`;
      }

      alert("Vistoria cancelada com sucesso!");
      closeCancelModal();
      await loadVistorias();
    } catch (err) {
      console.error("Erro ao cancelar:", err);
      alert("Erro ao cancelar vistoria: " + (err.message || "Erro desconhecido"));
    }
  }

  
  // Câmera nativa
  async function openCameraModal() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (DOM.cameraStreamVideo) DOM.cameraStreamVideo.srcObject = mediaStream;
      DOM.cameraModal?.classList.add("is-active");
    } catch (err) {
      console.error(err);
      alert("Não foi possível acessar a câmera. Verifique permissões.");
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (DOM.cameraStreamVideo) DOM.cameraStreamVideo.srcObject = null;
  }

  function closeCameraModal() {
    stopCamera();
    DOM.cameraModal?.classList.remove("is-active");
  }

  function capturePhotoAndAttach() {
    const video = DOM.cameraStreamVideo;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) {
        alert("Falha ao capturar a foto.");
        return;
      }
      const file = new File([blob], `fachada_${Date.now()}.jpg`, { type: "image/jpeg" });

      const dt = new DataTransfer();
      dt.items.add(file);
      if (DOM.cancelPhotoInput) {
        DOM.cancelPhotoInput.files = dt.files;
        handlePhotoPreview(file);
      }
      closeCameraModal();
    }, "image/jpeg", 0.92);
  }


  // Sidebar retrátil
  function openSidebar() {
    DOM.appContainer?.classList.add("sidebar-open");
  }
  function closeSidebar() {
    DOM.appContainer?.classList.remove("sidebar-open");
  }

  // ==========================
  // Logout
  // ==========================
  function handleLogout() {
    localStorage.removeItem("jwtToken");
    localStorage.removeItem("user");
    window.location.href = "index.html";
  }


  // Listeners
  function setupEventListeners() {
    // Filtros
    DOM.filterDateSelect?.addEventListener("change", applyFiltersAndSort);
    DOM.sortByBairroSelect?.addEventListener("change", applyFiltersAndSort);

    // Observação (modal)
    DOM.closeObservationModalBtn?.addEventListener("click", closeObservationModal);
    DOM.okObservationBtn?.addEventListener("click", closeObservationModal);
    DOM.observationModal?.addEventListener("click", (e) => {
      if (e.target === DOM.observationModal) closeObservationModal();
    });

    // Cancelamento (modal)
    DOM.cancelForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await submitCancelForm();
    });

    DOM.cancelReasonSelect?.addEventListener("change", function () {
      if (!DOM.otherReasonContainer) return;
      const isOther = this.value === "outro";
      DOM.otherReasonContainer.style.display = isOther ? "block" : "none";

      const otherInput = document.getElementById("other-reason-desc");
      if (otherInput) {
        isOther ? otherInput.setAttribute("required", "required") : otherInput.removeAttribute("required");
      }
    });

    // Impede upload manual — força usar a câmera
    DOM.cancelPhotoInput?.addEventListener("click", (e) => {
      e.preventDefault();
      alert("Use o botão 'Abrir câmera' para capturar a foto da fachada.");
    });

 
    DOM.cancelPhotoInput?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) handlePhotoPreview(f);
    });

    DOM.closeCancelModalBtn?.addEventListener("click", closeCancelModal);
    DOM.cancelCancelBtn?.addEventListener("click", closeCancelModal);
    DOM.cancelModal?.addEventListener("click", (e) => { if (e.target === DOM.cancelModal) closeCancelModal(); });

    // Câmera
    DOM.openCameraBtn?.addEventListener("click", openCameraModal);
    DOM.closeCameraModalBtn?.addEventListener("click", closeCameraModal);
    DOM.cancelCameraBtn?.addEventListener("click", closeCameraModal);
    DOM.capturePhotoBtn?.addEventListener("click", capturePhotoAndAttach);

    // Sidebar
    DOM.sidebarToggleBtn?.addEventListener("click", openSidebar);
    DOM.sidebarBackdrop?.addEventListener("click", closeSidebar);

    // Tecla ESC fecha tudo
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSidebar();
        closeObservationModal();
        closeCancelModal();
        closeCameraModal();
      }
    });

    (() => {

  const openModal = (id) => document.getElementById(id)?.classList.add('is-active');
  const closeModal = (id) => document.getElementById(id)?.classList.remove('is-active');

  // (A) OBSERVAÇÃO: abrir pelo "olho" só quando existir conteúdo
  const tableBody = document.getElementById('vistorias-table-body');
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-observacao');
      if (!btn) return;
      const obs = btn.dataset.obs?.trim();
      if (!obs) return;
      document.getElementById('observation-text').textContent = obs;
      openModal('observation-modal');
    });
  }

  // Fechar modal de observação
  const closeObs = () => closeModal('observation-modal');
  document.getElementById('close-observation-modal-btn')?.addEventListener('click', closeObs);
  document.getElementById('ok-observation-btn')?.addEventListener('click', closeObs);
  document.getElementById('observation-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'observation-modal') closeObs();
  });

  // (B) CANCELAR VISTORIA: abrir modal e preparar formulário
  let mediaStream = null;
  let capturedPhotoBlob = null;

  // Abre modal de cancelamento ao clicar no botão na linha
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.open-cancel');
      if (!btn) return;
      const rotaId = btn.dataset.id;
      document.getElementById('vistoria-id').value = rotaId || '';
      document.getElementById('cancel-reason').value = '';
      document.getElementById('other-reason-container').style.display = 'none';
      document.getElementById('other-reason-desc').value = '';
      document.getElementById('cancel-photo').value = '';
      document.getElementById('photo-preview').style.display = 'none';
      document.getElementById('photo-preview').innerHTML = '';
      capturedPhotoBlob = null;
      openModal('cancel-modal');
    });
  }

  // Mostrar textarea "outro" motivo
  document.getElementById('cancel-reason')?.addEventListener('change', (e) => {
    const show = e.target.value === 'outro';
    document.getElementById('other-reason-container').style.display = show ? 'block' : 'none';
  });

  // Pré-visualizar arquivo selecionado manualmente
  document.getElementById('cancel-photo')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const preview = document.getElementById('photo-preview');
    preview.innerHTML = `<img src="${url}" alt="Pré-visualização">`;
    preview.style.display = 'block';
    capturedPhotoBlob = null;
  });

  // (C) Abrir câmera em modal separado
  document.getElementById('open-camera-btn')?.addEventListener('click', async () => {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const video = document.getElementById('camera-stream');
      video.srcObject = mediaStream;
      openModal('camera-modal');
    } catch (err) {
      alert('Não foi possível acessar a câmera.');
    }
  });

  // Capturar frame do vídeo para blob
  document.getElementById('capture-photo-btn')?.addEventListener('click', async () => {
    const video = document.getElementById('camera-stream');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      capturedPhotoBlob = blob;
      const url = URL.createObjectURL(blob);
      const preview = document.getElementById('photo-preview');
      preview.innerHTML = `<img src="${url}" alt="Pré-visualização">`;
      preview.style.display = 'block';
      closeModal('camera-modal');
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
      }
    }, 'image/jpeg', 0.9);
  });

  // Fechar camera-modal
  const closeCamera = () => {
    closeModal('camera-modal');
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
  };
  document.getElementById('close-camera-modal')?.addEventListener('click', closeCamera);
  document.getElementById('cancel-camera-btn')?.addEventListener('click', closeCamera);
  document.getElementById('camera-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'camera-modal') closeCamera();
  });

  // (D) Submeter cancelamento
  document.getElementById('cancel-cancel-btn')?.addEventListener('click', () => closeModal('cancel-modal'));
  document.getElementById('close-cancel-modal-btn')?.addEventListener('click', () => closeModal('cancel-modal'));

  const cancelForm = document.getElementById('cancel-form');
  if (cancelForm) {
    cancelForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const rotaId = document.getElementById('vistoria-id').value;
      const reason = document.getElementById('cancel-reason').value;
      const otherDesc = document.getElementById('other-reason-desc').value.trim();

      if (!reason) {
        alert('Selecione o motivo do cancelamento.');
        return;
      }

      const fd = new FormData();
      fd.append('status', 'Cancelado');
      fd.append('cancelReason', reason);
      if (reason === 'outro' && otherDesc) fd.append('otherCancelReason', otherDesc);

      const fileFromInput = document.getElementById('cancel-photo').files?.[0];
      if (fileFromInput) {
        fd.append('cancel-photo', fileFromInput, fileFromInput.name);
      } else if (capturedPhotoBlob) {
        fd.append('cancel-photo', capturedPhotoBlob, 'foto-fachada.jpg');
      } else {
        alert('A foto da fachada é obrigatória.');
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`/api/rotas/${rotaId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        });

        if (!resp.ok) {
          const j = await resp.json().catch(() => ({}));
          throw new Error(j.message || 'Falha ao cancelar a vistoria.');
        }

        // Sucesso: fecha modal e recarrega a lista
        closeModal('cancel-modal');
        // Recarregar lista
        if (typeof window.loadVistorias === 'function') {
          window.loadVistorias();
        } else {
          location.reload();
        }
      } catch (err) {
        alert(err.message);
      }
    });
  }

})();


    // Logout
    DOM.logoutBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
    });
  }

  
  // Boot
  document.addEventListener("DOMContentLoaded", async function () {
    if (!loadCurrentUser()) return;
    updateGreeting();
    updateCurrentDate();
    await loadVistorias();
    setupEventListeners();
  });

  // API pública do módulo
  return {
    startVistoria,
    continueVistoria,
    viewVistoria,
    showCancelModal,
    closeCancelModal,
    showObservationModal,
    closeObservationModal,
    handleLogout,
    loadVistorias,
  };
})();


