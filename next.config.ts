import type { NextConfig } from "next";

const config: NextConfig = {
  // Cloud SDKs are server-only and large; keep them out of the bundle.
  serverExternalPackages: ["@libsql/client", "@google-cloud/storage", "@azure/storage-blob"],
  experimental: {
    // The proxy (src/proxy.ts) runs on every request and cuts bodies over 10 MB by default,
    // which broke any upload larger than that. Uploads are capped at 100 MB in the route.
    proxyClientMaxBodySize: "101mb",
  },
};

export default config;
