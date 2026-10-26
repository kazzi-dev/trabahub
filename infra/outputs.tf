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
