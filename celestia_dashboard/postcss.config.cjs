// Config PostCSS local vazio: impede que o build do protótipo Vite herde o
// postcss.config.mjs da raiz do repositório (que requer tailwindcss, uma
// dependência da plataforma Next.js e não deste subprojeto).
module.exports = {
  plugins: {},
};
