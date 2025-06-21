.PHONY: frontend-build backend-deploy firebase-deploy deploy clean run-local-backend run-local-frontend run-local

# Load environment variables from .env file
include .env

# Cloud Run サービス名とリージョン
CLOUD_RUN_SERVICE_NAME := drive-gallery-backend
CLOUD_RUN_REGION := asia-northeast1

frontend-build:
	@echo "--- Building frontend ---"
	cd frontend && npm install && npm run build

backend-deploy:
	@echo "--- Deploying backend to Cloud Run ---"
	gcloud run deploy $(CLOUD_RUN_SERVICE_NAME) --source . --region $(CLOUD_RUN_REGION) --allow-unauthenticated --platform managed --set-env-vars FIREBASE_STORAGE_BUCKET=drivegallery-460509.appspot.com

firebase-deploy:
	@echo "--- Deploying to Firebase Hosting ---"
	firebase deploy --only hosting

deploy: frontend-build backend-deploy firebase-deploy
	@echo "--- All deployments completed ---"

clean:
	@echo "--- Cleaning frontend build artifacts ---"
	rm -rf frontend/dist

set-cors:
	@echo "--- Setting CORS policy for Firebase Storage bucket ---"
	@echo "Ensure FIREBASE_STORAGE_BUCKET environment variable is set (e.g., in .env file)."
	gsutil cors set cors.json gs://$(shell grep FIREBASE_STORAGE_BUCKET .env | cut -d '=' -f2)

run-local-backend:
	@echo "--- Starting local backend server ---"
	PORT=8080 go run main.go

run-local-frontend:
	@echo "--- Starting local frontend development server ---"
	cd frontend && npm install && npm run dev

run-local: run-local-backend run-local-frontend
	@echo "--- Local development servers started ---"
	# Note: The above commands will run in parallel.
	# You might need to open two separate terminals and run each command manually
	# if you need to see their respective outputs or manage them independently.
	# For simplicity, we'll just list them here.
