.PHONY: frontend-build backend-deploy firebase-deploy deploy clean run-local-backend run-local-frontend run-local test test-frontend test-backend test-e2e test-essential test-quick install-hooks

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
	firebase deploy --only hosting --config config/firebase.json

deploy: frontend-build backend-deploy firebase-deploy
	@echo "--- All deployments completed ---"

clean:
	@echo "--- Cleaning frontend build artifacts ---"
	rm -rf frontend/dist

set-cors:
	@echo "--- Setting CORS policy for Firebase Storage bucket ---"
	@echo "Ensure FIREBASE_STORAGE_BUCKET environment variable is set (e.g., in .env file)."
	gsutil cors set config/cors.json gs://$(shell grep FIREBASE_STORAGE_BUCKET .env | cut -d '=' -f2)

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

test: test-frontend test-backend
	@echo "--- All tests completed ---"

test-frontend:
	@echo "--- Running frontend tests ---"
	cd frontend && npm run test:run

test-backend:
	@echo "--- Running backend tests ---"
	go test -v ./...

test-e2e:
	@echo "--- Running E2E tests ---"
	npm run test:e2e

test-coverage:
	@echo "--- Running tests with coverage ---"
	cd frontend && npm run test:coverage
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

test-essential:
	@echo "--- Running essential tests (for pre-push) ---"
	@echo "🧪 Frontend unit tests..."
	cd frontend && npm run test:run
	@echo "🧪 Backend unit tests..."
	go test ./... -short

test-quick:
	@echo "--- Running quick tests ---"
	@echo "🧪 Frontend lint..."
	cd frontend && npm run lint
	@echo "🧪 Backend vet..."
	go vet ./...
	@echo "🧪 Backend build check..."
	go build -v ./...

install-hooks:
	@echo "--- Installing Git hooks ---"
	@if [ ! -f .git/hooks/pre-push ]; then \
		echo "Installing pre-push hook..."; \
		cp scripts/pre-push .git/hooks/pre-push; \
		chmod +x .git/hooks/pre-push; \
		echo "✅ Pre-push hook installed"; \
	else \
		echo "✅ Pre-push hook already exists"; \
	fi
	@if [ ! -f .git/hooks/pre-commit ]; then \
		echo "Installing pre-commit hook..."; \
		cp scripts/pre-commit .git/hooks/pre-commit; \
		chmod +x .git/hooks/pre-commit; \
		echo "✅ Pre-commit hook installed"; \
	else \
		echo "✅ Pre-commit hook already exists"; \
	fi
