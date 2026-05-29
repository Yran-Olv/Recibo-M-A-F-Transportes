# Deploy em produção — M.A.F Espelho de Frete

Tudo passa por **um único script**: `scripts/deploy.sh`

| Componente | Onde |
|------------|------|
| PostgreSQL | Servidor Linux (`127.0.0.1:5432`) |
| App Node | Docker (padrão) ou systemd |
| HTTPS | Nginx + Certbot no servidor |

A app escuta só em **localhost** (padrão porta **3010**). O Nginx faz o proxy público.

---

## Comandos do script

```bash
chmod +x scripts/deploy.sh

./scripts/deploy.sh help          # ajuda
./scripts/deploy.sh postgres      # criar banco (precisa DB_PASS)
./scripts/deploy.sh init-db       # só tabelas
./scripts/deploy.sh               # deploy completo Docker
./scripts/deploy.sh systemd       # deploy sem Docker
./scripts/deploy.sh check-port    # testar porta 3010
./scripts/deploy.sh check-port 3011
```

Ou via npm: `npm run deploy`

---

## Passo a passo no servidor

### 1. Configurar `.env`

```bash
cp .env.production.example .env
nano .env
```

Obrigatório: `SESSION_SECRET` (`openssl rand -hex 32`), `PGPASSWORD`, `ADMIN_INITIAL_PASSWORD`, `MAF_HOST_PORT=3010`.

Docker:

```env
PGHOST=host.docker.internal
HOST=0.0.0.0
```

Systemd:

```env
PGHOST=127.0.0.1
HOST=127.0.0.1
PORT=3010
```

### 2. PostgreSQL (primeira vez)

```bash
DB_PASS='SUA_SENHA_FORTE' ./scripts/deploy.sh postgres
```

Coloque a mesma senha em `PGPASSWORD` no `.env`.

### 3. Deploy da aplicação

```bash
npm ci
./scripts/deploy.sh
```

### 4. Nginx + Certbot

1. Edite `scripts/nginx-maf-recibos.conf` (`server_name` e porta `3010` no `upstream`).
2. `sudo cp scripts/nginx-maf-recibos.conf /etc/nginx/sites-available/maf-recibos`
3. `sudo ln -sf /etc/nginx/sites-available/maf-recibos /etc/nginx/sites-enabled/`
4. `sudo nginx -t && sudo systemctl reload nginx`
5. `sudo certbot --nginx -d seu.dominio.com.br`

### 5. Testar

```bash
curl -s http://127.0.0.1:3010/api/health
curl -s https://seu.dominio.com.br/api/health
```

---

## Portas

| Uso | Porta padrão |
|-----|----------------|
| PostgreSQL (servidor) | 5432 |
| App (localhost) | **3010** (`MAF_HOST_PORT`) |
| Nginx | 80 / 443 |

Evite usar 3000 em produção se já houver outro serviço.

---

## Atualizar versão

```bash
git pull
./scripts/deploy.sh          # Docker
# ou
./scripts/deploy.sh systemd
```

---

## Desenvolvimento local

- `docker compose up -d` — só Postgres dev na porta **5434**
- `npm run dev` — app na **3000**
