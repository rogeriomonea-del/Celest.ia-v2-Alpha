# Colocar o celest.ia no ar (Hostinger VPS + domínio)

Resultado final: `https://seudominio.com` servindo o site, com `/api`
proxiado para o motor rodando 24/7 no mesmo VPS — busca real de ponta a ponta.

> **Sobre a chave API da Hostinger:** ela serve para automatizar o *painel*
> (criar VPS, editar DNS via API). O deploy em si usa **SSH**, não a chave.
> Guarde a chave só no seu computador/hPanel — nunca a cole em chats, commits
> ou arquivos do projeto.

> **Sobre GPU/VRAM:** o motor não usa GPU — o que conta é CPU/RAM/rede, e o
> tempo de busca é dominado pelo Firecrawl/sites das companhias. A vantagem
> real do VPS é ficar no ar 24/7 com IP fixo.

## Pré-requisitos

- VPS Hostinger com **Ubuntu 22.04 ou 24.04** (hPanel → VPS → Sistema operacional)
- O IP do VPS (aparece no hPanel) e a senha/SSH de root
- O zip do projeto (celestia-v12.zip ou mais novo)

## Passo 1 — Apontar o domínio para o VPS

hPanel → **Domínios → seudominio.com → DNS / Nameservers**:

| Tipo | Nome | Conteúdo        | TTL  |
|------|------|-----------------|------|
| A    | @    | IP do seu VPS   | 3600 |
| A    | www  | IP do seu VPS   | 3600 |

(Propaga em minutos, às vezes até 1h. O HTTPS do passo 4 depende disso.)

## Passo 2 — Subir o projeto para o VPS

No **seu computador** (Mac/Linux), na pasta onde está o zip:

```bash
scp celestia-v12.zip root@IP_DO_VPS:/root/
```

(Ou use o terminal do navegador no hPanel e o Gerenciador de arquivos.)

## Passo 3 — Instalar tudo com um comando

Entre no VPS e rode:

```bash
ssh root@IP_DO_VPS
cd /root && unzip -o celestia-v12.zip -d celestia && cd celestia
bash deploy/hostinger-setup.sh seudominio.com
```

O script instala Python/Node/nginx, builda o site, registra o serviço
`celestia-api` (systemd) e configura o nginx com o proxy `/api`
(timeout 320s) + HTTPS via Let's Encrypt.

Quer a estratégia de scraping local (Chromium no VPS) também?

```bash
bash deploy/hostinger-setup.sh seudominio.com --with-playwright
```

## Passo 4 — Chaves e reinício

```bash
nano /opt/celestia/.env        # cole suas chaves (Firecrawl, RapidAPI…)
systemctl restart celestia-api
```

## Verificar

```bash
systemctl status celestia-api          # deve estar "active (running)"
curl -s http://127.0.0.1:8000/api/health   # {"ok":true}
journalctl -u celestia-api -f          # progresso das buscas ao vivo
```

Abra `https://seudominio.com` → deve aparecer **"Motor real conectado —
pronto para buscar"**. Clique em Buscar voos e acompanhe os agentes no
`journalctl`.

## Atualizar para uma versão nova

```bash
scp celestia-vNN.zip root@IP_DO_VPS:/root/
ssh root@IP_DO_VPS
cd /root && rm -rf celestia && unzip -o celestia-vNN.zip -d celestia && cd celestia
bash deploy/hostinger-setup.sh seudominio.com
```

O `.env` em `/opt/celestia/.env` é **preservado** entre atualizações.

## Problemas comuns

| Sintoma | Causa provável | Correção |
|---|---|---|
| Site abre mas "Modo demonstração" | motor caiu | `systemctl restart celestia-api` e veja `journalctl -u celestia-api -n 50` |
| Busca real dá erro 504 | busca passou de 300s | aumente `API_SEARCH_TIMEOUT_S` no `.env` (o nginx já aceita até 320s — suba os dois) |
| certbot falhou | DNS ainda não propagou | espere e rode `certbot --nginx -d seudominio.com -d www.seudominio.com` |
| `command not found: unzip` | imagem mínima | `apt-get install -y unzip` |
