package backend

import (
	"context"
	"fmt"
	"io"
	"log"
	"path/filepath"
	"time"

	"cloud.google.com/go/firestore"
	gcs "cloud.google.com/go/storage" // Google Cloud Storage client for ACL
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	profileCollection = "profiles" // Collection name for profiles
)

// Profile represents a user's profile.
// Firestoreタグは、Firestoreドキュメントのフィールド名とGo構造体のフィールドをマッピングします。
// `firestore:"-"` はそのフィールドをFirestoreに保存しないことを意味します。
type Profile struct {
	ID      string `json:"id" firestore:"-"` // Firestore document ID, not stored as a field in the document
	Name    string `json:"name"`
	Bio     string `json:"bio"`
	IconURL string `json:"icon_url,omitempty"`
	// Add other profile fields here
}

// CreateProfile creates a new profile document in Firestore.
// It returns the ID of the newly created document.
func CreateProfile(ctx context.Context, profile Profile) (string, error) {
	if Client == nil {
		return "", fmt.Errorf("Firestore client not initialized")
	}

	// Add a new document with an auto-generated ID to the "profiles" collection.
	docRef, _, err := Client.Collection(profileCollection).Add(ctx, map[string]interface{}{
		"name":    profile.Name,
		"bio":     profile.Bio,
		"iconURL": profile.IconURL,
		// Add other fields here, ensure they match the Profile struct and Firestore needs
	})
	if err != nil {
		log.Printf("Error creating profile in Firestore: %v", err)
		return "", fmt.Errorf("failed to create profile: %v", err)
	}
	log.Printf("Successfully created profile with ID: %s", docRef.ID)
	return docRef.ID, nil
}

// UploadProfileIcon uploads an icon to Firebase Storage and returns its public URL.
func UploadProfileIcon(ctx context.Context, profileID string, file io.Reader, filename string, contentType string) (string, error) {
	if StorageClient == nil {
		return "", fmt.Errorf("firebase Storage client not initialized")
	}
	if profileID == "" {
		return "", fmt.Errorf("profile ID cannot be empty")
	}

	// Get the default bucket. You might need to specify a bucket name if not using the default.
	// The bucket name is now configured via the Firebase App initialization.
	bucket, err := StorageClient.DefaultBucket() // Use DefaultBucket()
	if err != nil {
		return "", fmt.Errorf("failed to get bucket: %v", err)
	}

	// Generate a unique file path in Storage
	// Example: profiles/{profileID}/icons/{timestamp}_{original_filename_without_ext}.{ext}
	ext := filepath.Ext(filename)
	baseFilename := filename[:len(filename)-len(ext)]
	objectName := fmt.Sprintf("profiles/%s/icons/%d_%s%s", profileID, time.Now().UnixNano(), baseFilename, ext)

	wc := bucket.Object(objectName).NewWriter(ctx)
	wc.ContentType = contentType

	if _, err := io.Copy(wc, file); err != nil {
		wc.Close()
		log.Printf("Error uploading file to Storage: %v", err)
		return "", fmt.Errorf("failed to upload file to Storage: %v", err)
	}
	if err := wc.Close(); err != nil {
		log.Printf("Error closing Storage writer: %v", err)
		return "", fmt.Errorf("failed to close Storage writer: %v", err)
	}

	// Make the file public (optional, depending on security rules)
	// Note: This requires appropriate Firebase Storage security rules.
	// For public access, rules like `allow read: if true;` for the path are needed.
	if err := bucket.Object(objectName).ACL().Set(ctx, gcs.AllUsers, gcs.RoleReader); err != nil {
		log.Printf("Warning: Could not set public ACL for file %s: %v", objectName, err)
		// Do not return error, as file is uploaded. Just log warning.
	}

	attrs, err := bucket.Object(objectName).Attrs(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get storage object attributes: %v", err)
	}
	publicURL := attrs.MediaLink // MediaLink is the public download URL

	log.Printf("Successfully uploaded icon to Storage: %s", publicURL)

	return publicURL, nil
}

// GetProfiles retrieves all profile documents from Firestore.
func GetProfiles(ctx context.Context) ([]Profile, error) {
	if Client == nil {
		return nil, fmt.Errorf("Firestore client not initialized")
	}

	var profiles []Profile
	iter := Client.Collection(profileCollection).Documents(ctx)
	defer iter.Stop() // Always stop the iterator to release resources.

	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("Error iterating profiles: %v", err)
			return nil, fmt.Errorf("failed to iterate profiles: %v", err)
		}

		docData := doc.Data()
		p := Profile{
			ID: doc.Ref.ID,
		}

		if nameVal, ok := docData["name"]; ok {
			if nameStr, isStr := nameVal.(string); isStr {
				p.Name = nameStr
			}
		}
		if bioVal, ok := docData["bio"]; ok {
			if bioStr, isStr := bioVal.(string); isStr {
				p.Bio = bioStr
			}
		} else if descVal, ok := docData["description"]; ok { // Fallback to 'description' if 'bio' is not found
			if descStr, isStr := descVal.(string); isStr {
				p.Bio = descStr
			}
		}
		if iconURLVal, ok := docData["iconURL"]; ok {
			if iconURLStr, isStr := iconURLVal.(string); isStr {
				p.IconURL = iconURLStr
			}
		}

		profiles = append(profiles, p)
	}
	log.Printf("Successfully retrieved %d profiles", len(profiles))
	return profiles, nil
}

// GetProfile retrieves a single profile document by its ID from Firestore.
func GetProfile(ctx context.Context, profileID string) (*Profile, error) {
	if Client == nil {
		return nil, fmt.Errorf("Firestore client not initialized")
	}
	if profileID == "" {
		return nil, fmt.Errorf("profileID cannot be empty")
	}

	doc, err := Client.Collection(profileCollection).Doc(profileID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			log.Printf("Profile with ID %s not found", profileID)
			return nil, nil // Or a specific "not found" error
		}
		log.Printf("Error getting profile %s: %v", profileID, err)
		return nil, fmt.Errorf("failed to get profile %s: %v", profileID, err)
	}

	docData := doc.Data()
	p := Profile{
		ID: doc.Ref.ID,
	}

	if nameVal, ok := docData["name"]; ok {
		if nameStr, isStr := nameVal.(string); isStr {
			p.Name = nameStr
		}
	}
	if bioVal, ok := docData["bio"]; ok {
		if bioStr, isStr := bioVal.(string); isStr {
			p.Bio = bioStr
		}
	} else if descVal, ok := docData["description"]; ok { // Fallback to 'description' if 'bio' is not found
		if descStr, isStr := descVal.(string); isStr {
			p.Bio = descStr
		}
	}
	if iconURLVal, ok := docData["iconURL"]; ok {
		if iconURLStr, isStr := iconURLVal.(string); isStr {
			p.IconURL = iconURLStr
		}
	}

	log.Printf("Successfully retrieved profile with ID: %s, Name: %s, Bio: %s, IconURL: %s", p.ID, p.Name, p.Bio, p.IconURL)
	return &p, nil
}

// UpdateProfile updates an existing profile document in Firestore.
func UpdateProfile(ctx context.Context, profileID string, profile Profile) error {
	if Client == nil {
		return fmt.Errorf("Firestore client not initialized")
	}
	if profileID == "" {
		return fmt.Errorf("profileID cannot be empty for update")
	}

	// Use Set with MergeAll to update only provided fields, or create if not exists.
	// If you want to strictly update existing ones, you might check existence first or use Update.
	// For simplicity, Set with MergeAll is often used.
	// Alternatively, use Update with a map of fields to update.
	updateData := map[string]interface{}{
		"name":    profile.Name,
		"bio":     profile.Bio, // Changed from description to bio
		"iconURL": profile.IconURL,
		// Add other fields to update
	}

	_, err := Client.Collection(profileCollection).Doc(profileID).Set(ctx, updateData, firestore.MergeAll)
	if err != nil {
		log.Printf("Error updating profile %s in Firestore: %v", profileID, err)
		return fmt.Errorf("failed to update profile %s: %v", profileID, err)
	}
	log.Printf("Successfully updated profile with ID: %s", profileID)
	return nil
}

// DeleteProfile deletes a profile document by its ID from Firestore.
func DeleteProfile(ctx context.Context, profileID string) error {
	if Client == nil {
		return fmt.Errorf("Firestore client not initialized")
	}
	if profileID == "" {
		return fmt.Errorf("profileID cannot be empty for delete")
	}

	_, err := Client.Collection(profileCollection).Doc(profileID).Delete(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			log.Printf("Profile with ID %s not found for deletion, considered successful.", profileID)
			return nil // Or return a specific "not found" error if needed
		}
		log.Printf("Error deleting profile %s from Firestore: %v", profileID, err)
		return fmt.Errorf("failed to delete profile %s: %v", profileID, err)
	}
	log.Printf("Successfully deleted profile with ID: %s", profileID)
	return nil
}
