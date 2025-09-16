const mongoose = require('mongoose');

const rotaSchema = new mongoose.Schema({
    condominio: { type: String, required: true },
    endereco: { type: String, required: true },
    bairro: { type: String, required: true },
    administradora: { type: String, required: true },
    cnpj: { type: String, required: true },
    vistoriadorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    vistoriadorNome: { type: String, required: true },
    data: { type: Date, required: true },
    status: { type: String, enum: ['Pendente', 'Em Andamento', 'Concluído', 'Cancelado'], default: 'Pendente' },
    observacaoCondominio: { type: String },
    relatorioPdfId: { type: String }
});

module.exports = mongoose.model('Rota', rotaSchema);

   