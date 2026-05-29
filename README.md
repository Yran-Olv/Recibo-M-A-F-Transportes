# M.A.F — Espelho de Frete / Viagem

Sistema web para emissão do **Espelho de Frete / Viagem** com layout igual ao documento da M.A.F Transportes: cabeçalho com logo, remetente/destinatário, mercadoria, valores e veículo. Inclui histórico, catálogos, login seguro e impressão A4 (ou PDF pelo navegador).

- **Stack:** Node.js, React, Express, Tailwind
- **Banco:** PostgreSQL no servidor (fora do Docker)
- **App:** pode rodar em Docker apontando para o PostgreSQL do host
- **Auth:** login local, cookie httpOnly, bcrypt (sem APIs externas)

## Início rápido

```bash
cp .env.example .env
# Configure PostgreSQL e SESSION_SECRET
npm install
npm run dev
```

### Erro `ENOSPC` (limite de file watchers no Linux)

O Vite observa arquivos para hot-reload. Se aparecer `System limit for number of file watchers reached`:

**Opção A (recomendada, uma vez no sistema):**
```bash
sudo ./scripts/fix-inotify-limit.sh
npm run dev
```

**Opção B (sem sudo):**
```bash
npm run dev:safe
```

**Opção C (sem hot-reload, recarregue F5 no navegador):**
```bash
npm run dev:no-watch
```

Acesse `http://localhost:3000` — usuário `admin`, senha em `ADMIN_INITIAL_PASSWORD`.

## PostgreSQL no servidor

## Produção (servidor com PostgreSQL + Nginx + Certbot)

Guia: **[docs/DEPLOY-PRODUCAO.md](docs/DEPLOY-PRODUCAO.md)**

**Um script só:**

```bash
cp .env.production.example .env && nano .env
DB_PASS='sua_senha' ./scripts/deploy.sh postgres   # primeira vez
chmod +x scripts/deploy.sh
./scripts/deploy.sh                                 # deploy Docker
# ou: npm run deploy
```

Depois configure Nginx (`scripts/nginx-maf-recibos.conf`) e `certbot --nginx`.

## Campos do espelho

| Seção | Campos |
|-------|--------|
| Empresa | Logo, razão social, fone, e-mail, CNPJ, IE, endereço, CEP |
| Documento | Número sequencial, data |
| Partes | Remetente e destinatário (endereço, cidade, UF, CPF/CNPJ) |
| Obs. | Texto livre ou NF automática |
| Mercadoria | Doc. fiscal, produto, quantidade, peso, valor |
| Valores | ICMS, seguro, outros, total (calculado) |
| Veículo | Motorista, CPF, placa, UF, fatura, agente |

## Funcionalidades

- Pré-visualização ao vivo enquanto preenche
- Numeração automática (484, 485…)
- Histórico: imprimir, duplicar, excluir
- Catálogos com cadastro e exclusão
- Conta: alterar senha; admin cria usuários
- Modelo em branco para impressão manual
