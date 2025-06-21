# Luke Avenue - Drive Gallery

A Firebase Storage media gallery application for the Luke Avenue music session group. Share and view event photos and videos with real-time updates.

## 🎵 About Luke Avenue

Luke Avenue is a Japanese music session group that organizes regular live performance events. This gallery application helps members share and view photos and videos from their sessions.

## ✨ Features

- **📸 Media Gallery**: View photos and videos organized by event folders
- **📁 Folder Organization**: Logical folder structure with metadata management
- **🔄 Real-time Updates**: WebSocket notifications for instant content updates
- **👥 Member Profiles**: User profiles with markdown bio support
- **📱 Responsive Design**: Works on desktop and mobile devices
- **⚡ Performance**: Pagination, filtering, and intelligent caching
- **🔒 Secure**: Firebase Authentication and Storage rules
- **🌐 Multilingual**: Japanese interface for target audience

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│                 │    │                  │    │                     │
│  React Frontend │◄──►│   Go Backend     │◄──►│  Firebase Services  │
│  (TypeScript)   │    │  (REST API +     │    │  • Storage          │
│                 │    │   WebSocket)     │    │  • Firestore        │
└─────────────────┘    └──────────────────┘    │  • Authentication   │
                                                └─────────────────────┘
```

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + React Query
- **Backend**: Go 1.23 + Firebase Admin SDK
- **Database**: Google Cloud Firestore
- **Storage**: Firebase Storage
- **Real-time**: WebSocket connections
- **Deployment**: GCP Cloud Run + Firebase Hosting

## 📊 Current Project Status

### ✅ **Production Ready Features**
- **Backend API**: Fully functional Go server with Firebase integration
- **Frontend UI**: Complete React application with real-time updates
- **File Management**: Upload, view, and organize media files by events
- **Profile System**: Member profiles with markdown bios and icons
- **Real-time Updates**: WebSocket notifications for live gallery updates
- **Security**: Firebase Storage rules and authentication

### 📁 **Media Content**
Currently hosting **825+ files** from Luke Avenue events:
- **第1回** (Event 1): 42 photos
- **第3回** (Event 3): 23 photos  
- **第4回** (Event 4): 87 photos
- **第5回** (Event 5): 226 photos
- **第6回** (Event 6): 82 photos
- **第7回** (Event 7): 125 photos
- **第8回** (Event 8): 240+ photos & videos

> **⚠️ Note**: The `LukeAvenue/` directory is excluded from git tracking due to large file sizes. Consider using Git LFS for production or store media files directly in Firebase Storage.

### 🔧 **Development Tools**
- **Metadata Updater**: CLI tool for bulk Firestore updates
- **File Uploader**: Batch upload utility for event media
- **Build System**: Makefile automation for development and deployment
- **Configuration**: Organized config files for Firebase and deployment

### 🚀 **Deployment Status**
- **Backend**: Ready for Cloud Run deployment
- **Frontend**: Ready for Firebase Hosting deployment  
- **Database**: Firestore schema implemented
- **Storage**: Firebase Storage configured with CORS

## 🚀 Quick Start

### Prerequisites

- **Go 1.23+**
- **Node.js 18+**
- **Google Cloud Project** with Firebase enabled
- **Firebase CLI** for deployment

### 1. Clone and Setup

```bash
git clone <repository-url>
cd drive-gallery
```

### 2. Backend Setup

```bash
# Install Go dependencies
go mod download

# Setup environment variables
cp .env.example .env
# Edit .env with your Firebase project details

# Place your Firebase service account key
cp path/to/your/service-account.json backend/credentials.json
```

### 3. Frontend Setup

```bash
cd frontend
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your API URL
```

### 4. Local Development

```bash
# Start backend (from project root)
make run-local-backend
# or: PORT=8080 go run main.go

# Start frontend (in another terminal)
make run-local-frontend
# or: cd frontend && npm run dev
```

Visit `http://localhost:5173` to see the application.

## 📝 Environment Variables

### Backend (.env)
```bash
GCP_PROJECT=your-firebase-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
GOOGLE_APPLICATION_CREDENTIALS=backend/credentials.json
PORT=8080
```

### Frontend (frontend/.env.local)
```bash
VITE_API_BASE_URL=http://localhost:8080
```

## 🏗️ Development Commands

### Local Development
```bash
make run-local-backend    # Start Go backend server
make run-local-frontend   # Start React dev server
make run-local           # Start both (see Makefile for parallel execution)
```

### Building
```bash
make frontend-build      # Build React app for production
go build -o drive-gallery main.go  # Build Go binary

# Build CLI tools
cd tools/metadata-updater && go build -o updater main.go
cd tools/uploader && go build -o uploader main.go
```

### Deployment
```bash
make deploy             # Deploy everything (backend + frontend)
make backend-deploy     # Deploy backend to Cloud Run
make firebase-deploy    # Deploy frontend to Firebase Hosting
```

### Utilities
```bash
make set-cors          # Configure CORS for Firebase Storage
make clean             # Clean build artifacts
```

## 🌐 API Documentation

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/folders` | List all folders |
| `GET` | `/api/files/{folderId}` | List files in folder (supports pagination & filtering) |
| `GET` | `/api/folder-name/{folderId}` | Get folder name |
| `POST` | `/api/upload/file` | Upload files to storage |

### Profile Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/profiles` | List all profiles |
| `POST` | `/api/profiles` | Create new profile |
| `GET` | `/api/profiles/{id}` | Get specific profile |
| `PUT` | `/api/profiles/{id}` | Update profile |
| `DELETE` | `/api/profiles/{id}` | Delete profile |
| `POST` | `/api/upload/icon` | Upload profile icon |

### Real-time & Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/ws` | WebSocket endpoint for real-time updates |
| `POST` | `/webhook` | Firebase Storage change notifications |

## 📁 Project Structure

```
drive-gallery/
├── README.md                    # This file
├── CLAUDE.md                   # Claude Code guidance
├── Makefile                    # Development commands
├── Dockerfile                  # Container configuration
├── go.mod, go.sum             # Go dependencies
├── main.go                    # Go backend entry point
├── service.yaml               # Cloud Run deployment config
│
├── backend/                   # Backend Go modules
│   ├── firebase.go           # Firebase/Firestore operations
│   ├── profiles.go           # Profile management
│   ├── webhook_handler.go    # Storage change webhooks
│   └── websocket.go          # WebSocket server
│
├── frontend/                  # React TypeScript frontend
│   ├── package.json          # Node.js dependencies
│   ├── vite.config.ts        # Vite configuration
│   ├── tsconfig.json         # TypeScript configuration
│   ├── src/
│   │   ├── App.tsx           # Main React component
│   │   ├── App.css           # Application styles
│   │   └── main.tsx          # React entry point
│   └── dist/                 # Built frontend (generated)
│
├── tools/                     # CLI utilities
│   ├── metadata-updater/     # Firestore metadata management
│   │   ├── main.go          # CLI tool source
│   │   ├── go.mod, go.sum   # Tool dependencies
│   │   └── updater          # Built binary (ignored by git)
│   ├── uploader/            # Batch file upload tool
│   │   ├── main.go          # CLI tool source
│   │   ├── go.mod           # Tool dependencies
│   │   └── uploader         # Built binary (ignored by git)
│   └── README.md            # Tools documentation
│
├── config/                    # Configuration files
│   ├── firebase.json         # Firebase project configuration
│   ├── storage.rules         # Firebase Storage security rules
│   ├── cors.json             # Storage CORS configuration
│   └── README.md             # Configuration documentation
│
└── LukeAvenue/                # Event media files (excluded from git)
    ├── 第1回/                # Event 1 photos (42 images)
    ├── 第3回/                # Event 3 photos (23 images)
    ├── 第4回/                # Event 4 photos (87 images)
    ├── 第5回/                # Event 5 photos (226 images)
    ├── 第6回/                # Event 6 photos (82 images)
    ├── 第7回/                # Event 7 photos (125 images)
    └── 第8回/                # Event 8 photos & videos (240+ files)
```

## 🔧 Configuration Files

### Firebase Configuration

- **`firebase.json`**: Hosting and Storage rules configuration
- **`storage.rules`**: Security rules for Firebase Storage
- **`cors.json`**: CORS policy for Storage bucket
- **`service.yaml`**: Cloud Run deployment configuration

### Development Configuration

- **`Makefile`**: Development and deployment commands
- **`.gitignore`**: Comprehensive ignore patterns for security and cleanliness
- **`CLAUDE.md`**: AI assistant guidance for code maintenance

## 🔐 Security Features

- **Firebase Storage Rules**: Authenticated write access, public read access
- **Service Account Authentication**: Secure backend access to Firebase
- **Content Deduplication**: SHA256 hash-based duplicate prevention
- **Input Validation**: Comprehensive request validation
- **CORS Configuration**: Proper cross-origin resource sharing

## 📊 Data Models

### File Metadata (Firestore)
```typescript
interface FileMetadata {
  id: string;           // Firestore document ID
  name: string;         // Original filename
  mimeType: string;     // File MIME type
  storagePath: string;  // Firebase Storage path
  downloadUrl: string;  // Public download URL
  folderId: string;     // Reference to folder
  hash: string;         // SHA256 for deduplication
  createdAt: string;    // ISO timestamp
}
```

### Folder Metadata (Firestore)
```typescript
interface FolderMetadata {
  id: string;       // Folder ID (UUID)
  name: string;     // Display name (e.g., "第1回")
  createdAt: string; // ISO timestamp
}
```

### User Profile (Firestore)
```typescript
interface Profile {
  id: string;       // Profile ID
  name: string;     // Member name
  bio: string;      // Markdown biography
  icon_url: string; // Profile icon URL
}
```

## 🚀 Deployment

### Cloud Run Backend

1. **Build and deploy**:
   ```bash
   make backend-deploy
   ```

2. **Environment variables** are set via `service.yaml`

3. **Service account** needs these roles:
   - Firebase Data Viewer/Editor
   - Storage Object Admin
   - (Optional) Secret Manager Secret Accessor

### Firebase Hosting Frontend

1. **Build and deploy**:
   ```bash
   make frontend-build
   make firebase-deploy
   ```

2. **Domain configuration** in Firebase Console

### Required GCP Services

- Cloud Run API
- Cloud Firestore (Native mode)
- Firebase Storage
- Firebase Hosting

## 🔄 Real-time Updates

The application uses WebSocket connections to provide real-time updates:

1. **Frontend** connects to `/ws` endpoint
2. **Backend** receives Firebase Storage webhooks at `/webhook`
3. **Changes** are broadcast to all connected clients
4. **React Query** cache is invalidated triggering UI updates

## 📱 Usage

### For Members

1. **Browse Events**: Click on folder names to view event photos/videos
2. **Filter Content**: Use photo/video filters to find specific media
3. **View Profiles**: Check member profiles and bios
4. **Upload Content**: Use the upload feature to add new photos/videos

### For Administrators

1. **Manage Profiles**: Create/edit/delete member profiles
2. **Upload Events**: Bulk upload entire event folders
3. **Monitor Activity**: Check logs for system activity

## 🤝 Contributing

1. **Follow coding standards** defined in existing code
2. **Test thoroughly** before submitting changes
3. **Update documentation** for new features
4. **Respect security practices** - never commit credentials

## 🆘 Troubleshooting

### Common Issues

**Backend fails to start**:
- Check Firebase credentials are properly configured
- Ensure GCP project ID is correct
- Verify Firestore database exists

**Frontend can't connect to backend**:
- Check `VITE_API_BASE_URL` environment variable
- Ensure backend is running on expected port
- Verify CORS configuration

**File uploads fail**:
- Check Firebase Storage rules
- Verify service account permissions
- Ensure Storage bucket exists

### Getting Help

- Check `CLAUDE.md` for development guidance
- Review logs in Cloud Run console
- Test with `make run-local-backend` for debugging

---

Built with ❤️ for Luke Avenue music sessions