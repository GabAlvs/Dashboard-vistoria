   const mongoose = require('mongoose');

   const usuarioSchema = new mongoose.Schema({
       username: { type: String, required: true, unique: true },
       passwordHash: { type: String, required: true },
       name: { type: String, required: true },
       role: { type: String, enum: ['vistoriador', 'gestor_rotas', 'visualizador_vistorias'], required: true },
       email: { type: String, required: true, unique: true }
   });

   module.exports = mongoose.model('Usuario', usuarioSchema);
   