const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config(); // Para carregar MONGODB_URI

// Importa o modelo de usuário
const Usuario = require('./models/Usuario');

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/condomed';
const commonPassword = 'Condomed@123'; // Senha padrão
const usersToInsert = [
     { username: 'Condomed.bruno', name: 'Bruno', role: 'gestor_rotas', email: 'bruno@condomed.com' },
     { username: 'Condomed.maicon', name: 'Maicon', role: 'gestor_rotas', email: 'maicon@condomed.com' },
     { username: 'Condomed.henrique', name: 'Henrique', role: 'vistoriador', email: 'henrique@condomed.com' },
     { username: 'Condomed.pablo', name: 'Pablo', role: 'vistoriador', email: 'pablo@condomed.com' },
     { username: 'Condomed.pedro', name: 'Pedro', role: 'visualizador_vistorias', email: 'pedro@condomed.com' },
     { username: 'Condomed.thyago', name: 'Thyago', role: 'vistoriador', email: 'thyago@condomed.com' },
     { username: 'Condomed.carol',  name: 'Carol',  role: 'visualizador_vistorias', email: 'carol@condomed.com' }
];


async function insertInitialUsers() {
    try {
        await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Conectado ao MongoDB para inserção de usuários.');

        for (const userData of usersToInsert) {
            const existingUser = await Usuario.findOne({ username: userData.username });
            if (existingUser) {
                console.log(`Usuário ${userData.username} já existe. Pulando.`);
                continue;
            }

            const passwordHash = await bcrypt.hash(commonPassword, 10);
            const newUser = new Usuario({
                username: userData.username,
                passwordHash: passwordHash,
                name: userData.name,
                role: userData.role,
                email: userData.email
            });

            await newUser.save();
            console.log(`Usuário ${userData.username} (${userData.role}) inserido com sucesso!`);
        }

        console.log('Processo de inserção de usuários concluído.');
    } catch (error) {
        console.error('Erro ao inserir usuários:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Conexão com MongoDB fechada.');
    }
}

insertInitialUsers();
