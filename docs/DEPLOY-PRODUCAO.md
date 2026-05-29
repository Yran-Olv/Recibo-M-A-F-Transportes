# Deploy em produção — M.A.F Espelho de Frete

Pasta padrão no servidor: **`/var/www/maf-recibos`**

| Componente | Onde |
|------------|------|
| Código | `/var/www/maf-recibos` |
| PostgreSQL | Servidor Linux `127.0.0.1:5432` |
| App | Docker (padrão), porta **3010** só em localhost |
| HTTPS | Nginx + Certbot |

---

## Instalação (servidor novo)

**Não rode comandos em `/var/www` solto** — o projeto precisa estar clonado em `/var/www/maf-recibos`.

### Opção A — um comando (recomendado)

Conecte por SSH e execute:

```bash
cd /var/www
sudo curl -fsSL https://raw.githubusercontent.com/Yran-Olv/Recibo-M-A-F-Transportes/main/scripts/bootstrap-production.sh -o bootstrap-maf.sh
sudo DB_PASS='SUA_SENHA_POSTGRES' ADMIN_INITIAL_PASSWORD='SUA_SENHA_ADMIN' bash bootstrap-maf.sh
```

O script instala Git, Node 20, Docker, clona o repositório, cria `.env`, banco PostgreSQL, tabelas e sobe o container.

### Opção B — clone manual

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/Yran-Olv/Recibo-M-A-F-Transportes.git maf-recibos
cd maf-recibos
sudo chmod +x install.sh scripts/*.sh
sudo DB_PASS='SUA_SENHA_POSTGRES' ADMIN_INITIAL_PASSWORD='SUA_SENHA_ADMIN' ./install.sh
```

### Opção C — já clonou o repo

```bash
cd /var/www/maf-recibos
sudo ./install.sh
```

Interativo (pede senhas no terminal):

```bash
cd /var/www/maf-recibos
sudo ./install.sh
```

---

## Testar

```bash
curl -s http://127.0.0.1:3010/api/health
```

Login: usuário **`admin`**, senha em `ADMIN_INITIAL_PASSWORD` no `.env`.

---

## Nginx + Certbot

1. Edite `scripts/nginx-maf-recibos.conf` (`server_name` e porta `3010`).
2. `sudo cp scripts/nginx-maf-recibos.conf /etc/nginx/sites-available/maf-recibos`
3. `sudo ln -sf /etc/nginx/sites-available/maf-recibos /etc/nginx/sites-enabled/`
4. `sudo nginx -t && sudo systemctl reload nginx`
5. `sudo certbot --nginx -d seu.dominio.com.br`

---

## Comandos úteis (sempre dentro de `/var/www/maf-recibos`)

```bash
cd /var/www/maf-recibos

./install.sh              # reinstall + deploy completo
./scripts/deploy.sh help
./scripts/deploy.sh       # só redeploy Docker
./scripts/deploy.sh systemd
docker compose -f docker-compose.prod.yml logs -f
```

Atualizar versão:

```bash
cd /var/www/maf-recibos
sudo git pull
sudo ./install.sh
```

---

## Portas

| Uso | Porta |
|-----|--------|
| PostgreSQL | 5432 |
| App (localhost) | **3010** |
| Nginx | 80 / 443 |

---

## Erros comuns

| Erro | Causa | Solução |
|------|--------|---------|
| `scripts/deploy.sh: No such file` | Você está em `/var/www` sem o projeto | Use **Opção A** ou `cd /var/www/maf-recibos` |
| `npm ci` sem `package-lock.json` | Pasta errada ou cópia incompleta | `git clone` completo, não copie arquivos soltos |
| Porta 3010 em uso | Outro serviço | `MAF_HOST_PORT=3011` no `.env` |

---

## Desenvolvimento local

Não use `install.sh` no PC de desenvolvimento. Use `cp .env.example .env`, `docker compose up -d`, `npm run dev`.
