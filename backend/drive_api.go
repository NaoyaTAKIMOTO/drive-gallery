package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"golang.org/x/oauth2"
	"google.golang.org/api/drive/v3"
)

const (
	// RootFolderID is the ID of the specific Google Drive folder to start from.
	// This ID was provided by the user.
	RootFolderID = "1tRIbJKrGAsF2nhqekakN6c4lE40tj7hw"
)

// getClient uses a Context and Config to retrieve a Token
// then returns a Drive client.
func GetClient(config *oauth2.Config) *http.Client {
	// The file token.json stores the user's access and refresh tokens, and is
	// created automatically when the authorization flow completes for the first
	// time.
	tokFile := "token.json" // TODO: Securely manage token storage
	tok, err := tokenFromFile(tokFile)
	if err != nil {
		tok = getTokenFromWeb(config)
		saveToken(tokFile, tok)
	}
	return config.Client(context.Background(), tok)
}

// getTokenFromWeb uses Config to OAuth2 authorize and get a Token.
// It opens a browser window to the authorization page.
func getTokenFromWeb(config *oauth2.Config) *oauth2.Token {
	authURL := config.AuthCodeURL("state-token", oauth2.AccessTypeOffline)
	fmt.Printf("Go to the following link in your browser then type the "+
		"authorization code: \n%v\n", authURL)

	var authCode string
	if _, err := fmt.Scan(&authCode); err != nil {
		log.Fatalf("Unable to read authorization code: %v", err)
	}

	tok, err := config.Exchange(context.TODO(), authCode)
	if err != nil {
		log.Fatalf("Unable to retrieve token from web: %v", err)
	}
	return tok
}

// tokenFromFile retrieves a Token from a given file path.
// It returns the retrieved Token and any read error encountered.
func tokenFromFile(file string) (*oauth2.Token, error) {
	f, err := os.Open(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	tok := &oauth2.Token{}
	err = json.NewDecoder(f).Decode(tok)
	return tok, err
}

// saveToken saves a Token to a file path.
func saveToken(path string, token *oauth2.Token) {
	fmt.Printf("Saving credential file to: %s\n", path)
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		log.Fatalf("Unable to cache oauth token: %v", err)
	}
	defer f.Close()
	json.NewEncoder(f).Encode(token)
}

// listFilesInFolder lists files in a specific Google Drive folder.
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
