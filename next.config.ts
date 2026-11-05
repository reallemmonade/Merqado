import type { NextConfig } from "next";

const config: NextConfig = {
  // Cloud SDKs are server-only and large; keep them out of the bundle.
  serverExternalPackages: ["@libsql/client", "@google-cloud/storage", "@azure/storage-blob"],
};

export default config;
