"use client";

import type { Job } from "@trabahub/shared";
import { useEffect, useState } from "react";

import { AppShell, ErrorNote } from "@/components/app-shell";
import { Board } from "@/components/board";
import { api, ApiError } from "@/lib/api";

function MyBoard() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listJobs()
      .then((list) => setJobs(list.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your jobs"));
  }, []);

  return (
    <>
      <ErrorNote message={error} />
      {jobs ? <Board initialJobs={jobs} onError={setError} /> : !error && <p className="text-sm text-zinc-500">Loading your board…</p>}
    </>
  );
}

export default function BoardPage() {
  return (
    <AppShell>
      <MyBoard />
    </AppShell>
  );
}
