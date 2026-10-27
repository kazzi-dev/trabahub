variable "github_repo" {
  description = "GitHub repository as owner/name."
  type        = string
  default     = "kazzi-dev/trabahub"
}

variable "app_name" {
  description = "Base name for every resource."
  type        = string
  default     = "trabahub"
}

# --- Provider credentials (set in terraform.tfvars or TF_VAR_* environment variables) ---

variable "render_api_key" {
  description = "Render API key (Account Settings → API Keys)."
  type        = string
  sensitive   = true
}

variable "render_owner_id" {
  description = "Render workspace/owner ID (starts with usr- or tea-)."
  type        = string
}

variable "vercel_api_token" {
  description = "Vercel access token (Account Settings → Tokens)."
  type        = string
  sensitive   = true
}

variable "neon_api_key" {
  description = "Neon API key (Account Settings → API keys)."
  type        = string
  sensitive   = true
}

# --- Hosting choices ---

variable "render_region" {
  description = "Render region for the API; singapore is closest to the Philippines."
  type        = string
  default     = "singapore"
}

variable "render_plan" {
  description = "Render instance plan; free has no cost and sleeps when idle."
  type        = string
  default     = "free"
}

variable "neon_region" {
  description = "Neon region for PostgreSQL (aws-ap-southeast-1 = Singapore)."
  type        = string
  default     = "aws-ap-southeast-1"
}

# --- App settings ---

variable "web_domain" {
  description = "Public URL of the web app, used for CORS and OAuth redirects."
  type        = string
  default     = "https://trabahub-six.vercel.app"
}

variable "github_oauth_client_id" {
  description = "GitHub OAuth app client ID (optional; demo sign-in works without it)."
  type        = string
  default     = ""
}

variable "github_oauth_client_secret" {
  description = "GitHub OAuth app client secret."
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_oauth_client_id" {
  description = "Google OAuth client ID (optional)."
  type        = string
  default     = ""
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret."
  type        = string
  default     = ""
  sensitive   = true
}

variable "resend_api_key" {
  description = "Resend API key for follow-up emails (optional; without it emails are only logged)."
  type        = string
  default     = ""
  sensitive   = true
}
