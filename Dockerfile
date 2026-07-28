# Investment Intelligence OS — backend (API + pipeline)
#
# Build:  docker build -t iios-backend .
# API:    docker run --rm -p 8000:8000 -v ./data:/app/data --env-file .env iios-backend
# Dados:  docker run --rm -v ./data:/app/data iios-backend python -m investment_os.cli all
#
# O volume em /app/data persiste bronze/silver/gold e o portfolio.db (Fase 5).
# A imagem já carrega os artefatos gold versionados no repositório como base;
# rode o pipeline (cli all) para dados D-1 completos (Tesouro, CVM, B3, BCB).

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY investment_os ./investment_os
COPY docs ./docs
COPY data ./data

EXPOSE 8000

CMD ["uvicorn", "investment_os.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
