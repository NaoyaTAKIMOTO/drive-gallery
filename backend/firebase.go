package backend

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"os" // Add os import
	"strings" // Add strings import
	"time"

	"cloud.google.com/go/firestore"
	gcs "cloud.google.com/go/storage" // Google Cloud Storage client for ACL
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/storage"
	"github.com/google/uuid" // Import uuid package
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

var (
	// App is the global Firebase app instance.
	App *firebase.App
	// Client is the global Firestore client instance.
	Client *firestore.Client
	// StorageClient is the global Firebase Storage client instance.
	StorageClient *storage.Client
)

// FileMetadata represents the metadata of a file stored in Firebase Storage and Firestore.
type FileMetadata struct {
	ID          string    `json:"id" firestore:"id"` // Firestore document ID, same as Storage path
	Name        string    `json:"name" firestore:"name"`
	MimeType    string    `json:"mimeType" firestore:"mimeType"`
	StoragePath string    `json:"storagePath" firestore:"storagePath"` // Path in Firebase Storage
	DownloadURL string    `json:"downloadUrl" firestore:"downloadUrl"`
	FolderID    string    `json:"folderId" firestore:"folderId"`       // Corresponds to a logical folder
	Hash        string    `json:"hash" firestore:"hash"`               // SHA256 hash for deduplication
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

// FolderMetadata represents the metadata of a logical folder stored in Firestore.
type FolderMetadata struct {
	ID        string    `json:"id" firestore:"id"` // Firestore document ID
	Name      string    `json:"name" firestore:"name"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
}

const FilesCollection = "files"
const FoldersCollection = "folders"

// InitFirebase initializes the Firebase Admin SDK, Firestore client, and Storage client.
// If serviceAccountJSONPath is empty, it attempts to use Application Default Credentials.
func InitFirebase(ctx context.Context, projectID, serviceAccountJSONPath string) error {
	var opts []option.ClientOption
	var err error

	if projectID == "" {
		log.Println("ERROR: Project ID is empty. Firebase Admin SDK initialization will likely fail.")
		return fmt.Errorf("project ID cannot be empty")
	}

	storageBucket := os.Getenv("FIREBASE_STORAGE_BUCKET")
	if storageBucket == "" {
		return fmt.Errorf("FIREBASE_STORAGE_BUCKET environment variable is not set")
	}

	config := &firebase.Config{
		ProjectID:     projectID,
		StorageBucket: storageBucket, // Set default storage bucket from environment variable
	}
	log.Printf("Initializing Firebase Admin SDK with project ID: %s", projectID)

	if serviceAccountJSONPath != "" {
		opts = append(opts, option.WithCredentialsFile(serviceAccountJSONPath))
		log.Printf("Initializing Firebase Admin SDK with service account key: %s and project ID: %s", serviceAccountJSONPath, projectID)
	} else {
		log.Printf("Initializing Firebase Admin SDK with Application Default Credentials and project ID: %s", projectID)
	}

	App, err = firebase.NewApp(ctx, config, opts...)
	if err != nil {
		log.Printf("ERROR: Failed to initialize Firebase app: %v", err)
		return fmt.Errorf("error initializing Firebase app: %v", err)
	}

	Client, err = App.Firestore(ctx)
	if err != nil {
		log.Printf("ERROR: Failed to get Firestore client: %v", err)
		return fmt.Errorf("error getting Firestore client: %v", err)
	}

	StorageClient, err = App.Storage(ctx)
	if err != nil {
		log.Printf("ERROR: Failed to get Firebase Storage client: %v", err)
		return fmt.Errorf("error getting Firebase Storage client: %v", err)
	}

	log.Println("Firebase Admin SDK, Firestore client, and Storage client initialized successfully.")
	return nil
}

// CalculateFileHash calculates the SHA256 hash of the given content.
func CalculateFileHash(content []byte) (string, error) {
	hasher := sha256.New()
	_, err := hasher.Write(content)
	if err != nil {
		return "", fmt.Errorf("failed to write content to hasher: %v", err)
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}

// UploadFileToStorageAndFirestore uploads a file to Firebase Storage and saves its metadata to Firestore.
// It handles deduplication based on content hash. The bucketName is derived from the StorageClient.
// It now also handles folder creation if the specified folderName does not exist in Firestore.
func UploadFileToStorageAndFirestore(ctx context.Context, folderName, relativePath, mimeType string, content []byte) (string, error) {
	fileHash, err := CalculateFileHash(content)
	if err != nil {
		return "", fmt.Errorf("failed to calculate file hash: %v", err)
	}

	// 1. Determine folderID: Find existing folder or create a new one
	var folderID string
	if folderName != "" {
		// Try to find an existing folder by name
		iter := Client.Collection(FoldersCollection).Where("name", "==", folderName).Limit(1).Documents(ctx)
		doc, err := iter.Next()
		if err == nil {
			// Folder found
			var existingFolder FolderMetadata
			if err := doc.DataTo(&existingFolder); err != nil {
				return "", fmt.Errorf("failed to unmarshal existing folder metadata: %v", err)
			}
			folderID = existingFolder.ID
			log.Printf("Found existing folder '%s' with ID: %s", folderName, folderID)
		} else if err == iterator.Done {
			// Folder not found, create a new one
			newFolderID := uuid.New().String()
			newFolder := FolderMetadata{
				ID:        newFolderID,
				Name:      folderName,
				CreatedAt: time.Now(),
			}
			_, err := Client.Collection(FoldersCollection).Doc(newFolderID).Set(ctx, newFolder)
			if err != nil {
				return "", fmt.Errorf("failed to create new folder '%s': %v", folderName, err)
			}
			folderID = newFolderID
			log.Printf("Created new folder '%s' with ID: %s", folderName, folderID)
		} else {
			return "", fmt.Errorf("failed to query Firestore for folder '%s': %v", folderName, err)
		}
	} else {
		// If no folderName is provided, use a default or handle as root.
		// For now, let's assume a default "root" folder or handle as empty folderID.
		// If folderName is empty, we'll use an empty string for folderID, which means files go to the root of the bucket.
		folderID = "" // This means files will be in the root of the bucket, but still associated with an empty folderID in Firestore
		log.Println("No folder name provided, files will be uploaded to the root or a default folder.")
	}

	// 2. Check for existing file with the same hash in Firestore
	// This check should ideally also consider the folderID to avoid false positives across different logical folders
	// For now, we keep it global for simplicity, but be aware of potential issues if same file content is allowed in different folders.
	iter := Client.Collection(FilesCollection).Where("hash", "==", fileHash).Limit(1).Documents(ctx)
	doc, err := iter.Next()
	if err == nil {
		// File with same hash already exists, return its download URL
		var existingFile FileMetadata
		if err := doc.DataTo(&existingFile); err != nil {
			return "", fmt.Errorf("failed to unmarshal existing file metadata: %v", err)
		}
		log.Printf("File with hash %s already exists: %s. Returning existing URL.", fileHash, existingFile.DownloadURL)
		return existingFile.DownloadURL, nil
	}
	if err != iterator.Done {
		return "", fmt.Errorf("failed to query Firestore for existing hash: %v", err)
	}

	// 3. If not exists, upload to Firebase Storage
	bucket, err := StorageClient.DefaultBucket()
	if err != nil {
		return "", fmt.Errorf("failed to get default storage bucket: %v", err)
	}

	// Construct storagePath using folderID and relativePath
	// relativePath already contains the full path including filename (e.g., "subfolder/image.jpg")
	storagePath := relativePath
	if folderID != "" {
		storagePath = fmt.Sprintf("%s/%s", folderID, relativePath)
	}
	// Clean up relativePath to ensure it doesn't start with a slash if it's a root file
	storagePath = strings.TrimPrefix(storagePath, "/")

	wc := bucket.Object(storagePath).NewWriter(ctx)
	wc.ContentType = mimeType
	if _, err := wc.Write(content); err != nil {
		return "", fmt.Errorf("failed to write file to storage: %v", err)
	}
	if err := wc.Close(); err != nil {
		return "", fmt.Errorf("failed to close storage writer: %v", err)
	}

	// Make the file public (optional, depending on security rules)
	if err := bucket.Object(storagePath).ACL().Set(ctx, gcs.AllUsers, gcs.RoleReader); err != nil {
		log.Printf("Warning: Could not set public ACL for file %s: %v", storagePath, err)
	}

	attrs, err := bucket.Object(storagePath).Attrs(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get storage object attributes: %v", err)
	}
	downloadURL := attrs.MediaLink // MediaLink is the public download URL

	// 4. Save metadata to Firestore
	fileDocID := uuid.New().String()
	log.Printf("Generated Firestore document ID: %s", fileDocID)

	// Extract filename from relativePath for FileMetadata.Name
	fileName := relativePath
	if lastSlash := strings.LastIndex(relativePath, "/"); lastSlash != -1 {
		fileName = relativePath[lastSlash+1:]
	}

	fileMetadata := FileMetadata{
		ID:          fileDocID,
		Name:        fileName, // Use extracted filename
		MimeType:    mimeType,
		StoragePath: storagePath,
		DownloadURL: downloadURL,
		FolderID:    folderID, // Use the determined folderID (UUID)
		Hash:        fileHash,
		CreatedAt:   time.Now(),
	}

	log.Printf("Attempting to save file metadata to Firestore: %+v", fileMetadata)

	_, err = Client.Collection(FilesCollection).Doc(fileDocID).Set(ctx, fileMetadata)
	if err != nil {
		log.Printf("ERROR: Failed to save file metadata to Firestore for %s: %v. Attempting to delete from Storage.", storagePath, err)
		if delErr := bucket.Object(storagePath).Delete(ctx); delErr != nil {
			log.Printf("ERROR: Failed to delete orphaned storage object %s: %v", storagePath, delErr)
		}
		return "", fmt.Errorf("failed to save file metadata to Firestore: %v", err)
	}

	log.Printf("File uploaded to Storage and metadata saved to Firestore: %s", downloadURL)
	return downloadURL, nil
}

// UpdateFileMetadata updates the mimeType of an existing file metadata in Firestore.
func UpdateFileMetadata(ctx context.Context, firestoreDocID, newMimeType string) error {
	_, err := Client.Collection(FilesCollection).Doc(firestoreDocID).Update(ctx, []firestore.Update{
		{Path: "mimeType", Value: newMimeType},
	})
	if err != nil {
		return fmt.Errorf("failed to update file metadata for doc ID %s: %v", firestoreDocID, err)
	}
	log.Printf("File metadata for doc ID %s updated with new mimeType: %s", firestoreDocID, newMimeType)
	return nil
}

// ListFilesFromFirestore lists file metadata from Firestore based on folderID and filterType.
// It supports pagination using lastDocID (Firestore document ID of the last item from previous page).
func ListFilesFromFirestore(ctx context.Context, folderID string, pageSize int64, lastDocID string, filterType string) ([]FileMetadata, string, error) {
	log.Printf("ListFilesFromFirestore called for folderID: %s, pageSize: %d, lastDocID: %s, filterType: %s", folderID, pageSize, lastDocID, filterType)

	// Revert to original query with OrderBy and StartAfter
	query := Client.Collection(FilesCollection).Where("folderId", "==", folderID).OrderBy("createdAt", firestore.Desc)
	log.Printf("Query: Filtering by folderId and ordering by createdAt Desc.")

	// Apply filterType
	switch filterType {
	case "image":
		query = query.Where("mimeType", ">=", "image/").Where("mimeType", "<", "imagf") // Range query for mimeType
		log.Printf("Applying image filter.")
	case "video":
		query = query.Where("mimeType", ">=", "video/").Where("mimeType", "<", "videp") // Range query for mimeType
		log.Printf("Applying video filter.")
	default:
		log.Printf("No specific filter applied (filterType: %s).", filterType)
	}

	if lastDocID != "" {
		log.Printf("Starting query after document ID: %s", lastDocID)
		lastDocSnap, err := Client.Collection(FilesCollection).Doc(lastDocID).Get(ctx)
		if err != nil {
			log.Printf("ERROR: Failed to get last document snapshot for ID %s: %v", lastDocID, err)
			return nil, "", fmt.Errorf("failed to get last document snapshot: %v", err)
		}
		query = query.StartAfter(lastDocSnap)
	}

	iter := query.Limit(int(pageSize)).Documents(ctx)
	defer iter.Stop()

	var files []FileMetadata
	var newLastDocID string
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("ERROR: Failed to iterate files: %v", err)
			return nil, "", fmt.Errorf("failed to iterate files: %v", err)
		}
		var file FileMetadata
		if err := doc.DataTo(&file); err != nil {
			log.Printf("ERROR: Failed to unmarshal file metadata from doc %s: %v", doc.Ref.ID, err)
			return nil, "", fmt.Errorf("failed to unmarshal file metadata: %v", err)
		}
		files = append(files, file)
		newLastDocID = doc.Ref.ID // Update lastDocID for next page
	}

	log.Printf("ListFilesFromFirestore returning %d files. NextPageToken: %s (Note: OrderBy/StartAfter temporarily removed)", len(files), newLastDocID)
	return files, newLastDocID, nil
}

// ListFoldersFromFirestore lists logical folders from Firestore.
// For simplicity, this assumes a flat list of folders or infers from file paths.
// If a dedicated "folders" collection is used, this function would query it.
// For now, let's assume folders are created implicitly by files having a folderID.
// We will return unique folderIDs found in files collection.
// ListFoldersFromFirestore lists logical folders from Firestore.
// This function now queries the dedicated "folders" collection.
func ListFoldersFromFirestore(ctx context.Context) ([]FolderMetadata, error) {
	iter := Client.Collection(FoldersCollection).OrderBy("createdAt", firestore.Desc).Documents(ctx) // Order by createdAt for consistent listing
	defer iter.Stop()

	var folders []FolderMetadata
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to iterate folders: %v", err)
		}
		var folder FolderMetadata
		if err := doc.DataTo(&folder); err != nil {
			return nil, fmt.Errorf("failed to unmarshal folder metadata: %v", err)
		}
		folders = append(folders, folder)
	}
	return folders, nil
}

// GetFolderNameFromFirestore retrieves the name of a specific folder by its ID.
// This function now queries the dedicated "folders" collection.
func GetFolderNameFromFirestore(ctx context.Context, folderID string) (string, error) {
	doc, err := Client.Collection(FoldersCollection).Doc(folderID).Get(ctx)
	if err != nil {
		// If document not found, return a default name or an error indicating it's not a known folder
		if doc == nil || !doc.Exists() {
			return "Unknown Folder", nil // Or return an error if strict
		}
		return "", fmt.Errorf("failed to get folder document: %v", err)
	}
	var folder FolderMetadata
	if err := doc.DataTo(&folder); err != nil {
		return "", fmt.Errorf("failed to unmarshal folder metadata: %v", err)
	}
	return folder.Name, nil
}

// DeleteFileFromStorageAndFirestore deletes a file from Firebase Storage and its metadata from Firestore.
func DeleteFileFromStorageAndFirestore(ctx context.Context, storagePath, firestoreDocID string) error {
	// 1. Delete from Firebase Storage
	bucket, err := StorageClient.DefaultBucket()
	if err != nil {
		return fmt.Errorf("failed to get default storage bucket: %v", err)
	}
	if err := bucket.Object(storagePath).Delete(ctx); err != nil {
		return fmt.Errorf("failed to delete file from storage %s: %v", storagePath, err)
	}

	// 2. Delete from Firestore
	_, err = Client.Collection(FilesCollection).Doc(firestoreDocID).Delete(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete file metadata from Firestore %s: %v", firestoreDocID, err)
	}

	log.Printf("File %s deleted from Storage and Firestore.", storagePath)
	return nil
}
