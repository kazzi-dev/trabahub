# Deploying TrabaHub (free, no credit card)

| Part | Host |
| --- | --- |
| PostgreSQL | Neon (free plan) |
| API (Docker) | Render (free web service, sleeps after 15 minutes idle) |
| Web | Vercel (Hobby) |

Pick **one** route. Don't mix them, or you'll create duplicate resources.

## Route A: Terraform (infrastructure as code)

1. Create free accounts on [Neon](https://neon.tech), [Render](https://render.com) and
   [Vercel](https://vercel.com) (sign in with GitHub; connect the `kazzi-dev/trabahub` repo in
   Render and Vercel).
2. Create API keys:
   - Neon: Account settings → API keys
   - Render: Account settings → API keys; also copy your owner ID from the dashboard URL or
     Workspace settings (`usr-...` or `tea-...`)
   - Vercel: Account settings → Tokens
3. Install Terraform (`winget install HashiCorp.Terraform` on Windows), then:

   ```bash
   cd infra
   cp terraform.tfvars.example terraform.tfvars   # fill in the keys; this file is gitignored
   terraform init
   terraform plan
   terraform apply
   ```

4. `terraform output api_url` shows the API address. Open `<api_url>/health`.
5. Vercel builds the web app on the next push to `main` (or redeploy from the dashboard).
6. If Vercel gives the project a different address than `web_domain`, set `web_domain` to it and
   `terraform apply` again so the API allows it (CORS) and redirects sign-ins there.

## Route B: dashboards (fastest)

1. **Neon:** create a project (region Singapore) → copy the connection string.
2. **Render:** New → Web Service → connect `kazzi-dev/trabahub` → Runtime **Docker**,
   Dockerfile path `./apps/api/Dockerfile`, Docker context `.`, plan **Free**, region Singapore,
   health check path `/health`. Environment variables:

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | the Neon connection string |
   | `API_URL` | `https://<your-service>.onrender.com` |
   | `WEB_URL` | your Vercel URL (set after step 3) |
   | `JWT_SECRET` | a long random string (48+ characters) |
   | `DEMO_ENABLED` | `true` |

3. **Vercel:** Add New → Project → import `kazzi-dev/trabahub` → Root Directory `apps/web` →
   environment variable `NEXT_PUBLIC_API_URL` = your Render URL → Deploy.
4. Put the Vercel URL in Render's `WEB_URL` and save (Render redeploys).

## Optional: daily follow-up emails

1. Create a free [Resend](https://resend.com) account and an API key. Without your own domain,
   Resend's test sender (`onboarding@resend.dev`) only delivers to your own address, which is
   enough to demo it; verify a domain to email anyone.
2. On the API (Render), set `RESEND_API_KEY` and `CRON_SECRET` (any long random string; with
   Terraform it's generated: `terraform output -raw cron_secret`).
3. In the GitHub repo → Settings → Secrets and variables → Actions, add `API_URL` (your Render URL)
   and `CRON_SECRET` (the same value). The **Daily follow-up reminders** workflow then runs every
   day at 8:00 AM Philippine time; you can also run it by hand from the Actions tab.

## Optional: sign in with GitHub / Google

- **GitHub:** Settings → Developer settings → OAuth Apps → New. Homepage: your Vercel URL.
  Callback: `https://<api>/v1/auth/github/callback`. Set `GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET` on Render.
- **Google:** Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web).
  Redirect URI: `https://<api>/v1/auth/google/callback`. Set `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` on Render. (Creating an OAuth client doesn't need billing.)

The demo button works without either.

## Moving to Google Cloud Run or AWS later

The API is a standard Docker image listening on `$PORT`, configured only through environment
variables, so it runs unchanged on Cloud Run, AWS App Runner or ECS. Swap the `render_web_service`
resource in `infra/main.tf` for the matching Google or AWS resource, and point `DATABASE_URL` at
Cloud SQL / RDS or keep Neon.
