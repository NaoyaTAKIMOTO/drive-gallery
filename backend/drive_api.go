package backend

import (
	"context"
	"fmt"
	"log"
	"os"      // Added for os.ReadFile
	"strings" // Added for strings.NewReader

	// _ "github.com/lib/pq" // PostgreSQL driver - No longer needed
	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
)

// DB holds the database connection. - No longer needed
// var DB *sql.DB

// Profile represents a member's profile. - Moved to profiles.go
// type Profile struct {
// 	ID      int    `json:"id"`
// 	Name    string `json:"name"`
// 	Bio     string `json:"bio"`
// 	IconURL string `json:"icon_url"`
// }

// GetProfiles retrieves all profiles from the database. - Moved to profiles.go
// func GetProfiles() ([]Profile, error) {
// 	rows, err := DB.Query("SELECT id, name, bio, icon_url FROM profiles")
// 	if err != nil {
// 		return nil, fmt.Errorf("failed to query profiles: %v", err)
// 	}
// 	defer rows.Close()

// 	var profiles []Profile
// 	for rows.Next() {
// 		var p Profile
// 		if err := rows.Scan(&p.ID, &p.Name, &p.Bio, &p.IconURL); err != nil {
// 			return nil, fmt.Errorf("failed to scan profile: %v", err)
// 		}
// 		profiles = append(profiles, p)
// 	}
// 	return profiles, nil
// }

// CreateProfile inserts a new profile into the database. - Moved to profiles.go
// func CreateProfile(profile Profile) (int, error) {
// 	var id int
// 	err := DB.QueryRow("INSERT INTO profiles (name, bio, icon_url) VALUES ($1, $2, $3) RETURNING id",
// 		profile.Name, profile.Bio, profile.IconURL).Scan(&id)
// 	if err != nil {
// 		return 0, fmt.Errorf("failed to insert profile: %v", err)
// 	}
// 	return id, nil
// }

// UpdateProfile updates an existing profile in the database. - Moved to profiles.go
// func UpdateProfile(profile Profile) error {
// 	_, err := DB.Exec("UPDATE profiles SET name = $1, bio = $2, icon_url = $3 WHERE id = $4",
// 		profile.Name, profile.Bio, profile.IconURL, profile.ID)
// 	if err != nil {
// 		return fmt.Errorf("failed to update profile: %v", err)
// 	}
// 	return nil
// }

// InitDatabase initializes the PostgreSQL database and creates the profiles table if it doesn't exist. - No longer needed
// func InitDatabase(dataSourceName string) error {
// 	var err error
// 	DB, err = sql.Open("postgres", dataSourceName)
// 	if err != nil {
// 		return fmt.Errorf("failed to open database: %v", err)
// 	}

// 	// Ping the database to ensure connection is established
// 	if err = DB.Ping(); err != nil {
// 		return fmt.Errorf("failed to connect to database: %v", err)
// 	}

// 	// Create profiles table with SERIAL for auto-incrementing ID in PostgreSQL
// 	createTableSQL := `CREATE TABLE IF NOT EXISTS profiles (
// 		id SERIAL PRIMARY KEY,
// 		name TEXT NOT NULL,
// 		bio TEXT,
// 		icon_url TEXT
// 	);`

// 	_, err = DB.Exec(createTableSQL)
// 	if err != nil {
// 		return fmt.Errorf("failed to create profiles table: %v", err)
// 	}

// 	log.Println("Database initialized and profiles table ensured.")
// 	return nil
// }

const (
	// RootFolderID is the ID of the specific Google Drive folder to start from.
	// This ID was provided by the user.
	RootFolderID = "1tRIbJKrGAsF2nhqekakN6c4lE40tj7hw"
)

// DriveService holds the initialized Google Drive service client.
var DriveService *drive.Service

// InitDriveService initializes the Google Drive service using a service account key file.
func InitDriveService(credentialsFile string) error {
	ctx := context.Background()
	var creds *google.Credentials
	var err error

	if credentialsFile != "" {
		data, readErr := os.ReadFile(credentialsFile) // Use os.ReadFile
		if readErr != nil {
			log.Printf("ERROR: Unable to read client secret file %s: %v", credentialsFile, readErr)
			return fmt.Errorf("unable to read client secret file %s: %v", credentialsFile, readErr)
		}
		creds, err = google.CredentialsFromJSON(ctx, data, drive.DriveScope)
		if err != nil {
			log.Printf("ERROR: Unable to load credentials from JSON %s: %v", credentialsFile, err)
			return fmt.Errorf("unable to load credentials from JSON %s: %v", credentialsFile, err)
		}
		log.Printf("Initializing Google Drive API service with service account key: %s", credentialsFile)
	} else {
		// Use Application Default Credentials (e.g., when running on Cloud Run with a service account)
		creds, err = google.FindDefaultCredentials(ctx, drive.DriveScope)
		if err != nil {
			log.Printf("ERROR: Unable to find default credentials for Drive service: %v", err)
			return fmt.Errorf("unable to find default credentials for Drive service: %v", err)
		}
		log.Println("Initializing Google Drive API service with Application Default Credentials.")
	}

	DriveService, err = drive.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		log.Printf("ERROR: Unable to retrieve Drive client: %v", err)
		return fmt.Errorf("unable to retrieve Drive client: %v", err)
	}

	log.Println("Google Drive API service initialized successfully using service account.")
	return nil
}

// ListFilesInFolder lists files in a specific Google Drive folder with pagination and optional filtering.
// It returns a slice of files, the next page token, and an error.
func ListFilesInFolder(srv *drive.Service, folderID string, pageSize int64, pageToken string, filterType string) ([]*drive.File, string, error) {
	query := fmt.Sprintf("'%s' in parents and trashed = false", folderID)

	// Add MIME type filter based on filterType
	switch filterType {
	case "image":
		query += " and mimeType contains 'image/'"
	case "video":
		query += " and (mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.video')"
	default:
		// For "all" or unknown filter types, exclude folders
		query += " and mimeType != 'application/vnd.google-apps.folder'"
	}

	call := srv.Files.List().
		Q(query).
		PageSize(pageSize).
		Fields("nextPageToken, files(id, name, mimeType, webViewLink, thumbnailLink, webContentLink)")

	if pageToken != "" {
		call = call.PageToken(pageToken)
	}

	r, err := call.Do()
	if err != nil {
		return nil, "", fmt.Errorf("unable to retrieve files: %v", err)
	}

	return r.Files, r.NextPageToken, nil
}

// UploadFileToDrive uploads a file to Google Drive and returns its webViewLink (public URL).
func UploadFileToDrive(srv *drive.Service, fileName string, mimeType string, content []byte) (string, error) {
	file := &drive.File{
		Name:     fileName,
		MimeType: mimeType,
		Parents:  []string{RootFolderID}, // Upload to the predefined root folder
	}

	// Create a new file in Drive
	res, err := srv.Files.Create(file).
		Media(strings.NewReader(string(content))). // Use strings.NewReader for byte slice
		Fields("id"). // Only need ID to construct the embeddable link
		Do()
	if err != nil {
		return "", fmt.Errorf("unable to create file in Drive: %v", err)
	}

	// Make the file publicly accessible
	_, err = srv.Permissions.Create(res.Id, &drive.Permission{
		Type: "anyone",
		Role: "reader",
	}).Do()
	if err != nil {
		// Log the error but don't fail the upload, as the file is already uploaded.
		// It just won't be publicly accessible.
		log.Printf("Warning: Could not set public permission for file %s: %v", res.Id, err)
	}

	// Return the embeddable link
	embeddableLink := fmt.Sprintf("https://drive.google.com/uc?export=view&id=%s", res.Id)
	return embeddableLink, nil
}

// GetFolderName retrieves the name of a specific folder by its ID.
func GetFolderName(srv *drive.Service, folderID string) (string, error) {
	file, err := srv.Files.Get(folderID).Fields("name").Do()
	if err != nil {
		return "", fmt.Errorf("unable to retrieve folder name for ID %s: %v", folderID, err)
	}
	return file.Name, nil
}

// ListFoldersInRootFolder lists folders directly under the predefined RootFolderID.
func ListFoldersInRootFolder(srv *drive.Service) ([]*drive.File, error) {
	r, err := srv.Files.List().
		Q(fmt.Sprintf("'%s' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false", RootFolderID)).
		PageSize(100).                       // Adjust page size as needed
		Fields("files(id, name, mimeType)"). // Only need id, name, and mimeType for folders
		Do()
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve folders: %v", err)
	}
	return r.Files, nil
}
