package main

import (
	// "context" // No longer directly used in main.go
	"encoding/json"
	"fmt"
	// "io/ioutil" // No longer needed here directly for credentials.json
	"log"
	"net/http"
	"strconv" // Added for parsing pageSize
	"strings" // Added for path parsing

	"drive-gallery/backend" // Import the local backend package
)

// var driveService *drive.Service // Global variable for Drive service - will use backend.DriveService

func main() {
	// Initialize Google Drive Service using Service Account
	// The key file is in the root directory.
	err := backend.InitDriveService("drivegallery-460509-e833751c168d.json")
	if err != nil {
		log.Fatalf("Unable to initialize Drive service: %v", err)
	}

	// Set up HTTP routes
	http.HandleFunc("/api/folders", foldersHandler)
	http.HandleFunc("/api/files/", filesHandler)       // Note the trailing slash for path prefix matching
	http.HandleFunc("/api/folder-name/", folderNameHandler) // New handler for folder names
	http.HandleFunc("/webhook", webhookHandler)
	http.HandleFunc("/ws", wsHandler)

	backend.InitHub()

	serverAddr := ":8080"
	log.Printf("Backend server listening on %s", serverAddr)
	err = http.ListenAndServe(serverAddr, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}

func setCorsHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*") // Be more specific in production
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
