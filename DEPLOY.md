# Deploy — api.minhasfotos.net

## Setup único (fazer só uma vez)

### 1. Salvar a chave SSH privada

```bash
nano ~/.ssh/hostinger_deploy
# cole a chave privada e salve
chmod 600 ~/.ssh/hostinger_deploy
```

A chave pública já está cadastrada no **hPanel → SSH Access**.

### 2. Exportar o token da API Hostinger

Adicione no `~/.zshrc`:

```bash
export HOSTINGER_API_TOKEN="seu-token-aqui"
```

O token está em: **hPanel → Developer tools → API Tokens**.
É o mesmo que o secret `HOSTINGER_API_TOKEN` do GitHub.

---

## Deploy do dia a dia — 1 comando

```bash
cd /Users/nathalialayane/Desktop/Festa/backend
./scripts/deploy.sh
```

O script faz tudo:
1. Compila TypeScript → `dist/`
2. Empacota em `.zip` (sem node_modules)
3. Sobe via SFTP (porta 65002)
4. Triggra o build na Hostinger (instala deps + inicia app com `dist/index.js`)
5. Aguarda e exibe o health check

---

## O que funciona e o que não funciona

| Método | Status | Motivo |
|---|---|---|
| SFTP porta 65002 (local) | ✅ | Chave SSH cadastrada no hPanel |
| Build API `/nodejs/builds` | ✅ | Funciona |
| Restart API `/nodejs/restart` | ✅ | Funciona |
| SSH porta 65002 (GitHub Actions) | ❌ | Hostinger bloqueia IPs de CI/CD |
| FTP porta 21 (GitHub Actions) | ❌ | Idem |
| API `/files/upload-urls` | ❌ | Bug da Hostinger (retorna 500) |

---

## Infra

| Item | Valor |
|---|---|
| Servidor | `srv542.hstgr.io` |
| Usuário | `u384431467` |
| Porta SSH/SFTP | `65002` |
| App path | `/home/u384431467/domains/api.minhasfotos.net/public_html` |
| Entry point | `dist/index.js` (TypeScript compilado) |
| DB | MySQL `u384431467_db_remember` em `srv542.hstgr.io:3306` |

## Estrutura do build

- TypeScript fonte em `src/`
- Compilado para `dist/` via `npx tsc`
- `dist/` é incluído no zip e deployado
- `tsx` fica em `dependencies` (usado em dev, não em produção)
