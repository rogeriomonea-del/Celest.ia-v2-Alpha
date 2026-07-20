#!/usr/bin/env bash
# ==========================================================================
# celest.ia — instalação completa num VPS Ubuntu/Debian (Hostinger VPS etc.)
#
# Uso (dentro da pasta do projeto descompactada, como root):
#   bash deploy/hostinger-setup.sh seudominio.com
#   bash deploy/hostinger-setup.sh seudominio.com --with-playwright
#
# O que faz:
#   1. instala Python, Node 20 e nginx
#   2. copia o projeto para /opt/celestia (preservando o .env em updates)
#   3. cria o venv e instala as dependências do motor
#   4. builda o site (celestia_dashboard/dist)
#   5. registra o serviço systemd celestia-api (uvicorn na porta 8000)
#   6. configura o nginx: site estático + proxy /api (timeout 320s)
#   7. tenta emitir HTTPS com certbot (Let's Encrypt)
#
# Para ATUALIZAR depois: suba o zip novo, descompacte e rode o script de novo
# com o mesmo domínio — o .env existente é preservado.
# ==========================================================================
set -euo pipefail

DOMAIN="${1:?uso: bash deploy/hostinger-setup.sh seudominio.com [--with-playwright]}"
WITH_PLAYWRIGHT="${2:-}"
APP_DIR=/opt/celestia

if [ ! -f celestia_engine/__main__.py ] && [ ! -d celestia_engine ]; then
  echo "ERRO: rode este script na RAIZ do projeto (onde está a pasta celestia_engine/)."
  exit 1
fi

echo "==> 1/7 Pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv python3-pip nginx unzip curl rsync

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]; then
  echo "==> Node 20 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> 2/7 Copiando projeto para $APP_DIR (preserva .env)"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude 'data' \
  ./ "$APP_DIR/"
cd "$APP_DIR"

echo "==> 3/7 Motor Python (venv)"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q
if [ ! -f .env ]; then
  cp .env.example .env
  echo "AVISO: criei $APP_DIR/.env a partir do exemplo — PREENCHA SUAS CHAVES nele."
fi
if [ "$WITH_PLAYWRIGHT" = "--with-playwright" ]; then
  echo "==> Chromium do Playwright (estratégia playwright_local)"
  .venv/bin/python -m playwright install --with-deps chromium
fi

echo "==> 4/7 Build do site"
cd celestia_dashboard
npm install --no-audit --no-fund
npm run build
cd "$APP_DIR"

echo "==> 5/7 Serviço systemd (celestia-api)"
cat > /etc/systemd/system/celestia-api.service <<UNIT
[Unit]
Description=celest.ia API (motor multi-agente)
After=network.target

[Service]
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/.venv/bin/python -m celestia_engine serve --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now celestia-api
systemctl restart celestia-api

echo "==> 6/7 nginx"
cat > /etc/nginx/sites-available/celestia <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root $APP_DIR/celestia_dashboard/dist;
    index index.html;

    # A ponte: /api vai para o motor. Timeout > API_SEARCH_TIMEOUT_S (300s),
    # senão o nginx corta a busca real antes de o motor terminar.
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 320s;
        proxy_connect_timeout 10s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/celestia /etc/nginx/sites-enabled/celestia
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> 7/7 HTTPS (Let's Encrypt)"
apt-get install -y certbot python3-certbot-nginx
if certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect; then
  echo "HTTPS emitido."
else
  echo "AVISO: certbot falhou (o DNS do domínio já aponta para este VPS?)."
  echo "Depois de ajustar o DNS, rode: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

echo
echo "======================================================================"
echo " Pronto! Checklist final:"
echo "   1. Preencha as chaves em:  $APP_DIR/.env"
echo "   2. Reinicie o motor:       systemctl restart celestia-api"
echo "   3. Logs ao vivo:           journalctl -u celestia-api -f"
echo "   4. Teste:                  curl -s http://127.0.0.1:8000/api/health"
echo "   5. Site:                   https://$DOMAIN"
echo "======================================================================"
