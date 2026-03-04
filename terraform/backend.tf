# State stored in GCS — same bucket as openclaw, different prefix.
# Init: terraform init -backend-config="bucket=chrome-encoder-462319-f6-openclaw-terraform-state" -backend-config="prefix=argus"
terraform {
  backend "gcs" {}
}
