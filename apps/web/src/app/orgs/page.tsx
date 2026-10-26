"use client";

import { ROLE_LABELS, type Organization } from "@trabahub/shared";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { AppShell, ErrorNote } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";

function Orgs() {
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listOrgs()
      .then(setOrgs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load organizations"));
  }, []);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    setBusy(true);
    setError(null);
    try {
      const org = await api.createOrg(name);
      setOrgs((list) => [...(list ?? []), org]);
      form.reset();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors.name ?? err.message) : "Could not create it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          For career coaches, schools and bootcamps: invite your people, and coaches can follow each
          member&apos;s job search.
        </p>
      </div>

      <ErrorNote message={error} />

      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="org-name" className="sr-only">
          Organization name
        </label>
        <input
          id="org-name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Bootcamp Batch 7"
          className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button disabled={busy} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {busy ? "Creating…" : "Create organization"}
        </button>
      </form>

      {orgs === null ? (
        !error && <p className="text-sm text-zinc-500">Loading…</p>
      ) : orgs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          You&apos;re not in any organization yet. Create one, or open an invite link someone sent you.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link
                href={`/orgs/${org.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span>
                  <span className="font-medium">{org.name}</span>
                  <span className="block text-xs text-zinc-500">
                    {org.memberCount} {org.memberCount === 1 ? "member" : "members"}
                  </span>
                </span>
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{ROLE_LABELS[org.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OrgsPage() {
  return (
    <AppShell>
      <Orgs />
    </AppShell>
  );
}
