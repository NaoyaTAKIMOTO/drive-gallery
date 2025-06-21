# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Firebase Storage media gallery application that displays images, videos, and audio files in a web interface with real-time updates. It's designed for a Japanese music session group ("Luke Avenue") to share and view their event photos and videos.

## Tech Stack

- **Backend**: Go with Firebase Admin SDK
- **Frontend**: React + TypeScript + Vite
- **Database**: Google Cloud Firestore
- **File Storage**: Firebase Storage
- **Deployment**: GCP Cloud Run (backend) + Firebase Hosting (frontend)
- **Real-time Updates**: WebSocket connections

## Architecture

- **Backend**: Single Go binary (`main.go`) with modularized Firebase operations in `backend/` package
- **Frontend**: React SPA with React Router, React Query for state management
- **Data Flow**: Files stored in Firebase Storage → metadata in Firestore → API → React frontend
- **Real-time**: WebSocket notifications trigger React Query cache invalidation

## Common Development Commands

### Local Development
```bash
# Backend (from project root)
make run-local-backend
# or
PORT=8080 go run main.go

# Frontend (from project root)
make run-local-frontend
# or
cd frontend && npm install && npm run dev

# Build frontend for production
make frontend-build
# or
cd frontend && npm run build
```

### Deployment
```bash
# Deploy everything
make deploy

# Deploy backend only
make backend-deploy

# Deploy frontend only (after building)
make firebase-deploy

# Set CORS for Firebase Storage
make set-cors
```

### Linting/Type Checking
```bash
# Frontend
cd frontend && npm run lint
cd frontend && tsc -b  # Type check
```

## Environment Variables

### Required for Backend
- `GCP_PROJECT`: Firebase project ID (defaults to "drivegallery-460509")
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket name
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account key (local only)
- `PORT`: Server port (defaults to 8080)

### Required for Frontend
- `VITE_API_BASE_URL`: Backend API URL (e.g., "http://localhost:8080" for local)

## Key API Endpoints

- `GET /api/folders`: List logical folders from Firestore
- `GET /api/files/{folderId}`: List files in a folder (supports pagination & filtering)
- `GET /api/folder-name/{folderId}`: Get folder name by ID
- `GET /api/profiles`: List user profiles
- `POST /api/upload/file`: Upload files to Storage + save metadata to Firestore
- `POST /api/upload/icon`: Upload profile icons
- `POST /webhook`: Receive Firebase Storage change notifications
- `GET /ws`: WebSocket endpoint for real-time updates

## File Structure

### Backend (`backend/` package)
- `firebase.go`: Firebase/Firestore initialization and file operations
- `profiles.go`: User profile CRUD operations
- `webhook_handler.go`: Webhook processing for Storage changes
- `websocket.go`: WebSocket server for real-time updates

### Frontend (`frontend/src/`)
- `App.tsx`: Main component with routing and all page components
- `main.tsx`: React app entry point
- `App.css`: All styles

## Data Models

### Firestore Collections
- `files`: File metadata with deduplication via SHA256 hash
- `folders`: Logical folder structure
- `profiles`: User profile data

### Key Interfaces (TypeScript)
```typescript
interface FileMetadata {
  id: string;           // Firestore doc ID
  name: string;
  mimeType: string;
  storagePath: string;  // Firebase Storage path
  downloadUrl: string;
  folderId: string;     // References folder doc
  hash: string;         // SHA256 for deduplication
  createdAt: string;
}

interface FolderMetadata {
  id: string;
  name: string;
  createdAt: string;
}

interface Profile {
  id: string;
  name: string;
  bio: string;          // Supports Markdown
  icon_url: string;
}
```

## Key Features

### File Management
- Automatic deduplication based on content hash
- Pagination support for large file collections
- Filter by media type (image/video/all)
- Folder-based organization with metadata in Firestore

### Real-time Updates
- WebSocket connections notify frontend of storage changes
- React Query cache invalidation triggers UI updates
- Webhook endpoint receives Firebase Storage notifications

### User Profiles
- CRUD operations for member profiles
- Markdown support in bio field
- Icon upload to Firebase Storage with public URLs

## Development Notes

- Uses `webkitdirectory` for folder uploads (non-standard but widely supported)
- CORS configured for Firebase Storage bucket via `cors.json`
- All text is in Japanese for the target audience
- File uploads support both individual files and entire folder structures
- Implements proper error handling and loading states