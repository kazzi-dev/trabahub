"use client";

import { JOB_STATUSES, STATUS_LABELS, type Job, type Member } from "@trabahub/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AppShell, ErrorNote } from "@/components/app-shell";
import { JobCardBody } from "@/components/job-card";
import { api, ApiError } from "@/lib/api";

// What a coach sees: a member's board, read-only.
function MemberBoard({ orgId, userId }: { orgId: string; userId: string }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.memberJobs(orgId, userId), api.members(orgId)])
      .then(([list, members]) => {
        setJobs(list.items);
        setMember(members.find((m) => m.userId === userId) ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this board"));
  }, [orgId, userId]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/orgs/${orgId}`} className="text-sm text-zinc-500 hover:underline">
          ← Back to organization
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{member?.name ?? "Member"}&apos;s job search</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Read-only view for coaches.</p>
      </div>
      <ErrorNote message={error} />
      {jobs && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
          {JOB_STATUSES.map((status) => {
            const column = jobs.filter((j) => j.status === status);
            return (
              <section
                key={status}
                aria-label={`${STATUS_LABELS[status]} (${column.length})`}
                className="w-[82vw] max-w-xs shrink-0 snap-start rounded-xl bg-zinc-100 p-2 sm:w-72 lg:w-auto lg:max-w-none dark:bg-zinc-900/60"
              >
                <h2 className="px-1 py-1.5 text-sm font-semibold">
                  {STATUS_LABELS[status]} <span className="font-normal text-zinc-500">{column.length}</span>
                </h2>
                <ul className="flex flex-col gap-2 p-1">
                  {column.map((job) => (
                    <li key={job.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <JobCardBody job={job} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberBoardFromUrl() {
  const { orgId, userId } = useParams<{ orgId: string; userId: string }>();
  return <MemberBoard orgId={orgId} userId={userId} />;
}

export default function MemberBoardPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <MemberBoardFromUrl />
      </Suspense>
    </AppShell>
  );
}
