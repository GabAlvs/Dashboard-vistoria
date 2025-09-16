document.addEventListener('DOMContentLoaded', function () {
  preencherDataEHorarioAutomaticamente();
  loadCondominioData();
  configurarEventosFormulario();
  initPhotoSections();
  initSignaturePads();
  loadDraft();
  setupSidebar();
});

const API_BASE_URL = 'http://localhost:3000/api';
let REPORT_LOGO_URL = ''; // definido em loadCondominioData()

function getToken() {
  return localStorage.getItem('jwtToken');
}

function redirectToLogin() {
  alert('Sessão expirada ou não autenticada. Por favor, faça login novamente.');
  window.location.href = 'index.html';
}


function getFirst(obj, keys, fallback = '') {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      return obj[k];
    }
  }
  return fallback;
}


function preencherDataEHorarioAutomaticamente() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const dataVistoriaInput = document.getElementById('data-vistoria');
  if (dataVistoriaInput) dataVistoriaInput.value = dateStr;

  const horarioVistoriaInput = document.getElementById('horario-vistoria');
  if (horarioVistoriaInput) horarioVistoriaInput.value = `${hours}:${minutes}`;
}


async function loadCondominioData() {
  const urlParams = new URLSearchParams(window.location.search);
  const vistoriaId = urlParams.get('vistoriaId');
  const token = getToken();

  if (!vistoriaId) {
    console.error('ID da vistoria não encontrado na URL.');
    const el = document.getElementById('current-condominio');
    if (el) el.textContent = 'ID da vistoria não especificado.';
    return;
  }
  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/rotas/${vistoriaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Erro ao carregar vistoria');

    const vistoria = await response.json();

    setText('current-condominio', vistoria.condominio || '');
    setValue('nome-estabelecimento', vistoria.condominio || '');
    setValue('endereco', vistoria.endereco || '');
    setValue('tecnico-responsavel', vistoria.vistoriadorNome || '');
    setValue('cnpj', vistoria.cnpj || '');

    // Logo absoluta para o PDF (evita problema de basePath do headless)
    REPORT_LOGO_URL = (vistoria.logoUrl && /^https?:\/\//i.test(vistoria.logoUrl))
      ? vistoria.logoUrl
      : `${window.location.origin}/img/logo Condomed.png`;

    const form = document.getElementById('vistoria-form');
    if (form) form.dataset.rotaId = vistoriaId;

  } catch (error) {
    console.error('Erro ao carregar dados da vistoria:', error);
    alert(`Erro: ${error.message}`);
    window.location.href = 'dashboard-vistoriador.html';
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? '';
}
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}


function configurarEventosFormulario() {
  const form = document.getElementById('vistoria-form');
  if (!form) {
    console.error('Formulário com ID "vistoria-form" não encontrado.');
    return;
  }

  const pericOutrosCheckbox = document.getElementById('peric-outros');
  const pericOutrosDescInput = document.getElementById('pericOutrosDesc');
  if (pericOutrosCheckbox && pericOutrosDescInput) {
    const syncPericOutros = () => {
      const show = pericOutrosCheckbox.checked;
      pericOutrosDescInput.style.display = show ? 'inline-block' : 'none';
      if (!show) pericOutrosDescInput.value = '';
    };
    pericOutrosCheckbox.addEventListener('change', syncPericOutros);
    syncPericOutros();
  }

  const epcQuaisInput = document.getElementById('env_epc_quais');
  const epcRadios = document.querySelectorAll('input[name="env_epc"]');
  if (epcQuaisInput && epcRadios.length) {
    const syncEpcQuais = () => {
      const checked = document.querySelector('input[name="env_epc"]:checked');
      const show = (checked && checked.value === 'sim');
      epcQuaisInput.style.display = show ? 'inline-block' : 'none';
      if (!show) epcQuaisInput.value = '';
    };
    epcRadios.forEach(r => r.addEventListener('change', syncEpcQuais));
    syncEpcQuais();
  }

  const atividadesOutrasChk = document.getElementById('atividades-outras');
  const atividadesOutrasDesc = document.getElementById('atividadesOutrasDesc');
  if (atividadesOutrasChk && atividadesOutrasDesc) {
    const syncAtividadesOutras = () => {
      const show = atividadesOutrasChk.checked;
      atividadesOutrasDesc.style.display = show ? 'inline-block' : 'none';
      if (!show) atividadesOutrasDesc.value = '';
    };
    atividadesOutrasChk.addEventListener('change', syncAtividadesOutras);
    syncAtividadesOutras();
  }

  
  const btnSave = document.querySelector('.btn-save');
  if (btnSave) btnSave.addEventListener('click', saveDraft);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitForm();
  });
}


function coletarDadosFormulario() {
  const form = document.getElementById('vistoria-form');
  const data = {};

  form.querySelectorAll('input[type="text"], input[type="date"], input[type="time"], textarea, select')
    .forEach(el => {
      const key = el.name || el.id;
      if (key) data[key] = el.value;
    });

  form.querySelectorAll('input[type="radio"]:checked').forEach(el => {
    if (el.name) data[el.name] = el.value;
  });

  form.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    if (chk.name) {
      if (!data[chk.name]) data[chk.name] = [];
      if (chk.checked) data[chk.name].push(chk.value || chk.id);
    }
  });

  data.rotaId = form.dataset.rotaId;

  data['fotos'] = window.PHOTOS_BY_SECTION;

  data['assinaturas'] = window.SIGNATURES;

  return data;
}


function saveDraft() {
  const formData = coletarDadosFormulario();
  const rotaId = formData.rotaId || 'default';
  try {
    localStorage.setItem(`vistoria-draft-${rotaId}`, JSON.stringify(formData));
    alert('Rascunho salvo localmente com sucesso!');
  } catch (e) {
    console.error('Erro ao salvar rascunho no localStorage:', e);
    alert('Não foi possível salvar o rascunho. O armazenamento pode estar cheio ou bloqueado.');
  }
}

function loadDraft() {
  const urlParams = new URLSearchParams(window.location.search);
  const rotaId = urlParams.get('vistoriaId');
  if (!rotaId) return;

  try {
    const savedDraft = localStorage.getItem(`vistoria-draft-${rotaId}`);
    if (!savedDraft) return;

    const formData = JSON.parse(savedDraft);

    for (const key in formData) {
      if (key === 'fotos' || key === 'assinaturas' || key === 'rotaId') continue;

      const elById = document.getElementById(key);
      if (elById) {
        elById.value = formData[key];
        continue;
      }

      const inputsByName = document.querySelectorAll(`[name="${key}"]`);
      if (inputsByName.length) {
        inputsByName.forEach(input => {
          if (input.type === 'radio') {
            input.checked = (input.value === formData[key]);
          } else if (input.type === 'checkbox') {
            input.checked = Array.isArray(formData[key]) && formData[key].includes(input.value || input.id);
          }
        });
      }
    }

    document.querySelectorAll('input[name="env_epc"]').forEach(el => el.dispatchEvent(new Event('change')));
    const outrasChk = document.getElementById('atividades-outras'); outrasChk?.dispatchEvent(new Event('change'));
    const pericOutros = document.getElementById('peric-outros'); pericOutros?.dispatchEvent(new Event('change'));

    if (formData.fotos) {
      window.PHOTOS_BY_SECTION = formData.fotos;
      ['portaria', 'lixo', 'maquinario', 'copa', 'epi'].forEach(updatePreview);
    }

    if (formData.assinaturas) {
      window.SIGNATURES = formData.assinaturas;
      if (signatureTechPad && window.SIGNATURES.techDataUrl) {
        signatureTechPad.fromDataURL(window.SIGNATURES.techDataUrl);
      }
      if (signatureLocalPad && window.SIGNATURES.localDataUrl) {
        signatureLocalPad.fromDataURL(window.SIGNATURES.localDataUrl);
      }
    }

    alert('Rascunho carregado com sucesso!');
  } catch (e) {
    console.error('Erro ao carregar rascunho:', e);
  }
}


function setupSidebar() {
  const container = document.querySelector('.app-container');
  const toggle = document.getElementById('sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');

  function openSidebar() { container?.classList.add('sidebar-open'); }
  function closeSidebar() { container?.classList.remove('sidebar-open'); }

  toggle?.addEventListener('click', openSidebar);
  backdrop?.addEventListener('click', closeSidebar);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

  document.getElementById('back-dashboard')?.addEventListener('click', function (e) {
    e.preventDefault();
    window.location.href = 'dashboard-vistoriador.html';
  });
}


async function submitForm() {
  const formData = coletarDadosFormulario();
  const rotaId = formData.rotaId;
  const token = getToken();

  if (!rotaId) {
    alert('Não foi possível identificar a rota para envio.');
    return;
  }
  if (!token) {
    redirectToLogin();
    return;
  }


  if (!formData['responsavel-local'] || formData['responsavel-local'].trim() === '') {
    alert('Por favor, informe o Responsável Local antes de finalizar a vistoria.');
    document.getElementById('responsavel-local').focus();
    return;
  }

  // Assinaturas obrigatórias
  if (!signatureTechPad || signatureTechPad.isEmpty()){
    alert('Assinatura do Técnico responsável é obrigatória.');
    return;
  }
  if (!signatureLocalPad || signatureLocalPad.isEmpty()){
    alert('Assinatura do Responsável local é obrigatória.');
    return;
  }

  // Determina status final pelo cancelamento
  const cancelReasonSelect = document.getElementById('cancel-reason');
  const finalStatus = cancelReasonSelect && cancelReasonSelect.value ? 'Cancelado' : 'Concluído';

  if (finalStatus === 'Cancelado') {
    const reason = cancelReasonSelect.value;
    if (reason === 'outro') {
      const otherDesc = document.getElementById('other-reason-desc')?.value || '';
      if (!otherDesc.trim()) {
        alert('Por favor, especifique o motivo do cancelamento.');
        document.getElementById('other-reason-desc')?.focus();
        return;
      }
    }
    const fotoInput = document.getElementById('cancel-photo');
    if (!fotoInput || !fotoInput.files || fotoInput.files.length === 0) {
      alert('É obrigatório anexar uma foto da fachada para o cancelamento.');
      return;
    }
  }

  const fd = new FormData();

  // Cabeçalho
  fd.append('condominio', getFirst(formData, ['nome-estabelecimento'], ''));
  fd.append('vistoriadorNome', getFirst(formData, ['tecnico-responsavel'], ''));
  fd.append('cnpj', getFirst(formData, ['cnpj'], ''));
  fd.append('endereco', getFirst(formData, ['endereco'], ''));
  fd.append('logoUrl', REPORT_LOGO_URL || `${window.location.origin}/img/logo Condomed.png`);
  fd.append('responsavelLocal', getFirst(formData, ['responsavel-local'], ''));
  fd.append('setor', getFirst(formData, ['setor'], ''));
  fd.append('dataVistoria', getFirst(formData, ['data-vistoria','dataVistoria'], ''));
  fd.append('horarioVistoria', getFirst(formData, ['horario-vistoria','horarioVistoria'], ''));

  // 2) ATIVIDADES OBSERVADAS
  if (Array.isArray(formData['atividades'])) {
    formData['atividades'].forEach(val => fd.append('atividades[]', val));
  }
  fd.append('atividadesOutrasDesc', getFirst(formData, ['atividadesOutrasDesc'], ''));

  // 3) CONDIÇÕES DO AMBIENTE
  fd.append('env_ventilacao', getFirst(formData, ['env_ventilacao'], ''));
  fd.append('env_iluminacao', getFirst(formData, ['env_iluminacao'], ''));
  fd.append('env_ordem', getFirst(formData, ['env_ordem'], ''));
  fd.append('env_sinalizacao', getFirst(formData, ['env_sinalizacao'], ''));
  fd.append('env_epc', getFirst(formData, ['env_epc'], ''));
  fd.append('env_epc_quais', getFirst(formData, ['env_epc_quais'], ''));

  // 4) RISCOS IDENTIFICADOS
  [
    'risco_biologicos','risco_quimicos','risco_ruido','risco_calorfrio',
    'risco_radiacoes','risco_eletricidade','risco_altura','risco_inflamaveis'
  ].forEach(key => fd.append(key, getFirst(formData, [key], '')));

  [
    'risco_biologicos_obs','risco_quimicos_obs','risco_ruido_obs','risco_calorfrio_obs',
    'risco_radiacoes_obs','risco_eletricidade_obs','risco_altura_obs','risco_inflamaveis_obs'
  ].forEach(key => fd.append(key, getFirst(formData, [key], '')));

  // 5) INSALUBRIDADE
  fd.append('insal_agente', getFirst(formData, ['insal_agente'], ''));
  fd.append('insal_justificativa', getFirst(formData, ['insal_justificativa'], ''));
  fd.append('insal_epi_fornecido', getFirst(formData, ['insal_epi_fornecido'], ''));
  fd.append('insal_epi_utilizado', getFirst(formData, ['insal_epi_utilizado'], ''));
  fd.append('epiNeutraliza', getFirst(formData, ['epiNeutraliza'], ''));
  fd.append('laudoInsalub', getFirst(formData, ['laudoInsalub'], ''));

  // 6) Periculosidade (NR-16)
  if (Array.isArray(formData['pericClassificacao'])) {
    formData['pericClassificacao'].forEach(item => fd.append('pericClassificacao[]', item));
  }
  fd.append('pericOutrosDesc', getFirst(formData, ['pericOutrosDesc'], ''));
  fd.append('exposicao', getFirst(formData, ['exposicao'], ''));
  fd.append('medidasControle', getFirst(formData, ['medidasControle'], ''));
  fd.append('laudoPeric', getFirst(formData, ['laudoPeric'], ''));

  // 7) EPI / Treinamento / Documentação
  fd.append('epiFornecimento', getFirst(formData, ['epiFornecimento'], ''));
  fd.append('relacaoEpis', getFirst(formData, ['relacaoEpis'], ''));
  fd.append('treinamentoEpi', getFirst(formData, ['treinamentoEpi'], ''));
  fd.append('fichaAssinada', getFirst(formData, ['fichaAssinada'], ''));
  fd.append('fichaEntrega', getFirst(formData, ['fichaEntrega'], ''));

  // 8/9) Observações & Checklist Ergo
  fd.append('observacoes', getFirst(formData, ['observacoesConclusao'], ''));
  fd.append('observacoesErgo', getFirst(formData, ['observacoesErgo'], ''));

  // Checklist ergo (radios "sim" | "nao")
  [
    'postura','cargas','cargasPeso','repetitivo','esforco','pausas','pe',
    'ferramentas','apoio','piso','ambiente','protecao','ruidoErgo','obstaculos','queda',
    'jornadaPausas','jornadaProlongada','revezamento','tempo'
  ].forEach(key => fd.append(key, getFirst(formData, [key], '')));

  // Fotos (por setor) em JSON
  fd.append('fotos', JSON.stringify(window.PHOTOS_BY_SECTION || {}));

  // Assinaturas
  fd.append('assinaturaTecnico', window.SIGNATURES.techDataUrl || '');
  fd.append('assinaturaResponsavel', window.SIGNATURES.localDataUrl || '');
  // chaves usadas diretamente no template do PDF:
  fd.append('signatureTechDataUrl', window.SIGNATURES.techDataUrl || '');
  fd.append('signatureLocalDataUrl', window.SIGNATURES.localDataUrl || '');

  // Status
  fd.append('status', finalStatus);

  // Dados de cancelamento
  if (finalStatus === 'Cancelado') {
    const reason = document.getElementById('cancel-reason')?.value || '';
    const otherReason = document.getElementById('other-reason-desc')?.value || '';
    const photoFile = document.getElementById('cancel-photo')?.files?.[0] || null;

    fd.append('isCancelled', 'true');
    fd.append('cancelamentoMotivo', reason === 'outro' ? otherReason : reason);
    fd.append('cancelamentoData', new Date().toISOString().slice(0, 10));
    if (photoFile) fd.append('cancelamentoFoto', photoFile);
  } else {
    fd.append('isCancelled', 'false');
  }

  try {
    const resp = await fetch(`${API_BASE_URL}/rotas/${rotaId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: fd
    });

    if (resp.status === 401 || resp.status === 403) {
      redirectToLogin();
      return;
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `Erro ao finalizar vistoria: ${resp.statusText}`);
    }

    const result = await resp.json();
    console.log('Vistoria finalizada:', result);
    alert(`Vistoria registrada como "${finalStatus}" com sucesso!`);

    // Limpa rascunho
    localStorage.removeItem(`vistoria-draft-${rotaId}`);

    window.location.href = 'dashboard-vistoriador.html';
  } catch (error) {
    console.error('Erro ao enviar formulário:', error);
    alert(`Erro ao finalizar vistoria: ${error.message}`);
  }
}

/* Registros Visuais*/
window.PHOTOS_BY_SECTION = { portaria: [], lixo: [], maquinario: [], copa: [], epi: [] };


let cameraStream = null;
let currentSectionKey = null;

function initPhotoSections() {
  document.querySelectorAll('.btn-tirar-foto').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      openCameraForSection(section);
    });
  });

  // Botões "Limpar"
  document.querySelectorAll('.btn-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      window.PHOTOS_BY_SECTION[section] = [];
      updatePreview(section);
    });
  });

  // Controles do modal
  document.getElementById('camera-cancel')?.addEventListener('click', closeCameraModal);
  document.getElementById('camera-close')?.addEventListener('click', closeCameraModal);
  document.getElementById('camera-capture')?.addEventListener('click', capturePhoto);
}

async function openCameraForSection(sectionKey) {
  currentSectionKey = sectionKey;
  const sectionLabel = document.getElementById('camera-section-label');
  if (sectionLabel) sectionLabel.textContent = labelForSection(sectionKey);

  const modal = document.getElementById('camera-modal');
  modal.classList.add('is-active');

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    const video = document.getElementById('camera-stream');
    video.srcObject = cameraStream;
    await video.play();
  } catch (err) {
    console.error('Permissão/erro de câmera:', err);
    alert('Não foi possível acessar a câmera. Verifique permissões do navegador/dispositivo.');
    closeCameraModal();
  }
}

function closeCameraModal() {
  const modal = document.getElementById('camera-modal');
  modal.classList.remove('is-active');

  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  currentSectionKey = null;
}

function capturePhoto() {
  const video = document.getElementById('camera-stream');
  const canvas = document.getElementById('camera-canvas');
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  canvas.toBlob(blob => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (currentSectionKey) {
        window.PHOTOS_BY_SECTION[currentSectionKey].push(dataUrl);
        updatePreview(currentSectionKey);
      }
    };
    reader.readAsDataURL(blob);
  }, 'image/jpeg', 0.9);
}

function updatePreview(sectionKey) {
  const grid = document.getElementById(`preview-${sectionKey}`);
  const count = document.getElementById(`count-${sectionKey}`);
  const list = window.PHOTOS_BY_SECTION[sectionKey] || [];

  if (count) count.textContent = `${list.length} foto(s)`;
  if (grid) grid.innerHTML = list.map(src => (
    `<img class="photo-thumb" src="${src}" alt="Foto ${labelForSection(sectionKey)}">`
  )).join('');
}
function labelForSection(key) {
  switch (key) {
    case 'portaria':  return 'Portaria';
    case 'lixo':      return 'Área do lixo';
    case 'maquinario':return 'Maquinário';
    case 'copa':      return 'Copa/cozinha';
    case 'epi':       return 'EPI';
    default:          return 'Setor';
  }
}

/* Assinaturas */
let signatureTechPad = null;
let signatureLocalPad = null;
window.SIGNATURES = { techDataUrl: "", localDataUrl: "" };

function initSignaturePads(){
  const techCanvas = document.getElementById('sig-tech');
  const localCanvas = document.getElementById('sig-local');

  signatureTechPad = makeSignaturePad(techCanvas);
  signatureLocalPad = makeSignaturePad(localCanvas);

  document.getElementById('sig-tech-undo')?.addEventListener('click', () => signatureTechPad.undo());
  document.getElementById('sig-tech-clear')?.addEventListener('click', () => signatureTechPad.clear());

  document.getElementById('sig-local-undo')?.addEventListener('click', () => signatureLocalPad.undo());
  document.getElementById('sig-local-clear')?.addEventListener('click', () => signatureLocalPad.clear());

  
  if (window.SIGNATURES.techDataUrl) signatureTechPad.fromDataURL(window.SIGNATURES.techDataUrl);
  if (window.SIGNATURES.localDataUrl) signatureLocalPad.fromDataURL(window.SIGNATURES.localDataUrl);


  [signatureTechPad, signatureLocalPad].forEach(p => p && p.resizeForDPR());
}

function makeSignaturePad(canvas){
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  let drawing = false;
  let strokes = [];
  let current = [];

  function resizeForDPR(){
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(600, Math.round(rect.width * dpr));
    canvas.height = Math.round(200 * dpr);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
    redraw();
  }

  function pointerPos(e){
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX ?? (e.touches?.[0]?.clientX || 0));
    const cy = (e.clientY ?? (e.touches?.[0]?.clientY || 0));
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function start(e){
    e.preventDefault();
    drawing = true; current = [];
    current.push(pointerPos(e));
    redraw();
  }
  function move(e){
    if (!drawing) return;
    e.preventDefault();
    current.push(pointerPos(e));
    redraw();
  }
  function end(){
    if (!drawing) return;
    drawing = false;
    if (current.length > 0) strokes.push(current);
    current = [];
    redraw();
    saveDataURL();
  }

  function redraw(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111827';

    const drawStroke = (s) => {
      if (s.length < 2) {
        const p = s[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.25, 0, Math.PI * 2);
        ctx.fillStyle = '#111827';
        ctx.fill(); return;
      }
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    };

    strokes.forEach(drawStroke);
    if (current.length) drawStroke(current);
  }

  function clear(){
    strokes = []; current = [];
    redraw();
    saveDataURL();
  }

  function undo(){
    strokes.pop();
    redraw();
    saveDataURL();
  }

  function isEmpty(){
    return strokes.length === 0;
  }

  function toDataURL(){
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.round(canvas.getBoundingClientRect().width);
    exportCanvas.height = 200;
    const ex = exportCanvas.getContext('2d');
    ex.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
    return exportCanvas.toDataURL('image/png');
  }

  function fromDataURL(dataUrl){
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      clear();
      const rectW = canvas.getBoundingClientRect().width;
      const ex = canvas.getContext('2d');
      ex.drawImage(img, 0, 0, rectW, 200);
      saveDataURL();
    };
    img.src = dataUrl;
  }

  function saveDataURL(){
    const dataUrl = toDataURL();
    if (canvas.id === 'sig-tech') window.SIGNATURES.techDataUrl = dataUrl;
    if (canvas.id === 'sig-local') window.SIGNATURES.localDataUrl = dataUrl;
  }

  // Eventos pointer/touch
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  canvas.addEventListener('touchstart', start, { passive:false });
  canvas.addEventListener('touchmove', move, { passive:false });
  window.addEventListener('touchend', end);

  // Redimensiona ao girar/resize
  window.addEventListener('resize', resizeForDPR);

  return { clear, undo, isEmpty, toDataURL, fromDataURL, resizeForDPR };
}
