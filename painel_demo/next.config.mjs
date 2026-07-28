/** @type {import('next').NextConfig} */

/**
 * IIOS_STATIC_EXPORT=1: build 100% estático (`output: "export"`) para
 * prévias hospedadas sem servidor Node (usado junto com
 * NEXT_PUBLIC_IIOS_DEMO=1). As rotas /app/api (protótipo legado) não
 * funcionam em export — a cópia de prévia as remove antes do build.
 */
const staticExport = process.env.IIOS_STATIC_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(staticExport
    ? { output: "export", trailingSlash: true, images: { unoptimized: true } }
    : {
        experimental: {
          serverActions: {
            bodySizeLimit: "4mb",
          },
        },
      }),
};

export default nextConfig;
