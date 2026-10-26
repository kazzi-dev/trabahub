"use client";

import type { TokenResponse, User } from "@trabahub/shared";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api, ApiError, getToken, setToken } from "./api";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User };

interface AuthContextValue {
  state: AuthState;
  signIn(response: TokenResponse): void;
  signOut(): void;
  /** Replace the cached user after a profile change. */
  setUser(user: User): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // The token lives in localStorage, which only exists in the browser, so this runs after hydration.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      let next: AuthState = { status: "signed-out" };
      if (getToken()) {
        try {
          next = { status: "signed-in", user: await api.me() };
        } catch (err) {
          // Only forget the token if the API rejected it; a sleeping server shouldn't sign you out.
          if (err instanceof ApiError && err.status === 401) setToken(null);
        }
      }
      if (!cancelled) setState(next);
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((response: TokenResponse) => {
    setToken(response.token);
    setState({ status: "signed-in", user: response.user });
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setState({ status: "signed-out" });
  }, []);

  const setUser = useCallback((user: User) => setState({ status: "signed-in", user }), []);

  return <AuthContext.Provider value={{ state, signIn, signOut, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
