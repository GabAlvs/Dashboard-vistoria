O sistema Condomed é uma solução web voltada para gestão de rotas, vistorias técnicas ocupacionais e controle da segurança do trabalho em condomínios. Este ambiente oferece funcionalidades completas para administradores, vistoriadores e visualizadores, desde o cadastro e auditoria de usuários até geração de relatórios PDF das inspeções técnicas

Funcionalidades Principais
Gestão de Usuários: Cadastro de gestores, vistoriadores e visualizadores, incluindo autenticação via JWT e atribuição de perfis específicos.

Gestão de Rotas: Controle de rotas/vistorias por condomínio, bairro, administradora e status (pendente, em andamento, concluído ou cancelado). Permite importação de rotas via Excel.

Vistoria Técnica: Formulário completo para coleta de dados da vistoria, observação de condições do ambiente, riscos, insalubridade, periculosidade e ergonomia. Integra registro de fotos por setor e assinaturas digitais.

Relatórios PDF: Geração automatizada de relatórios customizados via Playwright e Handlebars, utilizando templates HTML. Inclui fotos, checklist, ergonomia e assinaturas.

Dashboard e Filtragem: Interfaces de dashboard para gestores e vistoriadores, com resumos, filtros por bairro, data, administradora, visualização de progresso e status das vistorias.

Importação/Exportação: Upload de planilhas Excel para cadastrar rotas de vistoria em lote.

Segurança: Autenticação JWT, upload seguro de arquivos (Multer), validação de permissões de acesso por perfil.

Ambiente Node.js: Backend robusto com Express, MongoDB (via Mongoose), integração com serviços de arquivos estáticos e geração de PDF.

Ergonomia no Trabalho: Checklist ergonomia detalhado para avaliação da postura, ambiente e jornada de trabalho dos colaboradores.

Estrutura de Diretórios e Principais Arquivos

server.js -	Servidor Express, autenticação JWT, rotas REST, geração de PDF, integração com MongoDB
models/Usuario.js -	Modelo de Usuário, com perfis, login e senha criptografada
models/Rota.js -	Modelo de Rotas, relacionando condomínios, vistoriadores e status
models/Vistoria.js -	Modelo de Vistoria técnica completa, incluindo checklist, assinaturas e fotos
dashboard-gestor.html / dashboard-vistoriador.html -	Frontend dos dashboards com visualização e filtragem das rotas/vistorias
vistoria.html -	Formulário detalhado de vistoria para coleta digital de dados e imagens
report-template.html -	Template HTML do relatório PDF gerado pelas vistorias
insertUsers.js -	Script para cadastro inicial de usuários e integração com MongoDB
package.json / package-lock.json -	Dependências: Express, Mongoose, Multer, PDFKit, Playwright, Handlebars, etc.
file.env -	Chave de segurança JWT_SECRET


Instalação Rápida
Pré-requisitos: Node.js (>=16), MongoDB.


Dependências Principais
Express: Servidor HTTP e APIs REST.

Mongoose: Modelagem e integração MongoDB.

JWT: Autenticação segura via tokens.

Multer: Manipulação de uploads de arquivos (fotos, assinaturas, Excel).

PDFKit & Playwright: Geração de PDFs de vistorias de alta qualidade.

Handlebars: Templates dinâmicos HTML e para relatórios PDF.

XLSX: Importação de rotas via planilhas Excel.

bcryptjs: Criptografia de senhas.



Referências dos Perfis de Usuário
gestor_rotas: Gerencia rotas, cadastro, importação e controle geral.

vistoriador: Realiza vistorias, coleta digital e registro fotográfico, gera relatório.

visualizador_vistorias: Consulta relatórios, vistorias concluídas e status globais.

Observação
Este sistema foi desenvolvido para garantir máxima segurança nas operações, rastreabilidade documental das inspeções técnicas e ergonomia do trabalhador, com foco no contexto condominial brasileiro