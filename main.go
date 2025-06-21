package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io" // Add io import
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"drive-gallery/backend"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("WARNING: Error loading .env file: %v (This is normal if not running locally with a .env file)", err)
	}

	serviceAccountJSONPath := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
	projectID := os.Getenv("GCP_PROJECT")
	if projectID == "" {
		projectID = "drivegallery-460509" // Fallback for local testing if GCP_PROJECT is not set
	}

	ctx := context.Background()
	err := backend.InitFirebase(ctx, projectID, serviceAccountJSONPath)
	if err != nil {
		log.Printf("ERROR: Unable to initialize Firebase: %v. Exiting in 30s.", err)
		time.Sleep(30 * time.Second)
		os.Exit(1)
	}

	// Set up HTTP routes
	http.HandleFunc("/api/folders", foldersHandler)
	http.HandleFunc("/api/files/", filesHandler)
	http.HandleFunc("/api/folder-name/", folderNameHandler)
	http.HandleFunc("/api/profiles", profilesHandler)
	http.HandleFunc("/api/profiles/", profileHandler)
	http.HandleFunc("/api/upload/icon", uploadIconHandler)
	http.HandleFunc("/api/upload/file", uploadFileHandler) // New file upload handler
	http.HandleFunc("/api/update/file-metadata", updateFileMetadataHandler) // New metadata update handler
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
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Goog-Channel-ID, X-Goog-Resource-State, X-Goog-Resource-ID, X-Goog-Message-Number")
	// Allow embedding from self, Vite dev server
	w.Header().Set("Content-Security-Policy", "frame-ancestors 'self' http://localhost:5173;")
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

	ctx := r.Context()
	folders, err := backend.ListFoldersFromFirestore(ctx)
	if err != nil {
		log.Printf("Error listing folders from Firestore: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Unable to list folders: %v", err)})
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

	folderIDComponent := strings.TrimPrefix(r.URL.Path, "/api/files/")
	if folderIDComponent == "" { // Allow '/' in folderIDComponent if it's part of the ID
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Folder ID is missing in path"})
		return
	}
	folderID := folderIDComponent

	pageSizeStr := r.URL.Query().Get("pageSize")
	lastDocID := r.URL.Query().Get("pageToken") // Use pageToken as lastDocID for Firestore pagination

	var pageSize int64 = 100
	if pageSizeStr != "" {
		parsedSize, err := strconv.ParseInt(pageSizeStr, 10, 64)
		if err == nil && parsedSize > 0 {
			pageSize = parsedSize
		} else {
			log.Printf("Invalid pageSize parameter: %s, using default %d", pageSizeStr, pageSize)
		}
	}

	filterType := r.URL.Query().Get("filter")

	ctx := r.Context()
	files, newLastDocID, err := backend.ListFilesFromFirestore(ctx, folderID, pageSize, lastDocID, filterType)
	if err != nil {
		log.Printf("Error listing files for folder %s from Firestore: %v", folderID, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Unable to list files: %v", err)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":          files,
		"nextPageToken": newLastDocID, // Return newLastDocID as nextPageToken
	})
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	backend.WebhookHandler(w, r)
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
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
	if folderIDComponent == "" { // Allow '/' in folderIDComponent if it's part of the ID
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Folder ID is missing in path"})
		return
	}
	folderID := folderIDComponent

	ctx := r.Context()
	folderName, err := backend.GetFolderNameFromFirestore(ctx, folderID)
	if err != nil {
		log.Printf("Error retrieving folder name for ID %s from Firestore: %v", folderID, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Unable to retrieve folder name: %v", err)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"name": folderName})
}

func profilesHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	ctx := r.Context()

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
		id, err := backend.CreateProfile(ctx, profile)
		if err != nil {
			log.Printf("Error creating profile: %v", err)
			http.Error(w, "Unable to create profile", http.StatusInternalServerError)
			return
		}
		profile.ID = id
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
	ctx := r.Context()

	profileID := strings.TrimPrefix(r.URL.Path, "/api/profiles/")
	if profileID == "" {
		http.Error(w, "Profile ID is missing in path", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
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

		if err := backend.UpdateProfile(ctx, profileID, profileData); err != nil {
			log.Printf("Error updating profile %s: %v", profileID, err)
			http.Error(w, "Unable to update profile", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated successfully"})

	case http.MethodDelete:
		if err := backend.DeleteProfile(ctx, profileID); err != nil {
			log.Printf("Error deleting profile %s: %v", profileID, err)
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

	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error parsing form: %v", err), http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("icon")
	if err != nil {
		http.Error(w, fmt.Sprintf("Error retrieving file from form: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	profileID := r.FormValue("profile_id")
	if profileID == "" {
		http.Error(w, "Profile ID is missing in form data", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	iconURL, err := backend.UploadProfileIcon(ctx, profileID, file, handler.Filename, handler.Header.Get("Content-Type"))
	if err != nil {
		log.Printf("Error uploading icon to Firebase Storage: %v", err)
		http.Error(w, "Error uploading icon to Firebase Storage", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"icon_url": iconURL})
}

// uploadFileHandler handles file uploads to Firebase Storage and saves metadata to Firestore.
func uploadFileHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form, 10MB limit for file size
	err := r.ParseMultipartForm(10 << 20) // 10 MB
	if err != nil {
		http.Error(w, fmt.Sprintf("Error parsing form: %v", err), http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file") // "file" is the expected form field name for the file
	if err != nil {
		http.Error(w, fmt.Sprintf("Error retrieving file from form: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	folderName := r.FormValue("folder_name")     // "folder_name" is the expected form field name for the folder name
	relativePath := r.FormValue("relative_path") // "relative_path" is the expected form field name for the relative path
	mimeType := r.FormValue("mime_type")         // "mime_type" is the expected form field name for the MIME type

	if folderName == "" {
		http.Error(w, "Folder name is missing in form data", http.StatusBadRequest)
		return
	}
	if relativePath == "" {
		http.Error(w, "Relative path is missing in form data", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	// Read file content into a byte slice
	fileContent, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error reading file content: %v", err), http.StatusInternalServerError)
		return
	}

	// If mimeType is not provided by the client, try to detect it from the file content
	if mimeType == "" {
		mimeType = http.DetectContentType(fileContent)
	}

	downloadURL, err := backend.UploadFileToStorageAndFirestore(ctx, folderName, relativePath, mimeType, fileContent)
	if err != nil {
		log.Printf("Error uploading file to Firebase Storage and Firestore: %v", err)
		http.Error(w, "Error uploading file to Firebase Storage and Firestore", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"download_url": downloadURL})
}

// updateFileMetadataHandler handles requests to update file metadata in Firestore.
func updateFileMetadataHandler(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var requestBody struct {
		ID       string `json:"id"`
		MimeType string `json:"mime_type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if requestBody.ID == "" || requestBody.MimeType == "" {
		http.Error(w, "Missing file ID or mime type in request body", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	err := backend.UpdateFileMetadata(ctx, requestBody.ID, requestBody.MimeType)
	if err != nil {
		log.Printf("Error updating file metadata: %v", err)
		http.Error(w, "Error updating file metadata", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "File metadata updated successfully"})
}
