-- Referência do schema. Em produção use: sudo ./install.sh  ou  npm run db:init
-- (tabelas criadas como maf_user — não rode este arquivo como usuário postgres)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_profile (
    id SERIAL PRIMARY KEY,
    nome_empresa VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    cnpj VARCHAR(50) NOT NULL,
    inscricao_estadual VARCHAR(50),
    endereco TEXT NOT NULL,
    telefone VARCHAR(50),
    email VARCHAR(255),
    cep VARCHAR(20),
    logo_base64 TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS senders (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) UNIQUE NOT NULL,
    endereco TEXT,
    cidade VARCHAR(100),
    estado VARCHAR(50),
    cnpj_cpf VARCHAR(50),
    inscricao_estadual VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS recipients (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) UNIQUE NOT NULL,
    endereco TEXT,
    cidade VARCHAR(100),
    estado VARCHAR(50),
    cnpj_cpf VARCHAR(50),
    inscricao_estadual VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    placa VARCHAR(50) UNIQUE NOT NULL,
    cidade VARCHAR(100),
    estado VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS agentes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS faturas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) UNIQUE NOT NULL,
    cpf VARCHAR(50),
    telefone VARCHAR(50),
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    agente_id INTEGER REFERENCES agentes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    numero_recibo VARCHAR(50) UNIQUE NOT NULL,
    data_recibo DATE NOT NULL,
    has_qrcode BOOLEAN DEFAULT FALSE,
    has_signature BOOLEAN DEFAULT FALSE,
    is_blank BOOLEAN DEFAULT FALSE,
    remetente_nome VARCHAR(255),
    remetente_endereco TEXT,
    remetente_cidade VARCHAR(100),
    remetente_estado VARCHAR(50),
    remetente_cnpj_cpf VARCHAR(50),
    remetente_inscricao_estadual VARCHAR(50),
    destinatario_nome VARCHAR(255),
    destinatario_endereco TEXT,
    destinatario_cidade VARCHAR(100),
    destinatario_estado VARCHAR(50),
    destinatario_cnpj_cpf VARCHAR(50),
    destinatario_inscricao_estadual VARCHAR(50),
    mercadoria_natureza VARCHAR(255),
    mercadoria_documento_fiscal VARCHAR(100),
    mercadoria_nota_fiscal VARCHAR(100),
    mercadoria_valor DECIMAL(12,2),
    mercadoria_quantidade DECIMAL(12,3),
    mercadoria_peso DECIMAL(12,3),
    mercadoria_unidade VARCHAR(50),
    valor_seguro DECIMAL(12,2),
    valor_icms DECIMAL(12,2),
    valor_outros DECIMAL(12,2),
    valor_total_frete DECIMAL(12,2),
    observacoes TEXT,
    motorista_nome VARCHAR(255),
    motorista_cpf VARCHAR(50),
    motorista_telefone VARCHAR(50),
    veiculo_placa VARCHAR(50),
    veiculo_cidade VARCHAR(100),
    veiculo_estado VARCHAR(50),
    fatura_nome VARCHAR(255),
    agente_nome VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipts_numero ON receipts(numero_recibo);
CREATE INDEX IF NOT EXISTS idx_receipts_data ON receipts(data_recibo);
CREATE INDEX IF NOT EXISTS idx_senders_nome ON senders(nome);
CREATE INDEX IF NOT EXISTS idx_recipients_nome ON recipients(nome);

INSERT INTO company_profile (id, nome_empresa, nome_fantasia, cnpj, inscricao_estadual, endereco, telefone)
VALUES (1, '', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;
