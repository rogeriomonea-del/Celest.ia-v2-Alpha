# painel_demo — prévia estática do painel financeiro (NÃO editar aqui)

Cópia CONGELADA do frontend `Celst.ia-Finance` (branch
`claude/investment-intelligence-os-f01zs0`, commit f1bf366) vendorizada
apenas para servir a PRÉVIA de design na Vercel a partir deste repositório,
que já possui a integração GitHub→Vercel.

- Build: `IIOS_STATIC_EXPORT=1 NEXT_PUBLIC_IIOS_DEMO=1 npm run build`
  (export estático + modo demonstração com fixtures rotuladas).
- O código-fonte da verdade vive no repositório `Celst.ia-Finance` (PR #1);
  qualquer mudança deve ser feita LÁ e re-vendorizada.
- Removidos da cópia: `app/api` e `app/agentes` (exigem servidor Node /
  server actions — incompatíveis com export estático), docs e CLAUDE.md.
- O `vercel.json` da RAIZ deste branch aponta o build para esta pasta;
  o branch `main` (produção do dashboard de voos) não é afetado.
- Esta pasta pode ser removida por completo antes do merge do PR #10.
