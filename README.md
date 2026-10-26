# TrabaHub

**Every job you're chasing, in one place.** *Trabaho* (work) + *hub*.

TrabaHub is a job-application tracker: save openings, drag them from *Saved* to *Applied*,
*Interview* and *Offer*, and get reminded to follow up. It's built as a production-style full
stack project: a typed REST API, a mobile-first React front end, PostgreSQL, OAuth, Docker,
Terraform and CI, all on free hosting.

> **Live demo:** _deploying; link coming soon._ The demo button needs no sign-up and gives each
> visitor their own sandbox.

## Features

- **Kanban board** with drag and drop (mouse, touch and keyboard) and a swipeable column layout
  on phones
- **Follow-ups that don't slip:** moving a job to *Applied* stamps the date and schedules a
  follow-up a week later; overdue ones are highlighted
- **Sign in with GitHub or Google** (OAuth 2.0 / OpenID Connect), or try the demo instantly
- **Job timeline:** every status change and edit is recorded
- **Documented REST API** with Swagger UI at `/docs`

Coming next (see [PLAN.md](PLAN.md)): organizations with roles for career coaches, a browser
extension that saves jobs from any site with AI extraction, resume matching, email digests, and a
WordPress plugin.

## Architecture

```
 Next.js web app (Vercel) ──HTTPS + Bearer JWT──► Express REST API (Docker on Render) ──► PostgreSQL (Neon)
                                                         │
                                       GitHub / Google OAuth (one-time code handoff)
 Terraform (infra/) ──► Neon project, Render service + env, Vercel project + env
 GitHub Actions ──► typecheck · test · build · Docker smoke test · terraform validate
```

| Layer | Tech |
| --- | --- |
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, dnd-kit |
| API | Node.js 22, Express 5, TypeScript, Zod validation, OpenAPI 3.1 + Swagger UI |
| Data | PostgreSQL with Drizzle ORM and SQL migrations; PGlite for tests and local dev |
| Auth | OAuth 2.0 / OIDC (GitHub, Google) via Arctic, JWT access tokens (jose) |
| Infra | Docker (multi-stage), Terraform (Render, Vercel, Neon providers), GitHub Actions |
| Quality | Vitest + Supertest API tests, ESLint, strict TypeScript |

### Design decisions

- **Shared schemas.** `packages/shared` holds the Zod schemas for every request and response. The
  API validates with them, the web app is typed by them, and the OpenAPI document is generated
  from them, so docs can't drift from the code.
- **Sign-in without third-party cookies.** The web app and API live on different domains. After
  OAuth, the API redirects to the web app with a single-use, 60-second code (stored hashed), and
  the web app trades it for a token. This works in browsers that block third-party cookies.
- **Data isolation by construction.** Every jobs query is scoped by the signed-in user's ID; tests
  check that one user gets 404 for another user's job on read, update and delete.
- **Consistent errors.** Every error is an RFC 9457 `application/problem+json` body, with
  field-level messages for validation errors that the form shows next to each field.
- **Real PostgreSQL everywhere.** Tests and local development run PGlite (PostgreSQL compiled to
  WebAssembly), so there's no Docker or database server to install, yet it's the same SQL as
  production.
- **Free and portable.** Render, Vercel and Neon need no credit card. The API is a standard Docker
  image, so moving to Google Cloud Run or AWS is a Terraform change, not a rewrite.

## API

Interactive docs: `/docs` on the API. A few endpoints:

| Method | Path | |
| --- | --- | --- |
| `POST` | `/v1/auth/demo` | Start a sandboxed demo session |
| `GET` | `/v1/auth/{github\|google}/start` | Begin OAuth sign-in |
| `POST` | `/v1/auth/exchange` | Trade the one-time code for a token |
| `GET` | `/v1/jobs?status=&q=&limit=&offset=` | List your jobs |
| `POST` | `/v1/jobs` | Create a job |
| `PATCH` | `/v1/jobs/{id}` | Update a job, or move it with `{ status, position }` |
| `DELETE` | `/v1/jobs/{id}` | Delete a job |
| `GET` | `/v1/jobs/{id}/events` | A job's timeline |

## Run it locally

Requires Node.js 22+. No database or Docker needed.

```bash
npm install
npm run build -w @trabahub/shared
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run dev:api     # http://localhost:4000  (docs at /docs)
npm run dev:web     # http://localhost:3100
```

With Docker and a real PostgreSQL instead: `docker compose up --build`.

Tests: `npm test`.

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md): Terraform in `infra/`, or the step-by-step dashboard route.

## Project layout

```
apps/api/        Express API: src/{auth,jobs,db}, migrations/, tests/
apps/web/        Next.js app: src/app (pages), src/components (board, dialog)
packages/shared/ Zod schemas and types shared by API and web
infra/           Terraform for Neon, Render and Vercel
.github/         CI workflow
```

---

Built by [Kazzi](https://github.com/kazzi-dev).
