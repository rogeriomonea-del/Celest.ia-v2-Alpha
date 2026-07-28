# Registro de Fontes Oficiais

Espelhado em código em `investment_os/registry/sources.py`. Nenhuma fonte fora
deste registro pode ser usada silenciosamente. Agregadores de mercado NÃO são
fonte primária. Consenso de analistas: indisponível (nenhuma fonte licenciada
configurada).

## Fontes integradas no MVP

### CVM — Portal de Dados Abertos (companhias abertas)
- Órgão: Comissão de Valores Mobiliários. Licença: dados abertos (ODbL-like, uso livre com atribuição).
- Acesso: HTTPS, arquivos ZIP/CSV. Sem autenticação. Frequência: diária (DFP/ITR conforme protocolo).
- DFP: https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_{YYYY}.zip
- ITR: https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_{YYYY}.zip
- Cadastro: https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv
- IPE (documentos eventuais/periódicos): https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{YYYY}.zip
- Campos de data: `DT_REFER` (data-base contábil), `DT_FIM_EXERC`/`DT_INI_EXERC`
  (período), `DT_RECEB` (recepção pela CVM = proxy da data de conhecimento público),
  `VERSAO` (reapresentações: versão maior substitui, ambas preservadas em bronze).
- Validação: encoding latin-1, separador `;`, escala em `ESCALA_MOEDA` (MIL = R$ mil).
- Limitações: DFP/ITR seguem taxonomia própria (CD_CONTA); plano de contas varia
  entre setores (bancos ≠ não financeiras); FIIs NÃO estão neste dataset.

### B3 — Cotações históricas (COTAHIST)
- Órgão: B3 S.A. Licença: uso pessoal/não comercial conforme termos do site.
- Acesso: HTTPS, ZIP com arquivo posicional (layout oficial COTAHIST).
- Anual: https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{YYYY}.ZIP
- Campos: data do pregão, código de negociação, códigos BDI/TPMERC, preços
  abertura/máx/mín/fechamento, volume, negócios, fator de cotação.
- ATENÇÃO: preços NÃO ajustados por proventos. Retorno total exige ajuste por
  eventos corporativos (não implementado no MVP — indicado como limitação em
  qualquer análise de retorno).
- Validação: layout posicional de 245 bytes/linha, registro 00/01/99.

### Tesouro Nacional — Tesouro Direto (preços e taxas)
- Órgão: Secretaria do Tesouro Nacional (Tesouro Transparente / CKAN).
- Licença: dados abertos.
- CSV oficial: https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv
- Campos: Tipo Titulo; Data Vencimento; Data Base; Taxa Compra Manha; Taxa Venda
  Manha; PU Compra Manha; PU Venda Manha; PU Base Manha. Decimal vírgula, datas dd/mm/aaaa.
- Frequência: dias úteis (manhã). Histórico desde 2002 — o sistema NUNCA alega
  possuir mais história do que o dataset oficial contém.
- Taxas são as ofertadas ao investidor de varejo pelo Tesouro Direto; NÃO misturar
  com taxas indicativas ANBIMA (mercado secundário) sem rotular metodologia.

## Fontes registradas, não integradas no MVP (roadmap)

- ANBIMA (taxas indicativas de títulos públicos) — fonte distinta do Tesouro Direto.
- BCB SGS / Expectativas (Focus) — macro Brasil.
- IBGE agregados v3 — inflação/atividade.
- SEC EDGAR, FRED, IMF, BIS, World Bank, OECD, ECB, US Treasury Fiscal Data — internacional.
- B3 cadastro de empresas listadas e classificação setorial (páginas B3) — no MVP a
  classificação setorial usa `SETOR_ATIV` do cadastro CVM, com granularidade menor
  (limitação registrada).
- RI das companhias (downloads oficiais adicionais) — MVP baixa documentos via CVM/IPE.

## Política comum

- Cache: bronze imutável; re-download só cria nova versão se sha256 mudar.
- Rate limit: 1 req/s por host, retry exponencial (2s/4s/8s/16s), User-Agent identificado.
- Toda ingestão registra: url, sha256, bytes, http_status, started_at, finished_at,
  fonte, e falhas — em `data/audit/ingestion_runs.jsonl`.
- Falha de fonte NUNCA é silenciosa: vira `data_quality_issue` no relatório de saúde.
