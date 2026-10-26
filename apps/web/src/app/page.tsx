import { SignIn } from "@/components/sign-in";

const FEATURES = [
  {
    title: "One board for every application",
    body: "Drag jobs from Saved to Applied, Interview and Offer. See your whole search at a glance, on your phone or laptop.",
  },
  {
    title: "Follow-ups that don't slip",
    body: "Moving a job to Applied schedules a follow-up a week later, so good leads don't go quiet.",
  },
  {
    title: "Every detail in one card",
    body: "Salary, location, requirements, notes and a timeline of what happened, instead of a messy spreadsheet.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-12 sm:px-6 sm:py-20">
      <section className="flex flex-col gap-6">
        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
          <span lang="tl">Trabaho</span> + hub
        </p>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Every job you&apos;re chasing, in one place.
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          TrabaHub keeps your job search organized: save openings, track where each application
          stands, and get reminded to follow up.
        </p>
        <SignIn />
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3" aria-label="Features">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-16 text-xs text-zinc-500">
        Built by Kazzi ·{" "}
        <a className="underline" href="https://github.com/kazzi-dev/trabahub">
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}
