"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// The API redirects here after GitHub/Google sign-in with a one-time ?code=...
function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuth();
  const code = params.get("code");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current) return; // the code is single-use; don't spend it twice
    started.current = true;
    api
      .exchange(code)
      .then((res) => {
        signIn(res);
        router.replace("/board");
      })
      .catch((err) => setExchangeError(err instanceof ApiError ? err.message : "Sign-in failed"));
  }, [code, router, signIn]);

  const error = code ? exchangeError : "Missing sign-in code.";
  return (
    <p className="text-zinc-600 dark:text-zinc-400" role={error ? "alert" : "status"}>
      {error ? (
        <>
          {error}{" "}
          <Link href="/" className="underline">
            Try again
          </Link>
        </>
      ) : (
        "Signing you in…"
      )}
    </p>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<p>Signing you in…</p>}>
        <Callback />
      </Suspense>
    </main>
  );
}
