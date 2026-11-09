import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { api, API_URL, loadToken, saveToken, setSignedOutHandler, type Me } from "@/lib/api";
import { currentDeviceToken } from "@/lib/push";

const CASE_KEY = "merqado.case";
const REDIRECT = "merqado://auth";

type Auth = {
  ready: boolean;
  me: Me | null;
  caseId: string | null;
  setCaseId: (id: string) => void;
  signIn: () => Promise<string | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [caseId, setCaseIdState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await api<Me>("/api/mobile/me");
    setMe(data);
    const saved = await SecureStore.getItemAsync(CASE_KEY);
    const pick = data.cases.find((c) => c.id === saved)?.id ?? data.cases[0]?.id ?? null;
    setCaseIdState(pick);
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => setMe(null));
    (async () => {
      try {
        if (await loadToken()) await refresh();
      } catch {
        // Offline or signed out: show sign-in.
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  const signIn = useCallback(async () => {
    // PKCE: only this phone knows the verifier, so the one-time code is useless to anyone else.
    const verifier = b64url(Crypto.getRandomBytes(32));
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
    const challenge = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const returnTo = `/api/mobile/auth/finish?challenge=${challenge}`;
    const result = await WebBrowser.openAuthSessionAsync(`${API_URL}/login?returnTo=${encodeURIComponent(returnTo)}`, REDIRECT);
    if (result.type !== "success") return null;
    const params = new URL(result.url).searchParams;
    const code = params.get("code");
    if (!code) return params.get("error") ?? "failed";
    try {
      const { token } = await api<{ token: string }>("/api/mobile/auth/token", { body: { code, verifier } });
      await saveToken(token);
      await refresh();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "failed";
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await api("/api/mobile/auth/logout", { body: { deviceToken: await currentDeviceToken() } });
    } catch {}
    await saveToken(null);
    setMe(null);
  }, []);

  const setCaseId = useCallback((id: string) => {
    setCaseIdState(id);
    void SecureStore.setItemAsync(CASE_KEY, id);
  }, []);

  const value = useMemo(() => ({ ready, me, caseId, setCaseId, signIn, signOut, refresh }), [ready, me, caseId, setCaseId, signIn, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** The selected case, or null. */
export function useCase() {
  const { me, caseId } = useAuth();
  return me?.cases.find((c) => c.id === caseId) ?? null;
}
