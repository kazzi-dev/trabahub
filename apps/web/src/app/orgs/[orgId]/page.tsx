"use client";

import {
  can,
  canChangeRole,
  canRemove,
  JOB_STATUSES,
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
  type Invite,
  type Member,
  type Organization,
  type Role,
} from "@trabahub/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { AppShell, ErrorNote } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function OrgDetail({ orgId }: { orgId: string }) {
  const router = useRouter();
  const { state } = useAuth();
  const me = state.status === "signed-in" ? state.user.id : null;
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteRole, setInviteRole] = useState<Exclude<Role, "owner">>("member");
  const [copied, setCopied] = useState(false);

  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback);

  const fetchAll = useCallback(() => Promise.all([api.getOrg(orgId), api.members(orgId)]), [orgId]);

  // Refresh after a change (role, removal).
  const load = useCallback(async () => {
    try {
      const [o, m] = await fetchAll();
      setOrg(o);
      setMembers(m);
    } catch (err) {
      fail(err, "Could not load this organization");
    }
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([o, m]) => {
        if (cancelled) return;
        setOrg(o);
        setMembers(m);
      })
      .catch((err) => !cancelled && fail(err, "Could not load this organization"));
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  if (!org) return error ? <ErrorNote message={error} /> : <p className="text-sm text-zinc-500">Loading…</p>;
  const role = org.role;
  const showPipelines = can(role, "pipelines.view");
  const inviteUrl = invite ? `${window.location.origin}/join/${invite.code}` : "";

  async function changeRole(userId: string, to: Role) {
    setError(null);
    try {
      await api.setRole(orgId, userId, to);
      await load();
    } catch (err) {
      fail(err, "Could not change the role");
    }
  }

  async function remove(member: Member) {
    const leaving = member.userId === me;
    if (!confirm(leaving ? `Leave ${org!.name}?` : `Remove ${member.name ?? "this member"}?`)) return;
    setError(null);
    try {
      await api.removeMember(orgId, member.userId);
      if (leaving) router.replace("/orgs");
      else await load();
    } catch (err) {
      fail(err, "Could not remove");
    }
  }

  async function createInvite() {
    setError(null);
    setCopied(false);
    try {
      setInvite(await api.createInvite(orgId, inviteRole));
    } catch (err) {
      fail(err, "Could not create an invite");
    }
  }

  async function deleteOrg() {
    if (!confirm(`Delete ${org!.name} for everyone? Members keep their own boards.`)) return;
    try {
      await api.deleteOrg(orgId);
      router.replace("/orgs");
    } catch (err) {
      fail(err, "Could not delete");
    }
  }

  // Owners can invite admins; admins can invite coaches and members.
  const invitable = (["admin", "coach", "member"] as const).filter((r) => r !== "admin" || role === "owner");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/orgs" className="text-sm text-zinc-500 hover:underline">
            ← Organizations
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You&apos;re {role === "admin" || role === "owner" ? "an" : "a"} {ROLE_LABELS[role].toLowerCase()} ·{" "}
            {org.memberCount} {org.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        {can(role, "org.delete") && (
          <button onClick={deleteOrg} className="min-h-11 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
            Delete organization
          </button>
        )}
      </div>

      <ErrorNote message={error} />

      {can(role, "invites.create") && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Invite people</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Share a link; anyone who opens it within 7 days joins with the role you pick.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="invite-role">
              Role for people who join
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Exclude<Role, "owner">)}
              className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {invitable.map((r) => (
                <option key={r} value={r}>
                  Join as {ROLE_LABELS[r].toLowerCase()}
                </option>
              ))}
            </select>
            <button onClick={createInvite} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">
              Create invite link
            </button>
          </div>
          {invite && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input readOnly value={inviteUrl} aria-label="Invite link" onFocus={(e) => e.target.select()} className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950" />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                }}
                className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">{showPipelines ? "Members and their job search" : "Members"}</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                {showPipelines &&
                  JOB_STATUSES.map((s) => (
                    <th key={s} className="px-2 py-2 text-right font-medium">
                      {STATUS_LABELS[s]}
                    </th>
                  ))}
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const editableRoles = ROLES.filter((to) => to === m.role || canChangeRole(role, m.role, to));
                return (
                  <tr key={m.userId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-3 py-2">
                      {showPipelines && m.userId !== me ? (
                        <Link href={`/orgs/${orgId}/members/${m.userId}`} className="font-medium hover:underline">
                          {m.name ?? "Unnamed"}
                        </Link>
                      ) : (
                        <span className="font-medium">{m.name ?? "Unnamed"}</span>
                      )}
                      {m.userId === me && <span className="ml-1 text-xs text-zinc-500">(you)</span>}
                      {m.email && <span className="block text-xs text-zinc-500">{m.email}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {editableRoles.length > 1 ? (
                        <select
                          aria-label={`Role for ${m.name ?? "member"}`}
                          value={m.role}
                          onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          {editableRoles.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ROLE_LABELS[m.role]
                      )}
                    </td>
                    {showPipelines &&
                      JOB_STATUSES.map((s) => (
                        <td key={s} className="px-2 py-2 text-right tabular-nums">
                          {m.statusCounts?.[s] ?? 0}
                        </td>
                      ))}
                    <td className="px-3 py-2 text-right">
                      {(m.userId === me || canRemove(role, m.role)) && (
                        <button onClick={() => remove(m)} className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
                          {m.userId === me ? "Leave" : "Remove"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OrgFromUrl() {
  const { orgId } = useParams<{ orgId: string }>();
  return <OrgDetail orgId={orgId} />;
}

export default function OrgPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <OrgFromUrl />
      </Suspense>
    </AppShell>
  );
}
