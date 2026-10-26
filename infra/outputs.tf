output "api_url" {
  description = "Public URL of the API (Swagger docs at /docs)."
  value       = render_web_service.api.url
}

output "web_project" {
  description = "Vercel project name."
  value       = vercel_project.web.name
}

output "database_url" {
  description = "PostgreSQL connection string (for running migrations or psql)."
  value       = neon_project.db.connection_uri
  sensitive   = true
}

output "cron_secret" {
  description = "Add this as the CRON_SECRET repository secret so the daily reminder job can call the API."
  value       = random_password.cron_secret.result
  sensitive   = true
}
