const mongoose = require('mongoose');

/** Arquivo-like (assinaturas e foto de cancelamento) */
const fileLikeSchema = new mongoose.Schema({
  originalname: { type: String },
  mimetype: { type: String },
  size: { type: Number },
  buffer: { type: String }, // base64
}, { _id: false });

/** Assinaturas (técnico / responsável) */
const assinaturaSchema = new mongoose.Schema({
  tecnico: { type: fileLikeSchema, default: undefined },
  responsavel: { type: fileLikeSchema, default: undefined },
}, { _id: false });

/** Fotos por setor (DataURLs) */
const fotosSetoresSchema = new mongoose.Schema({
  portaria:   { type: [String], default: [] },
  lixo:       { type: [String], default: [] },
  maquinario: { type: [String], default: [] },
  copa:       { type: [String], default: [] },
  epi:        { type: [String], default: [] } 
}, { _id: false });

/** Cancelamento */
const cancelamentoSchema = new mongoose.Schema({
  motivo: { type: String },
  fotoFachada: { type: fileLikeSchema, default: undefined },
  dataCancelamento: { type: Date }
}, { _id: false });

/** Vistoria */
const vistoriaSchema = new mongoose.Schema({
  // Relacionamento / metadados
  rotaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rota', required: true },
  data: { type: Date, required: true },
  horario: { type: String, required: true },
  status: { type: String, enum: ['Concluído', 'Cancelado'], required: true },
  vistoriadorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  vistoriadorNome: { type: String, required: true },

  // Snapshot do condomínio
  condominio: { type: String, required: true },
  endereco: { type: String, required: true },
  bairro: { type: String, required: true },
  administradora: { type: String, required: true },
  cnpj: { type: String, required: true },
  responsavelLocal: { type: String, default: '' },
  setor: { type: String, default: '' },

  // 2) ATIVIDADES OBSERVADAS
  atividades: { type: [String], default: [] },       // ex.: ["limpeza_geral","jardinagem","...","outras"]
  atividadesOutrasDesc: { type: String, default: '' },


  // 3) CONDIÇÕES DO AMBIENTE
  env_ventilacao: { type: String, default: '' },     // "adequada" | "inadequada"
  env_iluminacao: { type: String, default: '' },     // "adequada" | "inadequada"
  env_ordem: { type: String, default: '' },          // "satisfatoria" | "precaria"
  env_sinalizacao: { type: String, default: '' },    // "presente" | "ausente"
  env_epc: { type: String, default: '' },            // "sim" | "nao"
  env_epc_quais: { type: String, default: '' },

  // 4) RISCOS IDENTIFICADOS
  risco_biologicos: { type: String, default: '' },
  risco_biologicos_obs: { type: String, default: '' },

  risco_quimicos: { type: String, default: '' },
  risco_quimicos_obs: { type: String, default: '' },

  risco_ruido: { type: String, default: '' },
  risco_ruido_obs: { type: String, default: '' },

  risco_calorfrio: { type: String, default: '' },
  risco_calorfrio_obs: { type: String, default: '' },

  risco_radiacoes: { type: String, default: '' },
  risco_radiacoes_obs: { type: String, default: '' },

  risco_eletricidade: { type: String, default: '' },
  risco_eletricidade_obs: { type: String, default: '' },

  risco_altura: { type: String, default: '' },
  risco_altura_obs: { type: String, default: '' },

  risco_inflamaveis: { type: String, default: '' },
  risco_inflamaveis_obs: { type: String, default: '' },

  // 5) INSALUBRIDADE
  insal_agente: { type: String, default: '' },
  insal_justificativa: { type: String, default: '' },
  insal_epi_fornecido: { type: String, default: '' }, // "sim" | "nao"
  insal_epi_utilizado: { type: String, default: '' }, // "sim" | "nao"
  epiNeutraliza: { type: String, default: '' }, // "sim" | "nao"
  laudoInsalub: { type: String, default: '' },  // "sim" | "nao"


  // 6) PERICULOSIDADE (NR-16)
  pericClassificacao: [{ type: String }],      // ["eletricidade","inflamaveis","explosivos","outros"]
  pericOutrosDesc: { type: String, default: '' },
  exposicao: { type: String, default: '' },    // "sim" | "nao"
  medidasControle: { type: String, default: '' },
  laudoPeric: { type: String, default: '' },   // "sim" | "nao"

  // 7) EPI / Treinamento / Documentação
  epiFornecimento: { type: String, default: '' },  // "sim" | "nao"
  relacaoEpis: { type: String, default: '' },
  treinamentoEpi: { type: String, default: '' },   // "sim" | "nao"
  fichaAssinada: { type: String, default: '' },    // "sim" | "nao"
  fichaEntrega: { type: String, default: '' },     // "sim" | "nao"

  // Fotos setorizadas (DataURL)
  fotos: { type: fotosSetoresSchema, default: () => ({}) },

  // Observações gerais (técnico)
  observacoes: { type: String, default: '' },

  // Checklist Ergonômico
  postura: { type: String, default: '' },
  cargas: { type: String, default: '' },
  cargasPeso: { type: String, default: '' },
  repetitivo: { type: String, default: '' },
  esforco: { type: String, default: '' },
  pausas: { type: String, default: '' },
  pe: { type: String, default: '' },
  ferramentas: { type: String, default: '' },
  apoio: { type: String, default: '' },
  piso: { type: String, default: '' },
  ambiente: { type: String, default: '' },
  protecao: { type: String, default: '' },
  ruidoErgo: { type: String, default: '' },
  obstaculos: { type: String, default: '' },
  queda: { type: String, default: '' },
  jornadaPausas: { type: String, default: '' },
  jornadaProlongada: { type: String, default: '' },
  revezamento: { type: String, default: '' },
  tempo: { type: String, default: '' },
  observacoesErgo: { type: String, default: '' },

  // Assinaturas
  assinaturas: { type: assinaturaSchema, default: undefined },

  // Cancelamento
  cancelamento: { type: cancelamentoSchema, default: undefined },

  // PDF (se usar algum storage/ID)
  relatorioPdfId: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Vistoria', vistoriaSchema);
