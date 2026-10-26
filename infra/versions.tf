terraform {
  required_version = ">= 1.6"

  required_providers {
    render = {
      source  = "render-oss/render"
      version = "~> 1.7"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 3.0"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.9"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "render" {
  api_key  = var.render_api_key
  owner_id = var.render_owner_id
}

provider "vercel" {
  api_token = var.vercel_api_token
}

provider "neon" {
  api_key = var.neon_api_key
}
