# Deployment Guide - Image Editor (Cloud-Ready)

This guide covers deploying the Image Editor application to Google Cloud Platform.

## Prerequisites

- Google Cloud Platform account
- `gcloud` CLI installed and configured
- Docker installed locally
- Domain name (optional, for custom domain)

## Architecture Overview

The application uses the following GCP services:
- **Cloud Run**: Serverless container hosting for the API
- **Cloud Storage**: Object storage for images (3 buckets)
- **Cloud SQL**: PostgreSQL database for metadata
- **Memorystore**: Redis cache for thumbnails
- **Cloud CDN**: Edge caching for static assets
- **Cloud Build**: CI/CD pipeline

## Step 1: Initial Setup

### 1.1 Create GCP Project

```bash
# Create new project
gcloud projects create YOUR_PROJECT_ID --name="Image Editor"

# Set as active project
gcloud config set project YOUR_PROJECT_ID

# Enable billing (required for Cloud Run, Cloud SQL, etc.)
# Visit: https://console.cloud.google.com/billing
```

### 1.2 Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

## Step 2: Set Up Cloud Storage

### 2.1 Create Buckets

```bash
# Set variables
export PROJECT_ID=YOUR_PROJECT_ID
export REGION=us-central1

# Create buckets
gsutil mb -l $REGION gs://${PROJECT_ID}-raw
gsutil mb -l $REGION gs://${PROJECT_ID}-results
gsutil mb -l $REGION gs://${PROJECT_ID}-thumb

# Set lifecycle policies (24h auto-delete)
cat > lifecycle.json << EOF
{
  "lifecycle": {
    "rule": [{
      "action": {"type": "Delete"},
      "condition": {"age": 1}
    }]
  }
}
EOF

gsutil lifecycle set lifecycle.json gs://${PROJECT_ID}-raw
gsutil lifecycle set lifecycle.json gs://${PROJECT_ID}-results
gsutil lifecycle set lifecycle.json gs://${PROJECT_ID}-thumb
```

### 2.2 Set CORS for Frontend Access

```bash
cat > cors.json << EOF
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set cors.json gs://${PROJECT_ID}-thumb
```

## Step 3: Set Up Cloud SQL (PostgreSQL)

### 3.1 Create Instance

```bash
gcloud sql instances create image-editor-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=$REGION \
  --root-password=CHANGE_THIS_PASSWORD \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup-start-time=03:00
```

### 3.2 Create Database

```bash
gcloud sql databases create image_editor \
  --instance=image-editor-db
```

### 3.3 Get Connection Name

```bash
gcloud sql instances describe image-editor-db \
  --format='value(connectionName)'
# Save this for later: PROJECT_ID:REGION:image-editor-db
```

## Step 4: Set Up Memorystore (Redis)

```bash
gcloud redis instances create image-editor-cache \
  --size=1 \
  --region=$REGION \
  --redis-version=redis_7_0 \
  --tier=basic

# Get Redis host
gcloud redis instances describe image-editor-cache \
  --region=$REGION \
  --format='value(host)'
```

## Step 5: Set Up Secrets

```bash
# Create secrets for sensitive data
echo -n "your-postgres-password" | \
  gcloud secrets create postgres-password --data-file=-

echo -n "redis://REDIS_HOST:6379" | \
  gcloud secrets create redis-url --data-file=-
```

## Step 6: Build and Deploy Backend

### 6.1 Build Container Image

```bash
cd backend

# Build and push to Container Registry
gcloud builds submit --tag gcr.io/$PROJECT_ID/image-editor-api
```

### 6.2 Deploy to Cloud Run

```bash
gcloud run deploy image-editor-api \
  --image gcr.io/$PROJECT_ID/image-editor-api \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 20 \
  --timeout 60s \
  --set-env-vars "NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_PREFIX=$PROJECT_ID" \
  --set-secrets "POSTGRES_PASSWORD=postgres-password:latest,REDIS_URL=redis-url:latest" \
  --add-cloudsql-instances PROJECT_ID:REGION:image-editor-db

# Get the service URL
gcloud run services describe image-editor-api \
  --region $REGION \
  --format='value(status.url)'
```

## Step 7: Deploy Frontend

### 7.1 Build Frontend

```bash
cd frontend

# Set API URL
export VITE_API_URL=https://YOUR_CLOUD_RUN_URL

# Build
npm run build
```

### 7.2 Deploy to Firebase Hosting (Option 1)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init hosting

# Deploy
firebase deploy --only hosting
```

### 7.2 Deploy to Cloud Storage + CDN (Option 2)

```bash
# Create bucket for frontend
gsutil mb -l $REGION gs://${PROJECT_ID}-frontend

# Make bucket public
gsutil iam ch allUsers:objectViewer gs://${PROJECT_ID}-frontend

# Upload files
gsutil -m cp -r dist/* gs://${PROJECT_ID}-frontend/

# Set up Cloud CDN
gcloud compute backend-buckets create frontend-backend \
  --gcs-bucket-name=${PROJECT_ID}-frontend \
  --enable-cdn
```

## Step 8: Set Up CI/CD (Optional)

### 8.1 Create Cloud Build Trigger

```yaml
# cloudbuild.yaml
steps:
  # Build backend
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/image-editor-api', './backend']
  
  # Push to registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/image-editor-api']
  
  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'image-editor-api'
      - '--image'
      - 'gcr.io/$PROJECT_ID/image-editor-api'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'

images:
  - 'gcr.io/$PROJECT_ID/image-editor-api'
```

## Step 9: Monitoring and Alerts

### 9.1 Set Up Budget Alerts

```bash
# Create budget alert at 80% threshold
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="Image Editor Budget" \
  --budget-amount=50USD \
  --threshold-rule=percent=80
```

### 9.2 Set Up Uptime Checks

```bash
# Create uptime check
gcloud monitoring uptime create image-editor-health \
  --resource-type=uptime-url \
  --host=YOUR_CLOUD_RUN_URL \
  --path=/health
```

## Step 10: Verify Deployment

### 10.1 Test API

```bash
# Health check
curl https://YOUR_CLOUD_RUN_URL/health

# Upload test image
curl -X POST https://YOUR_CLOUD_RUN_URL/v1/images \
  -F "image=@test.jpg"
```

### 10.2 Check Logs

```bash
# View Cloud Run logs
gcloud run services logs read image-editor-api \
  --region $REGION \
  --limit 50
```

## Cost Optimization

1. **Cloud Run**: Auto-scales to 0, only pay for requests
2. **Cloud Storage**: Lifecycle policies delete old files
3. **Cloud SQL**: Use smallest tier (db-f1-micro) for dev
4. **Redis**: Basic tier sufficient for caching
5. **CDN**: Reduces egress costs

**Estimated Monthly Cost (Low Traffic):**
- Cloud Run: $5-10
- Cloud SQL: $10-15
- Redis: $5
- Cloud Storage: $2-5
- **Total: ~$20-35/month**

## Troubleshooting

### Cloud Run won't start
- Check logs: `gcloud run services logs read image-editor-api`
- Verify environment variables are set
- Ensure Cloud SQL connection is configured

### Database connection fails
- Verify Cloud SQL instance is running
- Check connection name in Cloud Run config
- Ensure service account has Cloud SQL Client role

### Images not uploading
- Verify bucket permissions
- Check CORS configuration
- Ensure service account has Storage Object Admin role

## Security Checklist

- [ ] Change default PostgreSQL password
- [ ] Use Secret Manager for credentials
- [ ] Enable VPC Service Controls
- [ ] Set up IAM least privilege
- [ ] Enable Cloud Armor (DDoS protection)
- [ ] Configure custom domain with SSL
- [ ] Set up audit logging
- [ ] Enable Cloud Security Scanner

## Next Steps

1. Set up custom domain
2. Configure Cloud CDN for API
3. Implement authentication (Firebase Auth)
4. Add monitoring dashboards
5. Set up automated backups
6. Implement rate limiting per user
7. Add batch processing worker
