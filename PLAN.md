# TrabaHub: project plan (v2, built around a real job post)

> *Trabaho* (work) + *hub*. One place for every job you're chasing, for job seekers and the
> career coaches who help them.

This version is designed so that every requirement in a typical **Full Stack Web Developer**
job post (Node/React/PostgreSQL, REST APIs, AWS/GCP, Docker, Terraform, CI/CD, OAuth and
role-based access, mobile-first, AI, WordPress) is demonstrated by a live, verifiable feature.

## The product

**For job seekers**
1. **One-click save** from any job site with a browser extension; AI extracts title, company,
   salary, requirements and deadline.
2. **Kanban board**: Saved → Applied → Interview → Offer → Rejected, with notes and a timeline.
3. **Resume match**: upload a resume (PDF); every job shows a fit score, matched and missing
   requirements.
4. **Follow-up reminders** and a daily email digest.
5. **Insights**: applications per week, response rate, where interviews come from.

**For career coaches, schools and bootcamps (multi-tenant)**
6. **Organizations** with roles: *owner*, *admin*, *coach*, *member*. A coach sees their
   students' pipelines (with each student's consent), leaves comments, and tracks cohort
   progress. Each organization's data is isolated from every other one.

**For companies (WordPress)**
7. **TrabaHub Jobs plugin**: a WordPress plugin that lists a company's openings with a shortcode
   and adds a "Save to TrabaHub" button for candidates, using TrabaHub's public REST API.

## Job post → where TrabaHub proves it

| Job requirement | TrabaHub feature |
| --- | --- |
| JavaScript/TypeScript + React/Next.js | `apps/web`: Next.js (App Router), TypeScript, Tailwind |
| Node.js/Express backend | `apps/api`: Express + TypeScript REST API |
| RESTful API design | Versioned `/v1`, OpenAPI 3 spec, Swagger docs, consistent errors, pagination, filtering |
| Third-party integrations | Google/GitHub OAuth, Groq (AI), Resend (email) |
| PostgreSQL (relational) | Drizzle ORM, migrations, row-level scoping per user and organization |
| Cloud deployment | Render (Docker API), Vercel (web), Neon (managed PostgreSQL); portable to Cloud Run / AWS |
| Docker | Multi-stage Dockerfiles for API and web; docker-compose for local development |
| Terraform | `infra/`: Render, Vercel and Neon resources as code, `validate` in CI |
| Git workflow + CI/CD | GitHub Actions: lint, type-check, test, build image, push, deploy; keyless auth (Workload Identity Federation) |
| OAuth / SSO / role-based access | OAuth 2.0 / OpenID Connect sign-in, JWT sessions, organization roles enforced in API middleware |
| Clean, well-tested code | Vitest + Supertest (API), Playwright (end-to-end), coverage report in CI |
| Responsive, mobile-first | Board and forms designed for phones first |
| Live, verifiable portfolio | Public demo with a read-only demo account; README case study with architecture and decisions |
| WordPress / custom plugins | `apps/wordpress-plugin`: PHP plugin using the public API |
| AI/LLM integration | Structured extraction and resume matching with validated JSON |
| Ownership of outcomes | Case study: problem, decisions, trade-offs, costs, what I'd do next |

## Architecture

```
 Browser extension ─┐
 WordPress plugin ──┼──► Express REST API (/v1), Docker on Render ──► PostgreSQL (Neon)
 Next.js web app ───┘          │        │
  (Vercel)                     │        └─► Groq (AI extraction, matching)
                               └─► Resend (email)
 GitHub Actions schedule ──► POST /v1/internal/reminders (daily, shared secret)
 Terraform ──► Render service + env, Vercel project + env, Neon project/database
 GitHub Actions ──► lint → type-check → test → docker build → terraform validate
 Render / Vercel ──► auto-deploy on push to main
```

## Repository layout

```
trabahub/
  apps/
    api/               Express + TypeScript, Drizzle, OpenAPI, Vitest + Supertest
    web/               Next.js + TypeScript + Tailwind, Playwright
    extension/         WXT browser extension (Chrome, Edge)
    wordpress-plugin/  PHP plugin
  packages/
    shared/            Zod schemas and types shared by api, web and extension
  infra/               Terraform for Render, Vercel and Neon
  docs/                case study, architecture diagram, screenshots, API docs
  docker-compose.yml   Postgres + api + web for local development
  .github/workflows/   ci.yml, deploy.yml, terraform.yml
```

## Data model

- **users**: id, name, email, image, created_at
- **accounts**: OAuth provider links (Google, GitHub)
- **organizations**: id, name, slug, created_at
- **memberships**: user_id, organization_id, role (owner/admin/coach/member), invited_by
- **jobs**: owner user_id, organization_id (optional), title, company, location, salary_text,
  url, source, status, requirements (JSON), description, match_score, matched / missing (JSON),
  applied_at, follow_up_at, deadline, timestamps
- **job_events**: job_id, actor_id, type, data (JSON), at
- **comments**: job_id, author_id, body (coaches and students)
- **resumes**: user_id, storage path, extracted text, skills (JSON), uploaded_at
- **api_tokens**: user_id, hashed token, scopes, label, last_used_at, revoked_at (extension and
  WordPress)

## Hosting and cost: free, no credit card

| Part | Host | Free tier |
| --- | --- | --- |
| Web (Next.js) | Vercel | Hobby plan |
| API (Express, Docker) | Render | Free web service (sleeps after 15 min idle) |
| PostgreSQL | Neon | Free plan |
| Email | Resend | Free plan |
| Daily reminders | GitHub Actions `schedule` calling an authenticated API endpoint | Free for public repos |
| CI/CD | GitHub Actions + Render/Vercel auto-deploys | Free |
| Infrastructure as code | Terraform with the Render, Vercel and Neon providers (`infra/`) | Free |

None of these need a card, so the project can stay live for free. The design is cloud-portable:
the API is a standard Docker image, so moving to Google Cloud Run or AWS (ECS/App Runner) later
is a Terraform change, documented in `docs/cloud-portability.md`.

Resumes: PDF text is extracted on upload and only the text is stored in PostgreSQL, so no file
storage service is needed.

Local development and tests use PGlite (PostgreSQL compiled to WebAssembly), so they run
without Docker or a database server.

## Milestones (each ends deployed, tests green)

| # | Milestone | Done when |
| --- | --- | --- |
| 1 | API + web foundation | Express API with OAuth sign-in and jobs CRUD (OpenAPI docs, tests); Next.js board with drag and drop; runs in docker-compose |
| 2 | Cloud + infrastructure as code | Terraform describes Render, Vercel and Neon; CI builds and tests; live URL |
| 3 | Organizations + roles | Invite links, coach/member roles, isolated data, permission tests |
| 4 | Browser extension + AI | One-click save with AI extraction, API tokens with scopes |
| 5 | Resumes + match | Upload a PDF, extract text, match scores |
| 6 | Reminders + email | GitHub Actions schedule → reminder endpoint → daily digest email |
| 7 | WordPress plugin | Shortcode job list with "Save to TrabaHub", settings page, API token |
| 8 | Case study + polish | Demo account, screenshots, architecture diagram, README case study, profile update |

## Decisions (defaults; can change)

- Hosting: **free, no card** (Vercel, Render, Neon); Cloud Run / AWS documented as the upgrade path.
- Backend: **Node.js + Express** (TypeScript) to match the post exactly; Laravel could be a
  separate small project later.
- Sign-in: Google and GitHub (OAuth 2.0 / OIDC).
- Folder `C:\Projects\trabahub`; repo `kazzi-dev/trabahub`.
