/** Public base URL. Render sets RENDER_EXTERNAL_URL; APP_URL overrides it (e.g. a custom domain). */
export function appBaseUrl(req: Request): string {
  const configured = process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL;
  return (configured ?? new URL(req.url).origin).replace(/\/+$/, "");
}

export const CALLBACK_PATH = "/api/auth/callback";
