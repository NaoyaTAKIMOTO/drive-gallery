package backend

import (
	"context"
	"fmt"
	"io/ioutil" // ioutil is deprecated in Go 1.16+, consider os.ReadFile
	"log"
	// "os" // No longer used directly in this file after refactoring

	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
)

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
	data, err := ioutil.ReadFile(credentialsFile) // In Go 1.16+ use os.ReadFile
	if err != nil {
		return fmt.Errorf("unable to read client secret file %s: %v", credentialsFile, err)
	}

	// Scopes are important. Ensure they match what the service account is authorized for
	// and what your application needs.
	// Example scopes:
	// drive.DriveReadonlyScope for read-only access
	// drive.DriveScope for full access
	// drive.DriveFileScope for per-file access (might be more complex with service accounts)
	// For listing files, DriveReadonlyScope is usually sufficient.
	creds, err := google.CredentialsFromJSON(ctx, data, drive.DriveReadonlyScope)
	if err != nil {
		return fmt.Errorf("unable to load credentials from JSON %s: %v", credentialsFile, err)
	}

	DriveService, err = drive.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return fmt.Errorf("unable to retrieve Drive client: %v", err)
	}

	log.Println("Google Drive API service initialized successfully using service account.")
	return nil
}

// ListFilesInFolder lists files in a specific Google Drive folder.
func ListFilesInFolder(srv *drive.Service, folderID string) ([]*drive.File, error) {
	// TODO: Implement pagination if needed
	r, err := srv.Files.List().
		Q(fmt.Sprintf("'%s' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'", folderID)). // Exclude folders
		PageSize(100). // Adjust page size as needed, increased for more files
		Fields("nextPageToken, files(id, name, mimeType, webViewLink, thumbnailLink, webContentLink)"). // Added webContentLink
		Do()
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve files: %v", err)
	}

	return r.Files, nil
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
		PageSize(100). // Adjust page size as needed
		Fields("files(id, name, mimeType)"). // Only need id, name, and mimeType for folders
		Do()
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve folders: %v", err)
	}
	return r.Files, nil
}
