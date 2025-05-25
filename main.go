package main

import (
	// "context" // No longer directly used in main.go
	"encoding/json"
	"fmt"
	"io/ioutil" // Added for ioutil.ReadAll
	"log"
	"net/http"
	"os"      // Added for os.Getenv
	"strconv" // Added for parsing pageSize
	"strings" // Added for path parsing
	"time"    // Added for time.Sleep

	"drive-gallery/backend" // Import the local backend package
	"context" // Added for context.Background

	"github.com/joho/godotenv" // Added for .env file loading
)

// var driveService *drive.Service // Global variable for Drive service - will use backend.DriveService

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil { // errを再利用
		log.Printf("WARNING: Error loading .env file: %v (This is normal if not running locally with a .env file)", err)
	}

	// Log environment variables for debugging
	// log.Printf("DEBUG: DATABASE_URL: %s", os.Getenv("DATABASE_URL")) // No longer using DATABASE_URL
	// dbPassword := os.Getenv("DB_PASSWORD") // No longer using DB_PASSWORD
	// if len(dbPassword) > 4 {
	// 	log.Printf("DEBUG: DB_PASSWORD: %s...", dbPassword[:4]) // Mask password
	// } else {
	// 	log.Printf("DEBUG: DB_PASSWORD: %s", dbPassword)
	// }

	// Initialize Firebase
	// For local development, set GOOGLE_APPLICATION_CREDENTIALS to the path of your service account key JSON file.
	// For Cloud Run, ensure the Cloud Run service account has necessary permissions for Firestore.
	// The FIREBASE_PROJECT_ID environment variable should be set.
	serviceAccountJSONPath := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS") // Optional: for local dev
	projectID := os.Getenv("GCP_PROJECT") // Cloud Run will set this, or use gcloud config get-value project
	if projectID == "" {
		projectID = "drivegallery-460509" // Fallback for local testing if GCP_PROJECT is not set
	}

	ctx := context.Background()
	err := backend.InitFirebase(ctx, projectID, serviceAccountJSONPath)
	if err != nil {
		log.Printf("ERROR: Unable to initialize Firebase: %v. Exiting in 30s.", err)
		time.Sleep(30 * time.Second) // Give time to view logs
		os.Exit(1)
	}
	// defer backend.Client.Close() // Close Firestore client when main exits - Client.Close() is available from v1.9.0

	// Initialize Google Drive Service using Service Account
	// For Cloud Run, this will use the attached service account.
	// For local development, ensure GOOGLE_APPLICATION_CREDENTIALS is set or gcloud auth application-default login has been run.
	err = backend.InitDriveService(serviceAccountJSONPath) // Pass the service account JSON path
	if err != nil {
		log.Printf("ERROR: Unable to initialize Drive service: %v. Exiting in 30s.", err)
		time.Sleep(30 * time.Second) // Give time to view logs
		os.Exit(1)
	}

	// Set up HTTP routes
	http.HandleFunc("/api/folders", foldersHandler)
	http.HandleFunc("/api/files/", filesHandler)            // Note the trailing slash for path prefix matching
	http.HandleFunc("/api/folder-name/", folderNameHandler) // New handler for folder names
	http.HandleFunc("/api/profiles", profilesHandler)
	http.HandleFunc("/api/profiles/", profileHandler) // For PUT /api/profiles/{id}
	http.HandleFunc("/api/upload/icon", uploadIconHandler)
	http.HandleFunc("/webhook", webhookHandler)
	http.HandleFunc("/ws", wsHandler)

	backend.InitHub()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	serverAddr := fmt.Sprintf(":%s", port)
	log.Printf("Backend server listening on %s", serverAddr)
	err = http.ListenAndServe(serverAddr, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}

func setCorsHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*") // Be more specific in production
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS") // Added PUT and DELETE
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Goog-Channel-ID, X-Goog-Resource-State, X-Goog-Resource-ID, X-Goog-Message-Number")
	// Allow embedding from self, Vite dev server, and Google Drive
	w.Header().Set("Content-Security-Policy", "frame-ancestors 'self' http://localhost:5173 https://drive.google.com;")
}

func foldersHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	folders, err := backend.ListFoldersInRootFolder(backend.DriveService) // Use backend.DriveService
	if err != nil {
		log.Printf("Error listing root folders: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Unable to list root folders: %v", err)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"data": folders})
}

func filesHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract folderID from path: /api/files/{folderId}
	// Example: /api/files/someFolderIdHere
	// TrimPrefix will remove "/api/files/" leaving "someFolderIdHere"
	// If the path was /api/files/someFolderIdHere/anythingelse, parts would be ["someFolderIdHere", "anythingelse"]
	// We only care about the first part.
	folderIDComponent := strings.TrimPrefix(r.URL.Path, "/api/files/")
	if folderIDComponent == "" || strings.Contains(folderIDComponent, "/") { // Ensure it's a direct child and not empty
		http.Error(w, "Folder ID is missing or invalid in path", http.StatusBadRequest)
		return
	}
	folderID := folderIDComponent

	// Parse query parameters for pagination
	pageSizeStr := r.URL.Query().Get("pageSize")
	pageToken := r.URL.Query().Get("pageToken")

	var pageSize int64 = 100 // Default page size
	if pageSizeStr != "" {
		parsedSize, err := strconv.ParseInt(pageSizeStr, 10, 64)
		if err == nil && parsedSize > 0 {
			pageSize = parsedSize
		} else {
			log.Printf("Invalid pageSize parameter: %s, using default %d", pageSizeStr, pageSize)
		}
	}

	filterType := r.URL.Query().Get("filter") // Get filter parameter

	files, nextPageToken, err := backend.ListFilesInFolder(backend.DriveService, folderID, pageSize, pageToken, filterType)
	if err != nil {
		log.Printf("Error listing files for folder %s: %v", folderID, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Unable to list files: %v", err)})
		return
	}

	// Log MIME types for debugging
	for _, file := range files {
		log.Printf("Backend: File Name: %s, MIME Type: %s", file.Name, file.MimeType)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":          files,
		"nextPageToken": nextPageToken,
	})
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	// Assuming backend.WebhookHandler handles its own method checks if necessary
	backend.WebhookHandler(w, r)
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	// WebSocket upgrader handles CORS checks via CheckOrigin in backend.ServeWs
	// No need to call setCorsHeaders(w) here if CheckOrigin is restrictive enough.
	// However, if ServeWs doesn't handle OPTIONS or if there are other preflight concerns,
	// you might need more complex logic or ensure CheckOrigin allows OPTIONS.
	// For simplicity, assuming ServeWs and its upgrader manage this.
	backend.ServeWs(w, r)
}

func folderNameHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	folderIDComponent := strings.TrimPrefix(r.URL.Path, "/api/folder-name/")
	if folderIDComponent == "" || strings.Contains(folderIDComponent, "/") {
		http.Error(w, "Folder ID is missing or invalid in path", http.StatusBadRequest)
		return
	}
	folderID := folderIDComponent

	folderName, err := backend.GetFolderName(backend.DriveService, folderID)
	if err != nil {
		log.Printf("Error retrieving folder name for ID %s: %v", folderID, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Unable to retrieve folder name: %v", err)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"name": folderName})
}

// Profile represents a member's profile (re-declared for handler scope, or import backend.Profile)
// For simplicity, we'll use backend.Profile directly.

func profilesHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	ctx := r.Context() // Use request context

	switch r.Method {
	case http.MethodGet:
		profiles, err := backend.GetProfiles(ctx)
		if err != nil {
			log.Printf("Error getting profiles: %v", err)
			http.Error(w, "Unable to get profiles", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"data": profiles})
	case http.MethodPost:
		var profile backend.Profile
		if err := json.NewDecoder(r.Body).Decode(&profile); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		// IconURL might come from a separate upload step or be included here
		// For now, assume it's part of the profile struct if provided
		id, err := backend.CreateProfile(ctx, profile)
		if err != nil {
			log.Printf("Error creating profile: %v", err)
			http.Error(w, "Unable to create profile", http.StatusInternalServerError)
			return
		}
		profile.ID = id // Firestore returns string ID
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(profile)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func profileHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	ctx := r.Context() // Use request context

	// Extract profile ID from path: /api/profiles/{id}
	// For Firestore, ID is a string
	profileID := strings.TrimPrefix(r.URL.Path, "/api/profiles/")
	if profileID == "" {
		http.Error(w, "Profile ID is missing in path", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet: // Added GET /api/profiles/{id}
		profile, err := backend.GetProfile(ctx, profileID)
		if err != nil {
			log.Printf("Error getting profile %s: %v", profileID, err)
			http.Error(w, "Unable to get profile", http.StatusInternalServerError)
			return
		}
		if profile == nil {
			http.Error(w, "Profile not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(profile)

	case http.MethodPut:
		var profileData backend.Profile
		if err := json.NewDecoder(r.Body).Decode(&profileData); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		// profileData.ID will be ignored by UpdateProfile, profileID from path is used.

		if err := backend.UpdateProfile(ctx, profileID, profileData); err != nil {
			log.Printf("Error updating profile %s: %v", profileID, err)
			http.Error(w, "Unable to update profile", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated successfully"})

	case http.MethodDelete: // Added DELETE /api/profiles/{id}
		if err := backend.DeleteProfile(ctx, profileID); err != nil {
			log.Printf("Error deleting profile %s: %v", profileID, err)
			// Consider if not found should be a different status code or handled as success
			http.Error(w, "Unable to delete profile", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Profile deleted successfully"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func uploadIconHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form data, 10MB limit for file size
	err := r.ParseMultipartForm(10 << 20) // 10 MB
	if err != nil {
		http.Error(w, fmt.Sprintf("Error parsing form: %v", err), http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("icon") // "icon" is the field name for the file input
	if err != nil {
		http.Error(w, fmt.Sprintf("Error retrieving file from form: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	fileBytes, err := ioutil.ReadAll(file)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error reading file: %v", err), http.StatusInternalServerError)
		return
	}

	// Upload to Google Drive
	webViewLink, err := backend.UploadFileToDrive(backend.DriveService, handler.Filename, handler.Header.Get("Content-Type"), fileBytes)
	if err != nil {
		log.Printf("Error uploading file to Drive: %v", err)
		http.Error(w, "Error uploading file to Google Drive", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"icon_url": webViewLink})
}
