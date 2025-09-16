require('dotenv').config();
console.log('Valor de JWT_SECRET lido pelo process.env:', process.env.JWT_SECRET);

// 2) Core deps
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// 3) PDF deps
const playwright = require('playwright');
const handlebars = require('handlebars');
const fs = require('fs').promises;

// 4) DB
const mongoose = require('mongoose');
const Rota = require('./models/Rota');
const Usuario = require('./models/Usuario');
const Vistoria = require('./models/Vistoria');

const app = express();
const PORT = process.env.PORT || 3000;

// 5) Mongo
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/condomed';
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conectado ao MongoDB com sucesso!'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

app.use(
  cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' })); // aceita DataURL maiores
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Servir assets de /public
app.use(express.static(path.join(__dirname, '..', 'public')));

// JWT
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_para_desenvolvimento_nao_usar_em_producao';
if (!process.env.JWT_SECRET) {
  console.warn('ATENÇÃO: JWT_SECRET não está definido! Usando fallback (INSEGURO em produção).');
}


 // 7) Handlebars helpers

const toStr = v => (v == null ? '' : String(v));
const norm = v => toStr(v).trim().toLowerCase();

handlebars.registerHelper('eq', (a, b) => norm(a) === norm(b));

handlebars.registerHelper('contains', (arr, val) => {
  if (!Array.isArray(arr)) return false;
  const v = norm(val);
  return arr.some(x => norm(x) === v);
});

handlebars.registerHelper('notEmpty', v => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return toStr(v).trim() !== '';
});

handlebars.registerHelper('coalesce', (...args) => {
  const options = args.pop();
  for (const v of args) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && Object.keys(v).length === 0) continue;
    return v;
  }
  return '';
});

handlebars.registerHelper('yesNo', v => (norm(v) === 'sim' || v === true ? 'Sim' : 'Não'));

handlebars.registerHelper('join', (arr, sep) => (Array.isArray(arr) ? arr.join(sep || ', ') : ''));

handlebars.registerHelper('any', function (...args) {
  const options = args.pop();
  return args.some(Boolean) ? options.fn(this) : options.inverse(this);
});

handlebars.registerHelper('all', function (...args) {
  const options = args.pop();
  return args.every(Boolean) ? options.fn(this) : options.inverse(this);
});

handlebars.registerHelper('dateFmt', v => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toLocaleDateString('pt-BR') : '';
});

handlebars.registerHelper('timeFmt', v => {
  if (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)) return v;
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toTimeString().slice(0, 5) : '';
});


 //8) assinaturas - Util: DataURL -> “arquivo”

function parseDataUrlToFileLike(dataUrl, fallbackName = 'image.png') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const [meta, base64] = dataUrl.split(',');
  const mimetype = meta.substring(5, meta.indexOf(';')) || 'image/png';
  return {
    originalname: fallbackName,
    mimetype,
    size: Math.ceil((base64.length * 3) / 4),
    buffer: base64,
  };
}

// 9) Upload (Multer) — memória + limites + filtro
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    fieldSize: 30 * 1024 * 1024,
    fields: 2000,
    files: 5,
    parts: 3000,
  },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error('Tipo de arquivo inválido. Use PNG, JPG/JPEG ou WEBP.'), ok);
  },
});
const uploadFields = upload.fields([
  { name: 'cancel-photo', maxCount: 1 },
  { name: 'signature-tech', maxCount: 1 },
  { name: 'signature-local', maxCount: 1 },
]);

const uploadExcel = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
    fields: 50,
    files: 1,
    parts: 100,
  },
  fileFilter: (req, file, cb) => {
    const ok = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel',
    ].includes(file.mimetype);
    cb(ok ? null : new Error('Arquivo Excel inválido. Envie um .xlsx'), ok);
  },
});

// 10) Auth middlewares
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Erro de verificação JWT:', err.message);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};
const authorizeGestor = (req, res, next) =>
  req.user?.role === 'gestor_rotas' ? next() : res.status(403).json({ message: 'Acesso negado. Requer perfil de Gestor.' });
const authorizeVistoriador = (req, res, next) =>
  req.user?.role === 'vistoriador' ? next() : res.status(403).json({ message: 'Acesso negado. Requer perfil de Vistoriador.' });
const authorizeVisualizador = (req, res, next) =>
  (req.user && ['visualizador_vistorias', 'gestor_rotas', 'vistoriador'].includes(req.user.role))
    ? next() : res.status(403).json({ message: 'Acesso negado. Requer perfil de Visualizador.' });

// 11) Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await Usuario.findOne({ username });
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      const token = jwt.sign({ id: user._id, username: user.username, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
      res.json({ message: 'Login bem-sucedido', token, user: { id: user._id, username: user.username, name: user.name, role: user.role } });
    } else res.status(401).json({ message: 'Usuário ou senha inválidos.' });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// 12) Dashboard APIs
app.get('/api/vistoriadores', authenticateJWT, authorizeVisualizador, async (req, res) => {
  try {
    const vistoriadores = await Usuario.find({ role: 'vistoriador' }, '_id name');
    res.json({ vistoriadores: vistoriadores.map(v => ({ id: v._id, nome: v.name, cargo: 'Vistoriador' })) });
  } catch (error) {
    console.error('Erro ao buscar vistoriadores:', error);
    res.status(500).json({ message: 'Erro ao buscar vistoriadores.' });
  }
});

app.get('/api/dashboard/summary', authenticateJWT, authorizeVisualizador, async (req, res) => {
  try {
    const allVistoriadores = await Usuario.find({ role: 'vistoriador' });
    const vistoriadoresStats = await Promise.all(
      allVistoriadores.map(async vistoriador => {
        const rotasDoVistoriador = await Rota.find({ vistoriadorId: vistoriador._id });
        const totalRotas = rotasDoVistoriador.length;
        const rotasConcluidas = rotasDoVistoriador.filter(rota => rota.status === 'Concluído').length;
        const rotasEmAndamento = rotasDoVistoriador.filter(rota => rota.status === 'Em Andamento').length;
        const rotasPendentes = rotasDoVistoriador.filter(rota => rota.status === 'Pendente').length;
        const rotasCanceladas = rotasDoVistoriador.filter(rota => rota.status === 'Cancelado').length;
        const progresso = totalRotas > 0 ? (rotasConcluidas / totalRotas) * 100 : 0;
        return {
          id: vistoriador._id,
          nome: vistoriador.name,
          cargo: 'Vistoriador',
          stats: {
            totalRotas,
            rotasConcluidas,
            rotasEmAndamento,
            rotasPendentes,
            rotasCanceladas,
            progresso: parseFloat(progresso.toFixed(2)),
          },
        };
      })
    );
    res.json({ vistoriadores: vistoriadoresStats });
  } catch (error) {
    console.error('Erro ao calcular estatísticas:', error);
    res.status(500).json({ message: 'Erro ao calcular estatísticas' });
  }
});

app.get('/api/bairros', authenticateJWT, authorizeVisualizador, async (req, res) => {
  try {
    const bairros = await Rota.distinct('bairro');
    res.json({ bairros: bairros.sort() });
  } catch (error) {
    console.error('Erro ao buscar bairros:', error);
    res.status(500).json({ message: 'Erro ao buscar bairros.' });
  }
});

app.get('/api/administradoras', authenticateJWT, authorizeVisualizador, async (req, res) => {
  try {
    const administradoras = await Rota.distinct('administradora');
    res.json({ administradoras: administradoras.sort() });
  } catch (error) {
    console.error('Erro ao buscar administradoras:', error);
    res.status(500).json({ message: 'Erro ao buscar administradoras.' });
  }
});

// 13) Rotas CRUD de Rotas
app.get('/api/rotas', authenticateJWT, authorizeVisualizador, async (req, res) => {
  const { vistoriadorId, startDate, endDate, bairro, administradora, status, page = 1, limit = 10 } = req.query;
  let query = {};
  if (vistoriadorId) query.vistoriadorId = vistoriadorId;
  if (startDate || endDate) {
    query.data = {};
    if (startDate) query.data.$gte = new Date(startDate);
    if (endDate) query.data.$lte = new Date(endDate);
  }
  if (bairro) query.bairro = bairro;
  if (administradora) query.administradora = administradora;
  if (status) query.status = Array.isArray(status) ? { $in: status } : status;

  try {
    const total = await Rota.countDocuments(query);
    const rotas = await Rota.find(query).sort({ data: -1, status: 1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ total, page: parseInt(page), limit: parseInt(limit), rotas });
  } catch (error) {
    console.error('Erro ao buscar rotas:', error);
    res.status(500).json({ message: 'Erro ao buscar rotas.' });
  }
});

app.get('/api/rotas/:id', authenticateJWT, authorizeVisualizador, async (req, res) => {
  const { id } = req.params;
  try {
    const rota = await Rota.findById(id);
    if (!rota) return res.status(404).json({ message: 'Rota não encontrada.' });
    res.json(rota);
  } catch (error) {
    console.error('Erro ao buscar rota por ID:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao buscar rota.' });
  }
});

// 14) PDF (Playwright + Handlebars)
app.get('/api/rotas/:id/pdf', authenticateJWT, authorizeVisualizador, async (req, res) => {
  const { id } = req.params;

  try {
    const vistoria = await Vistoria.findOne({ rotaId: id, status: { $in: ['Concluído', 'Cancelado'] } })
      .sort({ data: -1, horario: -1 });

    if (!vistoria) {
      return res.status(404).json({ message: 'Nenhuma vistoria concluída ou cancelada encontrada para esta rota.' });
    }

    // Assinaturas -> DataURL
    const techSig = vistoria.assinaturas?.tecnico;
    const localSig = vistoria.assinaturas?.responsavel;
    const signatureTechDataUrl = techSig
      ? (typeof techSig === 'string' && techSig.startsWith('data:')
          ? techSig
          : `data:${techSig.mimetype || 'image/png'};base64,${techSig.buffer}`)
      : null;
    const signatureLocalDataUrl = localSig
      ? (typeof localSig === 'string' && localSig.startsWith('data:')
          ? localSig
          : `data:${localSig.mimetype || 'image/png'};base64,${localSig.buffer}`)
      : null;

    // Fotos por setor
    const fotos = vistoria.fotos || { portaria: [], lixo: [], maquinario: [], copa: [], epi: [] };

    // URL absoluta da logo (funciona no Chromium/Playwright)
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const logoFile = encodeURIComponent('logo Condomed.png');
    const logoUrl = `${baseUrl}/img/${logoFile}`;

    const templateData = {

      condominio: vistoria.condominio,
      endereco: vistoria.endereco,
      bairro: vistoria.bairro,
      administradora: vistoria.administradora,
      cnpj: vistoria.cnpj,
      vistoriadorNome: vistoria.vistoriadorNome,
      responsavelLocal: vistoria.responsavelLocal,
      dataVistoria: vistoria.data,
      horarioVistoria: vistoria.horario,
      setor: vistoria.setor,
      statusVistoria: vistoria.status,

      // Atividades observadas
      atividades: Array.isArray(vistoria.atividades) ? vistoria.atividades : [],
      atividadesOutrasDesc: vistoria.atividadesOutrasDesc,

      // Condições do ambiente
      env_ventilacao: vistoria.env_ventilacao,
      env_iluminacao: vistoria.env_iluminacao,
      env_ordem: vistoria.env_ordem,
      env_sinalizacao: vistoria.env_sinalizacao,
      env_epc: vistoria.env_epc,
      env_epc_quais: vistoria.env_epc_quais,

      // Riscos identificados
      risco_biologicos: vistoria.risco_biologicos,
      risco_biologicos_obs: vistoria.risco_biologicos_obs,
      risco_quimicos: vistoria.risco_quimicos,
      risco_quimicos_obs: vistoria.risco_quimicos_obs,
      risco_ruido: vistoria.risco_ruido,
      risco_ruido_obs: vistoria.risco_ruido_obs,
      risco_calorfrio: vistoria.risco_calorfrio,
      risco_calorfrio_obs: vistoria.risco_calorfrio_obs,
      risco_radiacoes: vistoria.risco_radiacoes,
      risco_radiacoes_obs: vistoria.risco_radiacoes_obs,
      risco_eletricidade: vistoria.risco_eletricidade,
      risco_eletricidade_obs: vistoria.risco_eletricidade_obs,
      risco_altura: vistoria.risco_altura,
      risco_altura_obs: vistoria.risco_altura_obs,
      risco_inflamaveis: vistoria.risco_inflamaveis,
      risco_inflamaveis_obs: vistoria.risco_inflamaveis_obs,

      // Insalubridade
      insal_agente: vistoria.insal_agente,
      insal_justificativa: vistoria.insal_justificativa,
      insal_epi_fornecido: vistoria.insal_epi_fornecido,
      insal_epi_utilizado: vistoria.insal_epi_utilizado,

      // Periculosidade (NR-16) / EPI
      epiNeutraliza: vistoria.epiNeutraliza,
      laudoInsalub: vistoria.laudoInsalub,
      pericClassificacao: Array.isArray(vistoria.pericClassificacao) ? vistoria.pericClassificacao : [],
      pericOutrosDesc: vistoria.pericOutrosDesc,
      exposicao: vistoria.exposicao,
      medidasControle: vistoria.medidasControle,
      laudoPeric: vistoria.laudoPeric,
      epiFornecimento: vistoria.epiFornecimento,
      relacaoEpis: vistoria.relacaoEpis,
      treinamentoEpi: vistoria.treinamentoEpi,
      fichaAssinada: vistoria.fichaAssinada,
      fichaEntrega: vistoria.fichaEntrega,

      // Observações gerais / ergonomia
      observacoesConclusao: vistoria.observacoes || 'Nenhuma observação registrada.',
      postura: vistoria.postura,
      cargas: vistoria.cargas,
      cargasPeso: vistoria.cargasPeso,
      repetitivo: vistoria.repetitivo,
      esforco: vistoria.esforco,
      pausas: vistoria.pausas,
      pe: vistoria.pe,
      ferramentas: vistoria.ferramentas,
      apoio: vistoria.apoio,
      piso: vistoria.piso,
      ambiente: vistoria.ambiente,
      protecao: vistoria.protecao,
      ruidoErgo: vistoria.ruidoErgo,
      obstaculos: vistoria.obstaculos,
      queda: vistoria.queda,
      jornadaPausas: vistoria.jornadaPausas,
      jornadaProlongada: vistoria.jornadaProlongada,
      revezamento: vistoria.revezamento,
      tempo: vistoria.tempo,
      observacoesErgo: vistoria.observacoesErgo || 'Nenhuma observação de ergonomia registrada.',

      // Cancelamento
      isCancelled: vistoria.status === 'Cancelado',
      isConcluded: vistoria.status === 'Concluído',
      cancelamentoMotivo: vistoria.cancelamento?.motivo,
      cancelamentoData: vistoria.cancelamento?.dataCancelamento,
      cancelamentoFoto: vistoria.cancelamento?.fotoFachada,
      cancelamentoFotoMimeType: vistoria.cancelamento?.fotoFachada?.mimetype,
      cancelamentoFotoBuffer: vistoria.cancelamento?.fotoFachada?.buffer,

      // Fotos/Assinaturas pro template
      fotos,
      signatureTechDataUrl,
      signatureLocalDataUrl,

      // Logo
      logoUrl,
    };

    const templatePath = path.join(__dirname, '..', 'public', 'pdf-templates', 'report-template.html');
    await fs.access(templatePath).catch(() => { throw new Error(`Template não encontrado em: ${templatePath}`); });

    const templateSource = await fs.readFile(templatePath, 'utf8');
    const compiledTemplate = handlebars.compile(templateSource);
    const htmlContent = compiledTemplate(templateData);

    // Abrir PDF navegador (Edge/Chrome se disponíveis)
    const tryLaunch = async () => {
      try { return await playwright.chromium.launch({ channel: 'msedge' }); } catch (_) {}
      try { return await playwright.chromium.launch({ channel: 'chrome' }); } catch (_) {}
      return await playwright.chromium.launch();
    };
    const browserInstance = await tryLaunch();
    const page = await browserInstance.newPage();

    // baseURL = host atual
    const baseUrlForPage = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    await page.setContent(htmlContent, { waitUntil: 'networkidle', baseURL: baseUrlForPage });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });

    const safeName = String(vistoria.condominio || 'condominio')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio_vistoria_${safeName}.pdf"`);
    res.send(pdfBuffer);

    await browserInstance.close();
  } catch (error) {
    console.error('Erro ao gerar PDF com Playwright:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao gerar PDF.', error: error.message });
  }
});

// 15) Iniciar vistoria
app.patch('/api/rotas/:id/iniciar', authenticateJWT, authorizeVistoriador, async (req, res) => {
  const { id } = req.params;
  try {
    const rota = await Rota.findById(id);
    if (!rota) return res.status(404).json({ message: 'Rota não encontrada.' });
    if (rota.status !== 'Pendente') {
      return res.status(400).json({ message: 'A vistoria não pode ser iniciada, pois não está no status Pendente.' });
    }
    rota.status = 'Em Andamento';
    await rota.save();
    res.json({ message: 'Vistoria iniciada com sucesso!', rota });
  } catch (error) {
    console.error('Erro ao iniciar vistoria:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao iniciar vistoria.' });
  }
});

// 16) Criar rota
app.post('/api/rotas', authenticateJWT, authorizeGestor, async (req, res) => {
  const { condominio, endereco, bairro, administradora, vistoriadorId, data, status, observacaoCondominio, cnpj } = req.body;
  try {
    const vistoriador = await Usuario.findById(vistoriadorId);
    if (!vistoriador || vistoriador.role !== 'vistoriador') {
      return res.status(400).json({ message: 'Vistoriador não encontrado ou não é um vistoriador válido.' });
    }

    const newRota = new Rota({
      condominio, endereco, bairro, administradora,
      cnpj: cnpj || '',
      vistoriadorId: vistoriador._id,
      vistoriadorNome: vistoriador.name,
      data,
      status: status || 'Pendente',
      observacaoCondominio: observacaoCondominio || null,
      relatorioPdfId: null,
    });

    const savedRota = await newRota.save();
    res.status(201).json({ message: 'Rota criada com sucesso!', rota: savedRota });
  } catch (error) {
    console.error('Erro ao criar rota:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao criar rota.', error: error.message });
  }
});

// 17) Remover rota
app.delete('/api/rotas/:id', authenticateJWT, authorizeGestor, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await Rota.findByIdAndDelete(id);
    if (result) res.status(204).send();
    else res.status(404).json({ message: 'Rota não encontrada para exclusão.' });
  } catch (error) {
    console.error('Erro ao deletar rota:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao deletar rota.' });
  }
});

// 18) Importar Excel
app.post('/api/rotas/import', authenticateJWT, authorizeGestor, uploadExcel.single('excelFile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado.' });

  const { vistoriadorId, data } = req.body;
  if (!vistoriadorId) return res.status(400).json({ message: 'ID do vistoriador deve ser fornecido para a importação.' });

  try {
    const vistoriador = await Usuario.findById(vistoriadorId);
    if (!vistoriador || vistoriador.role !== 'vistoriador') {
      return res.status(400).json({ message: 'Vistoriador selecionado não encontrado ou não é um vistoriador válido.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);

    let importedCount = 0;
    const errors = [];
    const newRotas = [];

    for (const [index, row] of jsonData.entries()) {
      const administradora = row['ADMINISTRADORA'];
      const condominio = row['CONDOMINIO'];
      const endereco = row['ENDEREÇO'];
      const bairro = row['BAIRRO'];
      const cnpj = row['CNPJ'];
      const observacaoCondominio = row['OBSERVAÇÃO'] || null;

      if (!administradora || !condominio || !endereco || !bairro || !cnpj) {
        errors.push(`Linha ${index + 2}: Dados incompletos. Requer ADMINISTRADORA, CONDOMINIO, ENDEREÇO, BAIRRO e CNPJ.`);
        continue;
      }

      const dataVistoria = data ? new Date(data + 'T12:00:00') : new Date();

      newRotas.push({
        condominio, endereco, bairro, administradora,
        cnpj: cnpj || '',
        vistoriadorId: vistoriador._id,
        vistoriadorNome: vistoriador.name,
        data: dataVistoria,
        status: 'Pendente',
        observacaoCondominio,
        relatorioPdfId: null,
      });
    }

    if (newRotas.length > 0) {
      const insertedDocs = await Rota.insertMany(newRotas);
      importedCount = insertedDocs.length;
    }

    if (errors.length > 0) {
      return res.status(200).json({
        message: `Importação concluída com ${importedCount} rotas adicionadas. ${errors.length} erros encontrados.`,
        errors,
      });
    }

    res.status(200).json({
      message: `Importação concluída! ${importedCount} rotas adicionadas com sucesso para o vistoriador ${vistoriador.name}.`,
      importedRotas: importedCount,
    });
  } catch (error) {
    console.error('Erro ao importar arquivo Excel:', error);
    res.status(500).json({
      message: 'Erro interno do servidor ao processar o arquivo Excel.',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// 19) Servir HTML estático protegido
app.get('/dashboard-gestor', authenticateJWT, authorizeGestor, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard-gestor.html'));
});
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '..', 'public', 'index.html')); });
app.get('/dashboard-*', authenticateJWT, (req, res) => {
  const file = req.path.split('/').pop();
  res.sendFile(path.join(__dirname, '..', 'public', file));
});
app.get('/dashboard-gestor.html', authenticateJWT, authorizeGestor, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard-gestor.html'));
});
app.get('/dashboard-vistoriador.html', authenticateJWT, authorizeVistoriador, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard-vistoriador.html'));
});
app.get('/dashboard-visualizador.html', authenticateJWT, authorizeVisualizador, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard-visualizador.html'));
});

// 20) Finalizar vistoria (Concluído/Cancelado) — upload.fields + DataURL para assinaturas
app.put('/api/rotas/:id', authenticateJWT, authorizeVistoriador, uploadFields, async (req, res) => {
  const { id } = req.params;

 
  const {
    status, observacaoCondominio,

    // 2. Atividades
    atividadesOutrasDesc,

    // 3. Condições do ambiente
    env_ventilacao, env_iluminacao, env_ordem, env_sinalizacao, env_epc, env_epc_quais,

    // 4. Riscos identificados
    risco_biologicos, risco_biologicos_obs,
    risco_quimicos, risco_quimicos_obs,
    risco_ruido, risco_ruido_obs,
    risco_calorfrio, risco_calorfrio_obs,
    risco_radiacoes, risco_radiacoes_obs,
    risco_eletricidade, risco_eletricidade_obs,
    risco_altura, risco_altura_obs,
    risco_inflamaveis, risco_inflamaveis_obs,

    // 5. Insalubridade
    insal_agente, insal_justificativa, insal_epi_fornecido, insal_epi_utilizado,
    responsavelLocal, setor, epiNeutraliza, laudoInsalub, pericOutrosDesc, exposicao, medidasControle,
    laudoPeric, epiFornecimento, relacaoEpis, treinamentoEpi, fichaAssinada, fichaEntrega, fotos, observacoes,

    // Ergonomia
    postura, cargas, cargasPeso, repetitivo, esforco, pausas, pe, ferramentas, apoio, piso, ambiente, protecao,
    ruidoErgo, obstaculos, queda, jornadaPausas, jornadaProlongada, revezamento, tempo, observacoesErgo,

    // Cancelamento
    cancelReason, otherCancelReason,

    // Data/Hora
    dataVistoria, horarioVistoria,

    // Assinaturas (DataURL)
    assinaturaTecnico: assinaturaTecnicoDataUrl,
    assinaturaResponsavel: assinaturaResponsavelDataUrl,
  } = req.body;

  if (!['Concluído', 'Cancelado'].includes(status)) {
    return res.status(400).json({ message: 'Status inválido. Use "Concluído" ou "Cancelado".' });
  }

  // Array helpers: pericClassificacao e atividades
  let pericClassificacao = req.body['pericClassificacao[]'];
  if (pericClassificacao == null) pericClassificacao = req.body.pericClassificacao;
  if (typeof pericClassificacao === 'string') pericClassificacao = [pericClassificacao];
  if (!Array.isArray(pericClassificacao)) pericClassificacao = [];

  let atividades = req.body['atividades[]'];
  if (atividades == null) atividades = req.body.atividades;
  if (typeof atividades === 'string') atividades = [atividades];
  if (!Array.isArray(atividades)) atividades = [];

  // Arquivos vindos via Multer
  const cancelPhotoFile = req.files?.['cancel-photo']?.[0];
  const sigTechFile = req.files?.['signature-tech']?.[0];
  const sigLocalFile = req.files?.['signature-local']?.[0];

  // Datas seguras
  let dataV = dataVistoria ? new Date(dataVistoria) : new Date();
  if (isNaN(dataV.getTime())) dataV = new Date();

  let horaV = (horarioVistoria && /^\d{2}:\d{2}$/.test(horarioVistoria))
    ? horarioVistoria
    : new Date().toTimeString().slice(0, 5);

  try {
    const rota = await Rota.findById(id);
    if (!rota) return res.status(404).json({ message: 'Rota não encontrada.' });

    // Assinaturas: aceitar arquivo OU DataURL
    const assinaturaTecnico =
      sigTechFile
        ? { originalname: sigTechFile.originalname, mimetype: sigTechFile.mimetype, size: sigTechFile.size, buffer: sigTechFile.buffer.toString('base64') }
        : parseDataUrlToFileLike(assinaturaTecnicoDataUrl, 'assinatura-tecnico.png');

    const assinaturaResponsavel =
      sigLocalFile
        ? { originalname: sigLocalFile.originalname, mimetype: sigLocalFile.mimetype, size: sigLocalFile.size, buffer: sigLocalFile.buffer.toString('base64') }
        : parseDataUrlToFileLike(assinaturaResponsavelDataUrl, 'assinatura-responsavel.png');

    const hasTechSig = !!assinaturaTecnico;
    const hasLocalSig = !!assinaturaResponsavel;

    // Regras de obrigatoriedade
    if (status === 'Cancelado') {
      if (!cancelPhotoFile) return res.status(400).json({ message: 'Foto da fachada é obrigatória para cancelamento.' });
      if (!hasTechSig || !hasLocalSig) return res.status(400).json({ message: 'Assinaturas (técnico e responsável) são obrigatórias.' });
    }
    if (status === 'Concluído') {
      if (!hasTechSig || !hasLocalSig) return res.status(400).json({ message: 'Assinaturas (técnico e responsável) são obrigatórias.' });
    }

    // Foto de cancelamento
    let cancelamentoData = null;
    let finalObservacaoCondominio = observacaoCondominio || rota.observacaoCondominio;
    if (status === 'Cancelado') {
      const motivoFinal = cancelReason === 'outro' ? otherCancelReason : cancelReason;
      if (!motivoFinal) return res.status(400).json({ message: 'Motivo do cancelamento é obrigatório.' });

      const fotoFachada = {
        originalname: cancelPhotoFile.originalname,
        mimetype: cancelPhotoFile.mimetype,
        size: cancelPhotoFile.size,
        buffer: cancelPhotoFile.buffer.toString('base64'),
      };
      cancelamentoData = { motivo: motivoFinal, fotoFachada, dataCancelamento: new Date() };
      finalObservacaoCondominio = `Vistoria cancelada. Motivo: ${motivoFinal}. ${observacoes || ''}`;
    }

    // Atualiza rota
    rota.status = status;
    rota.observacaoCondominio = finalObservacaoCondominio;
    rota.cancelamento = status === 'Cancelado' ? cancelamentoData : undefined;
    await rota.save();

    // Fotos (JSON string -> objeto)
    let fotosParsed = fotos;
    try { if (typeof fotos === 'string') fotosParsed = JSON.parse(fotos); } catch (_) {}

    // Cria Vistoria com todos os campos
    const newVistoria = new Vistoria({
      rotaId: rota._id,
      data: dataV,
      horario: horaV,
      status,
      vistoriadorId: req.user.id,
      vistoriadorNome: req.user.name,

      // Copiados da rota
      condominio: rota.condominio,
      endereco: rota.endereco,
      bairro: rota.bairro,
      administradora: rota.administradora,
      cnpj: rota.cnpj,

      // atividades, ambiente, riscos, insalubridade
      atividades,
      atividadesOutrasDesc,
      env_ventilacao, env_iluminacao, env_ordem, env_sinalizacao, env_epc, env_epc_quais,
      risco_biologicos, risco_biologicos_obs,
      risco_quimicos, risco_quimicos_obs,
      risco_ruido, risco_ruido_obs,
      risco_calorfrio, risco_calorfrio_obs,
      risco_radiacoes, risco_radiacoes_obs,
      risco_eletricidade, risco_eletricidade_obs,
      risco_altura, risco_altura_obs,
      risco_inflamaveis, risco_inflamaveis_obs,
      insal_agente, insal_justificativa, insal_epi_fornecido, insal_epi_utilizado,

      // Checklist
      responsavelLocal, setor, epiNeutraliza, laudoInsalub, pericClassificacao, pericOutrosDesc,
      exposicao, medidasControle, laudoPeric, epiFornecimento, relacaoEpis, treinamentoEpi,
      fichaAssinada, fichaEntrega, fotos: fotosParsed, observacoes,

      // Ergonomia
      postura, cargas, cargasPeso, repetitivo, esforco, pausas, pe, ferramentas, apoio, piso,
      ambiente, protecao, ruidoErgo, obstaculos, queda, jornadaPausas, jornadaProlongada, revezamento, tempo, observacoesErgo,

      // Assinaturas
      assinaturas: { tecnico: assinaturaTecnico, responsavel: assinaturaResponsavel },

      // Cancelamento
      cancelamento: cancelamentoData,
    });

    await newVistoria.save();

    res.json({ message: 'Vistoria finalizada e registrada com sucesso!', rota, vistoria: newVistoria });
  } catch (error) {
    console.error('Erro ao atualizar status da rota:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao atualizar status da rota.' });
  }
});

// 21) Tratador de erros do Multer (e similares)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(413).json({ message: `Upload inválido: ${err.code}` });
  }
  if (err && ((err.message || '').includes('Arquivo Excel inválido') || (err.message || '').includes('Tipo de arquivo inválido'))) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

// 22) Start
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse o frontend em http://127.0.0.1:5500/index.html`);
  console.log(`API disponível em http://localhost:${PORT}`);
});
