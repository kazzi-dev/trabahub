"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { JOB_STATUSES, STATUS_LABELS, type Job, type JobStatus } from "@trabahub/shared";
import { useMemo, useState } from "react";

import { api } from "@/lib/api";
import { JobCard, JobCardBody } from "./job-card";
import { JobDialog } from "./job-dialog";

type Columns = Record<JobStatus, string[]>;

function toColumns(jobs: Job[]): Columns {
  const cols = Object.fromEntries(JOB_STATUSES.map((s) => [s, [] as string[]])) as Columns;
  [...jobs].sort((a, b) => a.position - b.position).forEach((j) => cols[j.status].push(j.id));
  return cols;
}

export function Board({ initialJobs, onError }: { initialJobs: Job[]; onError(message: string): void }) {
  const [jobs, setJobs] = useState(() => new Map(initialJobs.map((j) => [j.id, j])));
  const [columns, setColumns] = useState(() => toColumns(initialJobs));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{ status: JobStatus; index: number } | null>(null);
  const [dialog, setDialog] = useState<{ job: Job } | { status: JobStatus } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a click still opens the card
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), // let phones scroll
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string): JobStatus | undefined =>
    (JOB_STATUSES as readonly string[]).includes(id)
      ? (id as JobStatus)
      : JOB_STATUSES.find((s) => columns[s].includes(id));

  function onDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    const status = findColumn(id)!;
    setActiveId(id);
    setDragOrigin({ status, index: columns[status].indexOf(id) });
  }

  // Moving across columns happens while dragging, so the card shows where it will land.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const overIndex = cols[to].indexOf(String(over.id));
      const index = overIndex === -1 ? cols[to].length : overIndex;
      return {
        ...cols,
        [from]: cols[from].filter((id) => id !== active.id),
        [to]: [...cols[to].slice(0, index), String(active.id), ...cols[to].slice(index)],
      };
    });
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id);
    setActiveId(null);
    const status = findColumn(id);
    if (!over || !status || !dragOrigin) return;

    let next = columns;
    const overIndex = columns[status].indexOf(String(over.id));
    const currentIndex = columns[status].indexOf(id);
    if (overIndex !== -1 && overIndex !== currentIndex) {
      next = { ...columns, [status]: arrayMove(columns[status], currentIndex, overIndex) };
      setColumns(next);
    }
    const index = next[status].indexOf(id);
    if (status === dragOrigin.status && index === dragOrigin.index) return;

    try {
      const saved = await api.updateJob(id, { status, position: index });
      setJobs((m) => new Map(m).set(saved.id, saved));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not move the job");
      await reload();
    }
  }

  async function reload() {
    try {
      const list = await api.listJobs();
      setJobs(new Map(list.items.map((j) => [j.id, j])));
      setColumns(toColumns(list.items));
    } catch {
      // keep what we have; the error above already told the user
    }
  }

  function saved(job: Job) {
    const isNew = !jobs.has(job.id);
    setJobs((m) => new Map(m).set(job.id, job));
    setColumns((cols) => {
      const without = Object.fromEntries(
        JOB_STATUSES.map((s) => [s, cols[s].filter((id) => id !== job.id)]),
      ) as Columns;
      const stayed = !isNew && cols[job.status].includes(job.id);
      return { ...without, [job.status]: stayed ? cols[job.status] : [job.id, ...without[job.status]] };
    });
  }

  function deleted(id: string) {
    setJobs((m) => {
      const copy = new Map(m);
      copy.delete(id);
      return copy;
    });
    setColumns((cols) => Object.fromEntries(JOB_STATUSES.map((s) => [s, cols[s].filter((x) => x !== id)])) as Columns);
  }

  const activeJob = activeId ? jobs.get(activeId) : undefined;
  const total = useMemo(() => jobs.size, [jobs]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {total} {total === 1 ? "job" : "jobs"} · drag cards to update their status
        </p>
        <button
          onClick={() => setDialog({ status: "saved" })}
          className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Add job
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          void reload();
        }}
      >
        {/* Phones: swipe between columns. Desktop: all five side by side. */}
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {JOB_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              jobs={columns[status].map((id) => jobs.get(id)!).filter(Boolean)}
              onOpen={(job) => setDialog({ job })}
              onAdd={() => setDialog({ status })}
            />
          ))}
        </div>
        <DragOverlay>
          {activeJob && (
            <div className="rotate-2 rounded-lg border border-indigo-300 bg-white p-3 shadow-lg dark:border-indigo-700 dark:bg-zinc-900">
              <JobCardBody job={activeJob} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <JobDialog target={dialog} onClose={() => setDialog(null)} onSaved={saved} onDeleted={deleted} />
    </>
  );
}

function Column({
  status,
  jobs,
  onOpen,
  onAdd,
}: {
  status: JobStatus;
  jobs: Job[];
  onOpen(job: Job): void;
  onAdd(): void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      aria-label={`${STATUS_LABELS[status]} (${jobs.length})`}
      className={`flex w-[82vw] max-w-xs shrink-0 snap-start flex-col rounded-xl bg-zinc-100 p-2 sm:w-72 lg:w-auto lg:max-w-none dark:bg-zinc-900/60 ${
        isOver ? "ring-2 ring-indigo-400" : ""
      }`}
    >
      <header className="flex items-center justify-between px-1 py-1.5">
        <h2 className="text-sm font-semibold">
          {STATUS_LABELS[status]} <span className="font-normal text-zinc-500">{jobs.length}</span>
        </h2>
        <button
          onClick={onAdd}
          aria-label={`Add a job to ${STATUS_LABELS[status]}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          +
        </button>
      </header>
      <SortableContext id={status} items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 p-1">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onOpen={onOpen} />
          ))}
          {jobs.length === 0 && (
            <li className="list-none rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
              Drop a job here
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}
