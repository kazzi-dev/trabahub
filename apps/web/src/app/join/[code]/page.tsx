"use client";

import { ROLE_LABELS, type InvitePreview } from "@trabahub/shared";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { SignIn } from "@/components/sign-in";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Opened from an invite link. Signed-out visitors sign in (or try the demo) first, then accept.
function Join({ code }: { code: string }) {
  const router = useRouter();
  const { state } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status !== "signed-in") return;
    api
      .previewInvite(code)
      .then(setPreview)
      .catch((err) => setError(err instanceof ApiError ? err.message : "This invite can't be opened"));
  }, [code, state.status]);

  async function accept() {
    setBusy(true);
    try {
      const org = await api.acceptInvite(code);
      router.replace(`/orgs/${org.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join");
      setBusy(false);
    }
  }

  if (state.status === "loading") return <p className="text-sm text-zinc-500">Loading…</p>;
  if (state.status === "signed-out") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">You&apos;re invited to TrabaHub</h1>
        <p className="text-zinc-600 dark:text-zinc-400">Sign in first, then you can accept the invite here.</p>
        <SignIn stayOnPage />
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="text-red-700 dark:text-red-300">
        {error}
      </p>
    );
  }
  if (!preview) return <p className="text-sm text-zinc-500">Checking the invite…</p>;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Join {preview.organizationName}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        You&apos;ll join as a <strong>{ROLE_LABELS[preview.role].toLowerCase()}</strong>.
        {preview.role === "member" && " Coaches in this organization will be able to see your job board (read-only)."}
      </p>
      <button onClick={accept} disabled={busy} className="min-h-11 self-start rounded-lg bg-indigo-600 px-5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
        {busy ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}

// The invite code is only known at request time, so reading it must sit inside <Suspense>.
function JoinFromUrl() {
  const { code } = useParams<{ code: string }>();
  return <Join code={code} />;
}

export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <JoinFromUrl />
      </Suspense>
    </main>
  );
}
