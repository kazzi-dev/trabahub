"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Job } from "@trabahub/shared";

export function followUpLabel(job: Job, now = Date.now()): { text: string; overdue: boolean } | null {
  if (!job.followUpAt || job.status !== "applied") return null;
  const days = Math.round((Date.parse(job.followUpAt) - now) / 86_400_000);
  if (days < 0) return { text: `Follow up (${-days}d overdue)`, overdue: true };
  if (days === 0) return { text: "Follow up today", overdue: true };
  return { text: `Follow up in ${days}d`, overdue: false };
}

export function JobCardBody({ job }: { job: Job }) {
  const followUp = followUpLabel(job);
  return (
    <>
      <p className="font-medium leading-snug">{job.title}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{job.company}</p>
      {(job.location || job.salaryText) && (
        <p className="mt-1 text-xs text-zinc-500">
          {[job.location, job.salaryText].filter(Boolean).join(" · ")}
        </p>
      )}
      {followUp && (
        <p
          className={`mt-2 inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${
            followUp.overdue
              ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {followUp.text}
        </p>
      )}
    </>
  );
}

export function JobCard({ job, onOpen }: { job: Job; onOpen: (job: Job) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`touch-manipulation list-none rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(job)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) onOpen(job);
      }}
      aria-label={`${job.title} at ${job.company}. Press space to pick up and move, Enter to open.`}
    >
      <JobCardBody job={job} />
    </li>
  );
}
