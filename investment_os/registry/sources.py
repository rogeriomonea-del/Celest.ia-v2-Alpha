"""Registro tipado de fontes oficiais.

Espelha docs/SOURCE_REGISTRY.md. Nenhum adapter pode baixar de URL cujo host não
esteja registrado aqui — isso bloqueia o uso silencioso de fontes não oficiais.
"""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class Source:
    source_id: str
    orgao: str
    tipo_dado: str
    base_url: str
    licenca: str
    frequencia: str
    campo_data_base: str
    validacao: str
    limitacoes: str


SOURCES: dict[str, Source] = {
    s.source_id: s
    for s in [
        Source(
            source_id="cvm_dados_abertos",
            orgao="Comissão de Valores Mobiliários (CVM)",
            tipo_dado="DFP/ITR/cadastro/IPE de companhias abertas",
            base_url="https://dados.cvm.gov.br/dados/CIA_ABERTA/",
            licenca="Dados abertos (uso livre com atribuição)",
            frequencia="diária",
            campo_data_base="DT_REFER / DT_FIM_EXERC / DT_RECEB",
            validacao="CSV latin-1 separado por ';' com colunas documentadas",
            limitacoes="FIIs em dataset separado; plano de contas varia por setor",
        ),
        Source(
            source_id="b3_cotahist",
            orgao="B3 S.A. — Brasil, Bolsa, Balcão",
            tipo_dado="Cotações históricas do mercado a vista (COTAHIST)",
            base_url="https://bvmf.bmfbovespa.com.br/InstDados/SerHist/",
            licenca="Uso pessoal/não comercial conforme termos do site da B3",
            frequencia="anual/mensal/diária (arquivo por período)",
            campo_data_base="DATA DO PREGÃO (posições 3-10)",
            validacao="layout posicional oficial 245 bytes; registros 00/01/99",
            limitacoes="preços NÃO ajustados por proventos",
        ),
        Source(
            source_id="tesouro_transparente",
            orgao="Secretaria do Tesouro Nacional (Tesouro Transparente)",
            tipo_dado="Preços e taxas diárias dos títulos do Tesouro Direto",
            base_url="https://www.tesourotransparente.gov.br/ckan/",
            licenca="Dados abertos",
            frequencia="dias úteis",
            campo_data_base="Data Base",
            validacao="CSV ';' decimal vírgula, datas dd/mm/aaaa, 8 colunas",
            limitacoes=(
                "histórico oficial inicia em 2002; taxas de balcão do Tesouro "
                "Direto (varejo), distintas das indicativas ANBIMA"
            ),
        ),
    ]
}

_ALLOWED_HOSTS = {
    "dados.cvm.gov.br",
    "bvmf.bmfbovespa.com.br",
    "www.tesourotransparente.gov.br",
    "www.rad.cvm.gov.br",
    "web.rad.cvm.gov.br",
}


def assert_official(url: str) -> None:
    """Bloqueia download de host não registrado como oficial."""
    host = urlparse(url).hostname or ""
    if host not in _ALLOWED_HOSTS:
        raise PermissionError(
            f"Host '{host}' não está no registro de fontes oficiais "
            "(docs/SOURCE_REGISTRY.md). Cadastre a fonte antes de usar."
        )
