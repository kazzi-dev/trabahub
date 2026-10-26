"use client";

import type { Job } from "@trabahub/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Board } from "@/components/board";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function BoardPage() {
  const router = useRouter();
  const { state, signOut } = useAuth();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "signed-out") router.replace("/");
    if (state.status !== "signed-in") return;
    api
      .listJobs()
      .then((list) => setJobs(list.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your jobs"));
  }, [state.status, router]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href="/" className="font-bold tracking-tight">
            TrabaHub
          </Link>
          {state.status === "signed-in" && (
            <>
              {state.user.isDemo && (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Demo: changes are yours alone and reset after a day
                </span>
              )}
              <span className="ml-auto hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">
                {state.user.name}
              </span>
              <button
                onClick={() => {
                  signOut();
                  router.replace("/");
                }}
                className="ml-auto min-h-11 rounded-lg px-3 text-sm hover:bg-zinc-100 sm:ml-0 dark:hover:bg-zinc-800"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        {jobs ? (
          <Board initialJobs={jobs} onError={setError} />
        ) : (
          !error && <p className="text-sm text-zinc-500">Loading your board…</p>
        )}
      </main>
    </div>
  );
}
