"use client";

import { useState } from "react";

import { AppShell, ErrorNote } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Settings() {
  const { state, setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (state.status !== "signed-in") return null;
  const user = state.user;

  async function toggleDigest(emailDigest: boolean) {
    setSaving(true);
    setError(null);
    try {
      setUser(await api.updateMe({ emailDigest }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <ErrorNote message={error} />
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={user.emailDigest}
            disabled={saving || !user.email}
            onChange={(e) => toggleDigest(e.target.checked)}
            className="mt-1 h-5 w-5 accent-indigo-600"
          />
          <span>
            <span className="font-medium">Daily follow-up email</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">
              Each morning, if any application you marked <em>Applied</em> is due for a follow-up,
              TrabaHub emails you a short list{user.email ? ` at ${user.email}` : ""}.
            </span>
            {!user.email && (
              <span className="mt-1 block text-sm text-amber-700 dark:text-amber-300">
                Demo accounts have no email address. Sign in with GitHub or Google to get these emails.
              </span>
            )}
          </span>
        </label>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}
