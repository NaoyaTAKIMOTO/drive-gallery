package backend

import (
	"context"
	"fmt"
	"log"

	firebase "firebase.google.com/go/v4"
	"google.golang.org/api/option"
	"cloud.google.com/go/firestore"
)

var (
	// App is the global Firebase app instance.
	App *firebase.App
	// Client is the global Firestore client instance.
	Client *firestore.Client
)

// InitFirebase initializes the Firebase Admin SDK and Firestore client.
// If serviceAccountJSONPath is empty, it attempts to use Application Default Credentials.
func InitFirebase(ctx context.Context, projectID, serviceAccountJSONPath string) error {
	var opts []option.ClientOption // option.ClientOptionの可変長引数に対応するためスライスに変更
	var err error

	if projectID == "" {
		log.Println("ERROR: Project ID is empty. Firebase Admin SDK initialization will likely fail.")
		return fmt.Errorf("project ID cannot be empty")
	}

	config := &firebase.Config{
		ProjectID: projectID,
	}
	log.Printf("Initializing Firebase Admin SDK with project ID: %s", projectID)

	if serviceAccountJSONPath != "" {
		opts = append(opts, option.WithCredentialsFile(serviceAccountJSONPath))
		log.Printf("Initializing Firebase Admin SDK with service account key: %s and project ID: %s", serviceAccountJSONPath, projectID)
	} else {
		// Use Application Default Credentials (e.g., when running on Cloud Run with a service account)
		log.Printf("Initializing Firebase Admin SDK with Application Default Credentials and project ID: %s", projectID)
		// No specific option needed for ADC, it's the default if no credentials file is provided.
	}

	App, err = firebase.NewApp(ctx, config, opts...) // optsを可変長引数として渡す
	if err != nil {
		log.Printf("ERROR: Failed to initialize Firebase app: %v", err)
		return fmt.Errorf("error initializing Firebase app: %v", err)
	}

	Client, err = App.Firestore(ctx)
	if err != nil {
		log.Printf("ERROR: Failed to get Firestore client: %v", err)
		return fmt.Errorf("error getting Firestore client: %v", err)
	}

	log.Println("Firebase Admin SDK and Firestore client initialized successfully.")
	return nil
}
