"use client";

import { JOB_STATUSES, STATUS_LABELS, type Job, type JobStatus } from "@trabahub/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api, ApiError } from "@/lib/api";

interface Props {
  /** The job to edit, or a status to create a new job in. */
  target: { job: Job } | { status: JobStatus } | null;
  onClose(): void;
  onSaved(job: Job): void;
  onDeleted(id: string): void;
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (v: string) => (v ? new Date(`${v}T09:00:00`).toISOString() : null);

export function JobDialog({ target, onClose, onSaved, onDeleted }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const job = target && "job" in target ? target.job : null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
    setErrors({});
    setFormError(null);
  }, [target]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (name: string) => {
      const v = String(f.get(name) ?? "").trim();
      return v === "" ? null : v;
    };
    const input = {
      title: text("title") ?? "",
      company: text("company") ?? "",
      location: text("location"),
      salaryText: text("salaryText"),
      url: text("url"),
      status: f.get("status") as JobStatus,
      notes: text("notes"),
      requirements: String(f.get("requirements") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      followUpAt: fromDateInput(String(f.get("followUpAt") ?? "")),
    };
    setBusy(true);
    try {
      onSaved(job ? await api.updateJob(job.id, input) : await api.createJob(input));
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setFormError(Object.keys(err.fieldErrors).length ? null : err.message);
        // Bring the first invalid field into view; on phones it may be scrolled away.
        requestAnimationFrame(() =>
          ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        );
      } else setFormError("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!job || !confirm(`Delete "${job.title}" at ${job.company}?`)) return;
    setBusy(true);
    try {
      await api.deleteJob(job.id);
      onDeleted(job.id);
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  const initialStatus = job?.status ?? (target && "status" in target ? target.status : "saved");

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(36rem,calc(100%-2rem))] rounded-xl bg-white p-0 text-zinc-900 backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {target && (
        <form key={job?.id ?? "new"} onSubmit={submit} className="flex flex-col gap-4 p-5" noValidate>
          <h2 className="text-lg font-semibold">{job ? "Edit job" : "Add a job"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title" name="title" defaultValue={job?.title} error={errors.title} required />
            <Field label="Company" name="company" defaultValue={job?.company} error={errors.company} required />
            <Field label="Location" name="location" defaultValue={job?.location} error={errors.location} />
            <Field label="Salary" name="salaryText" defaultValue={job?.salaryText} error={errors.salaryText} placeholder="e.g. ₱60,000 / month" />
            <Field label="Job post URL" name="url" type="url" defaultValue={job?.url} error={errors.url} className="sm:col-span-2" />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Status</span>
              <select name="status" defaultValue={initialStatus} className={inputClass}>
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Follow up on" name="followUpAt" type="date" defaultValue={toDateInput(job?.followUpAt ?? null)} error={errors.followUpAt} />
            <Field label="Requirements (comma-separated)" name="requirements" defaultValue={job?.requirements.join(", ")} error={errors.requirements} className="sm:col-span-2" />
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium">Notes</span>
              <textarea name="notes" rows={3} defaultValue={job?.notes ?? ""} className={inputClass} />
            </label>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {job && (
              <button type="button" onClick={remove} disabled={busy} className="mr-auto min-h-11 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} className="ml-auto min-h-11 rounded-lg px-4 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "Saving…" : job ? "Save changes" : "Add job"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

const inputClass =
  "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 dark:border-zinc-700 dark:bg-zinc-950 sm:text-sm";

function Field({
  label,
  name,
  error,
  className = "",
  defaultValue,
  ...rest
}: {
  label: string;
  name: string;
  error?: string;
  className?: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const id = `field-${name}`;
  return (
    <label htmlFor={id} className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium">{label}</span>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
        {...rest}
      />
      {error && (
        <span id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}
