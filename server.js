const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/* ================================
1. BANCO DE DADOS
================================ */

const db = new sqlite3.Database('./leads.db', (err) => {
    if (err) console.error('Erro ao abrir banco:', err.message);
    else console.log('📂 Banco de dados conectado!');
});

db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    idade TEXT,
    email TEXT,
    whatsapp TEXT,
    profissao TEXT,
    endereco TEXT,
    mensagem TEXT,
    nome_dependente TEXT,
    parentesco_dependente TEXT,
    idade_dependente TEXT,
    data_envio DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

/* ================================
2. CONFIGURAÇÃO WHATSAPP
================================ */

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('📱 QR CODE GERADO:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp pronto!');
});

client.initialize();

/* ================================
3. RECEBER DADOS DO FORMULÁRIO
================================ */

app.post('/send-whatsapp', async (req, res) => {

    const data = req.body;
    console.log("📥 Dados recebidos:", data);

    const titular = {
        nome: data.name || 'N/A',
        idade: data.age || 'N/A',
        email: data.email || 'N/A',
        whatsapp: data['client-phone'] || 'N/A',
        profissao: data.profession || 'N/A',
        endereco: data.address || 'N/A',
        mensagem: data.message || 'Nenhuma'
    };

    /* ================================
    PROCESSAR DEPENDENTES
    ================================= */

    const nomesDep = data.dependentNames || [];
    const relacoesDep = data.dependentRelations || [];
    const idadesDep = data.dependentAges || [];

    let textoDependentes = "";

    nomesDep.forEach((nome, i) => {
        if (nome && nome.trim() !== "") {

            textoDependentes += `• Nome: ${nome}\n`;
            textoDependentes += `• Parentesco: ${relacoesDep[i] || 'N/A'}\n`;
            textoDependentes += `• Idade: ${idadesDep[i] || 'N/A'}\n\n`;

        }
    });

    const dependentesFinal = textoDependentes || "Nenhum informado";

    /* PRIMEIRO DEPENDENTE PARA COLUNAS */

    const nomeDependente = nomesDep[0] || "N/A";
    const parentescoDependente = relacoesDep[0] || "N/A";
    const idadeDependente = idadesDep[0] || "N/A";

    /* ================================
    MONTAR MENSAGEM
    ================================= */

    const relatorio = `
🚨 NOVA SOLICITAÇÃO DE CADASTRO

👤 Titular

Nome: ${titular.nome}
Idade: ${titular.idade}
WhatsApp: ${titular.whatsapp}
Email: ${titular.email}
Profissão: ${titular.profissao}
Endereço: ${titular.endereco}

👨‍👩‍👧‍👦 Dependentes

${dependentesFinal}

Mensagem:
${titular.mensagem}
`;

    try {

        /* ================================
        SALVAR NO BANCO
        ================================= */

        const sql = `
        INSERT INTO leads
        (nome, idade, email, whatsapp, profissao, endereco, mensagem,
        nome_dependente, parentesco_dependente, idade_dependente)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(sql, [
            titular.nome,
            titular.idade,
            titular.email,
            titular.whatsapp,
            titular.profissao,
            titular.endereco,
            titular.mensagem,
            nomeDependente,
            parentescoDependente,
            idadeDependente,
        ], function(err) {

            if (err) {
                console.error("❌ erro ao salvar:", err.message);
            } else {
                console.log("💾 Lead salvo ID:", this.lastID);
            }

        });

        /* ================================
        ENVIAR PARA EMPRESA
        ================================= */

        const businessId = "5521985123451@c.us";

        await client.sendMessage(businessId, relatorio);

        /* ================================
        ENVIAR CÓPIA PARA CLIENTE
        ================================= */

        let rawPhone = titular.whatsapp.replace(/\D/g, '');

        if (rawPhone.length >= 10) {

            const clientNumber = rawPhone.startsWith('55')
                ? rawPhone
                : `55${rawPhone}`;

            await client.sendMessage(
                `${clientNumber}@c.us`,
                `Olá *${titular.nome}*! Segue cópia dos dados enviados:\n${relatorio}`
            );
        }

        res.json({ success: true });

    } catch (err) {

        console.error("❌ erro:", err.message);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

/* ================================
4. INICIAR SERVIDOR
================================ */

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});