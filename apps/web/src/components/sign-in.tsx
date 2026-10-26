"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** `stayOnPage`: after signing in, stay here (e.g. to accept an invite) instead of opening the board. */
export function SignIn({ stayOnPage = false }: { stayOnPage?: boolean }) {
  const router = useRouter();
  const { state, signIn } = useAuth();
  const [providers, setProviders] = useState({ github: false, google: false, demo: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.providers().then(setProviders).catch(() => {});
  }, []);

  if (state.status === "signed-in") {
    return (
      <button onClick={() => router.push("/board")} className={primary}>
        Open my board →
      </button>
    );
  }

  async function startDemo() {
    setBusy(true);
    setError(null);
    try {
      signIn(await api.startDemo());
      if (!stayOnPage) router.push("/board");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto">
      <div className="flex flex-col gap-3 sm:flex-row">
        {providers.github && (
          <a href={api.signInUrl("github")} className={secondary}>
            Continue with GitHub
          </a>
        )}
        {providers.google && (
          <a href={api.signInUrl("google")} className={secondary}>
            Continue with Google
          </a>
        )}
        {providers.demo && (
          <button onClick={startDemo} disabled={busy} className={primary}>
            {busy ? "Setting up your demo…" : "Try the demo (no sign-up)"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

const base =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60";
const primary = `${base} bg-indigo-600 text-white hover:bg-indigo-700`;
const secondary = `${base} border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800`;
