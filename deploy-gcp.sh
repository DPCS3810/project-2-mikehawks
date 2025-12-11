#!/bin/bash
set -e

# Configuration
REGION="us-central1"
SERVICE_NAME="image-editor-backend"
DB_INSTANCE_NAME="image-editor-db"
REDIS_INSTANCE_NAME="image-editor-cache"
FIREBASE_SITE="" # Optional: Set if you have a specific site name

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting GCP Deployment for Image Editor${NC}"

# Check dependencies
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed.${NC}"
    exit 1
fi
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: firebase CLI is not installed. Install with: npm install -g firebase-tools${NC}"
    exit 1
fi

# 1. Project Setup
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo -e "${YELLOW}No active GCP project found.${NC}"
    read -p "Enter your GCP Project ID: " PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

echo -e "${GREEN}Using Project ID: $PROJECT_ID${NC}"

# Enable APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    redis.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    storage.googleapis.com \
    firestore.googleapis.com

# 2. Infrastructure (Simplified)
# Note: Full VPC setup is complex for a script. We'll use Cloud Run default networking.
# We assume the user might need to create DB manually or we can try.

echo -e "${YELLOW}Checking/Creating Artifact Registry...${NC}"
if ! gcloud artifacts repositories describe image-editor-repo --location=$REGION &>/dev/null; then
    gcloud artifacts repositories create image-editor-repo \
        --repository-format=docker \
        --location=$REGION \
        --description="Image Editor Docker Repository"
fi

# 3. Backend Deployment
echo -e "${YELLOW}Building and pushing backend image...${NC}"
cd backend
# Create a temporary production env file
cat > .env.production << EOL
PORT=8080
NODE_ENV=production
# DB and Redis will be injected by Cloud Run
EOL

gcloud builds submit --tag $REGION-docker.pkg.dev/$PROJECT_ID/image-editor-repo/$SERVICE_NAME:latest .

# Deploy Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
# Note: This command assumes Cloud SQL instance exists. If not, it will fail to connect but service will deploy.
# We'll skip DB connection arg if instance doesn't exist yet to allow first deploy.

gcloud run deploy $SERVICE_NAME \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/image-editor-repo/$SERVICE_NAME:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --set-env-vars NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,SKIP_DB_CHECK=true

cd ..

# 4. Frontend Deployment
echo -e "${YELLOW}Building frontend...${NC}"
cd frontend
# Get the Cloud Run URL
BACKEND_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')
echo "Backend URL: $BACKEND_URL"

# Create .env.production for frontend build
echo "VITE_API_URL=$BACKEND_URL" > .env.production
npm install
npm run build
cd ..

echo -e "${YELLOW}Configuring Firebase...${NC}"
# Generate firebase.json dynamically to avoid gitignore issues
cat > firebase.json << EOL
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "image-editor-backend",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
EOL

echo -e "${YELLOW}Deploying to Firebase Hosting...${NC}"
# User needs to be logged in to firebase
if ! firebase login --interactive --reauth=false &>/dev/null; then
  echo "Please log in to Firebase:"
  firebase login
fi

echo -e "${YELLOW}Linking Firebase Project...${NC}"
# Try to set alias, but don't fail if we can't (we'll use --project flag anyway)
firebase use --add $PROJECT_ID --alias default || true

echo -e "${YELLOW}Deploying to Firebase Hosting...${NC}"
# Use --non-interactive to avoid hanging Prompts
firebase deploy --only hosting --project $PROJECT_ID --non-interactive || echo -e "${RED}Firebase deploy failed. Please check console.${NC}"

echo -e "${GREEN}✅ Deployment Attempt Complete!${NC}"
echo -e "Backend: $BACKEND_URL"
echo -e "Frontend: (Check Firebase output above)"
