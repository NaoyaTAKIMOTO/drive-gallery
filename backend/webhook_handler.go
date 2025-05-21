package backend

import (
	"fmt"
	"log"
	"net/http"
)

// webhookHandler receives and processes Google Drive webhook notifications.
func WebhookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Log the received request headers for now
	log.Printf("Received Webhook Request:")
	channelID := r.Header.Get("X-Goog-Channel-ID")
	resourceState := r.Header.Get("X-Goog-Resource-State")
	resourceID := r.Header.Get("X-Goog-Resource-ID") // The ID of the file or folder that changed
	messageNumber := r.Header.Get("X-Goog-Message-Number") // A unique identifier for this message

	log.Printf("X-Goog-Channel-ID: %s", channelID)
	log.Printf("X-Goog-Resource-State: %s", resourceState)
	log.Printf("X-Goog-Resource-ID: %s", resourceID)
	log.Printf("X-Goog-Message-Number: %s", messageNumber)

	// TODO: Implement more detailed logic based on resourceState
	switch resourceState {
	case "add":
		log.Printf("Resource added: %s", resourceID)
		// Notify frontend about the new file
	case "update":
		log.Printf("Resource updated: %s", resourceID)
		// Notify frontend about the updated file
	case "remove", "trash":
		log.Printf("Resource removed/trashed: %s", resourceID)
		// Notify frontend about the removed file
	case "untrash":
		log.Printf("Resource untrashed: %s", resourceID)
		// Notify frontend about the restored file
	default:
		log.Printf("Unknown resource state: %s for resource %s", resourceState, resourceID)
	}

	// For now, just acknowledge receipt
	fmt.Fprintln(w, "Webhook notification processed")

	// Actual notification logic will be based on resourceState
	// For example, if a file is added, modified, or deleted:
	// BroadcastMessage([]byte(fmt.Sprintf("{\"type\": \"%s\", \"resourceId\": \"%s\"}", resourceState, resourceID)))
}
