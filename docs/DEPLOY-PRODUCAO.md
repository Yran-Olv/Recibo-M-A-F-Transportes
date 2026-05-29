# Deploy em produção — M.A.F

**Um único script:** `install.sh` na raiz do projeto.

Pasta padrão: `/var/www/maf-recibos`

---

## Instalação completa (um comando)

```bash
cd /var/www/maf-recibos
sudo git pull
sudo chmod +x install.sh
sudo ./install.sh
```

O script faz tudo:

1. Instala dependências (Node, Docker, PostgreSQL, Nginx, Certbot)
2. Escolhe porta livre para a app (3010–3019)
3. Cria `.env` e gera `SESSION_SECRET`
4. Cria banco PostgreSQL e tabelas
5. Sobe a aplicação em Docker
6. Configura Nginx para o domínio
7. Emite certificado HTTPS com Certbot

---

## Sem perguntas (recomendado no servidor)

```bash
cd /var/www/maf-recibos
sudo DOMAIN=recibos.seudominio.com.br \
     CERTBOT_EMAIL=admin@seudominio.com.br \
     DB_PASS='senha_postgres_forte' \
     ADMIN_INITIAL_PASSWORD='senha_admin' \
     ./install.sh
```

O domínio precisa apontar (DNS A) para o IP do servidor e a porta **80** estar aberta no firewall antes do Certbot.

## Perguntas no terminal (já tem `.env`)

```bash
sudo ./install.sh --reconfigure
# ou, se não aparecer pergunta:
sudo -t ./install.sh --reconfigure
```

Enter mantém o valor atual; digite um valor novo para alterar.

---

## Primeira vez (ainda sem o código)

```bash
cd /var/www
sudo curl -fsSL https://raw.githubusercontent.com/Yran-Olv/Recibo-M-A-F-Transportes/main/install.sh -o install-maf.sh
sudo DOMAIN=recibos.seudominio.com.br \
     CERTBOT_EMAIL=admin@email.com \
     DB_PASS='senha_pg' \
     ADMIN_INITIAL_PASSWORD='senha_admin' \
     bash install-maf.sh
```

Isso clona em `/var/www/maf-recibos` e executa a instalação.

---

## Variáveis opcionais

| Variável | Descrição |
|----------|-----------|
| `DOMAIN` | Domínio público |
| `CERTBOT_EMAIL` | E-mail Let's Encrypt |
| `DB_PASS` | Senha PostgreSQL |
| `ADMIN_INITIAL_PASSWORD` | Senha do login `admin` |
| `MAF_HOST_PORT` | Forçar porta da app (senão escolhe 3010+) |
| `SKIP_NGINX=1` | Não configura Nginx |
| `SKIP_CERTBOT=1` | Só HTTP, sem HTTPS |

---

## Atualizar versão

```bash
cd /var/www/maf-recibos
sudo git pull
sudo ./install.sh
```

---

## Desenvolvimento local

Use `npm run dev` — **não** use `install.sh` no PC de desenvolvimento.
