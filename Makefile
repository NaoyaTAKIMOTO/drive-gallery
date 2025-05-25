.PHONY: frontend-build backend-deploy firebase-deploy deploy clean

# Cloud Run サービス名とリージョン
CLOUD_RUN_SERVICE_NAME := drive-gallery-backend
CLOUD_RUN_REGION := asia-northeast1

frontend-build:
	@echo "--- Building frontend ---"
	cd frontend && npm install && npm run build

backend-deploy:
	@echo "--- Deploying backend to Cloud Run ---"
	gcloud run deploy $(CLOUD_RUN_SERVICE_NAME) --source . --region $(CLOUD_RUN_REGION) --allow-unauthenticated --platform managed

firebase-deploy:
	@echo "--- Deploying to Firebase Hosting ---"
	firebase deploy --only hosting

deploy: frontend-build backend-deploy firebase-deploy
	@echo "--- All deployments completed ---"

clean:
	@echo "--- Cleaning frontend build artifacts ---"
	rm -rf frontend/dist
