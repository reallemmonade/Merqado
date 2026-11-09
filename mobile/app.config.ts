import type { ConfigContext, ExpoConfig } from "expo/config";

/** app.json plus values the cloud build sets (build number, server address). */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ios: {
    ...config.ios,
    buildNumber: process.env.BUILD_NUMBER ?? config.ios?.buildNumber,
  },
  extra: {
    ...config.extra,
    apiUrl: process.env.MERQADO_API_URL ?? config.extra?.apiUrl,
  },
});
