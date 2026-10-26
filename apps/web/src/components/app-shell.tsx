"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/board", label: "My board" },
  { href: "/orgs", label: "Organizations" },
  { href: "/settings", label: "Settings" },
];

/** Header + sign-in guard for every signed-in page. */
export function AppShell({ children }: { children: ReactNode }) {
  // The header reads the URL (to highlight the current page), which on dynamic routes is only
  // known at request time, so it renders inside <Suspense>.
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, signOut } = useAuth();

  useEffect(() => {
    if (state.status === "signed-out") router.replace("/");
  }, [state.status, router]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/" className="font-bold tracking-tight">
            TrabaHub
          </Link>
          <nav className="flex gap-1" aria-label="Main">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-2.5 py-2 text-sm ${
                    active
                      ? "bg-zinc-100 font-medium dark:bg-zinc-800"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {state.status === "signed-in" && (
            <div className="ml-auto flex items-center gap-3">
              {state.user.isDemo && (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Demo
                </span>
              )}
              <span className="hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">{state.user.name}</span>
              <button
                onClick={() => {
                  signOut();
                  router.replace("/");
                }}
                className="min-h-11 rounded-lg px-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
        {state.status === "signed-in" ? children : <p className="text-sm text-zinc-500">Loading…</p>}
      </main>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </p>
  );
}
