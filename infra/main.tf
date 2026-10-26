# TrabaHub on free tiers: PostgreSQL on Neon, the Express API (Docker) on Render, and the
# Next.js web app on Vercel. Each push to main redeploys the API and web automatically.

# --- Database -----------------------------------------------------------------

resource "neon_project" "db" {
  name       = var.app_name
  region_id  = var.neon_region
  pg_version = 17
}

# --- API ----------------------------------------------------------------------

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "random_password" "cron_secret" {
  length  = 40
  special = false
}

resource "render_web_service" "api" {
  name              = "${var.app_name}-api"
  plan              = var.render_plan
  region            = var.render_region
  health_check_path = "/health"

  runtime_source = {
    docker = {
      repo_url        = "https://github.com/${var.github_repo}"
      branch          = "main"
      context         = "."
      dockerfile_path = "./apps/api/Dockerfile"
      auto_deploy     = true
      build_filter = {
        paths = ["apps/api/**", "packages/shared/**", "package-lock.json"]
      }
    }
  }

  env_vars = {
    NODE_ENV             = { value = "production" }
    DATABASE_URL         = { value = neon_project.db.connection_uri }
    API_URL              = { value = "https://${var.app_name}-api.onrender.com" }
    WEB_URL              = { value = var.web_domain }
    JWT_SECRET           = { value = random_password.jwt_secret.result }
    DEMO_ENABLED         = { value = "true" }
    GITHUB_CLIENT_ID     = { value = var.github_oauth_client_id }
    GITHUB_CLIENT_SECRET = { value = var.github_oauth_client_secret }
    GOOGLE_CLIENT_ID     = { value = var.google_oauth_client_id }
    GOOGLE_CLIENT_SECRET = { value = var.google_oauth_client_secret }
    CRON_SECRET          = { value = random_password.cron_secret.result }
    RESEND_API_KEY       = { value = var.resend_api_key }
  }
}

# --- Web ----------------------------------------------------------------------

resource "vercel_project" "web" {
  name           = var.app_name
  framework      = "nextjs"
  root_directory = "apps/web"

  git_repository = {
    type = "github"
    repo = var.github_repo
  }
}

resource "vercel_project_environment_variable" "api_url" {
  project_id = vercel_project.web.id
  key        = "NEXT_PUBLIC_API_URL"
  value      = render_web_service.api.url
  target     = ["production", "preview"]
}
