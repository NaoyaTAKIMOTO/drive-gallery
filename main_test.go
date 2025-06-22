package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSetCorsHeaders(t *testing.T) {
	w := httptest.NewRecorder()
	setCorsHeaders(w)

	expectedHeaders := map[string]string{
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Goog-Channel-ID, X-Goog-Resource-State, X-Goog-Resource-ID, X-Goog-Message-Number",
		"Content-Security-Policy":      "frame-ancestors 'self' http://localhost:5173;",
	}

	for key, expected := range expectedHeaders {
		actual := w.Header().Get(key)
		if actual != expected {
			t.Errorf("Expected header %s to be %s, got %s", key, expected, actual)
		}
	}
}

func TestFoldersHandlerOptions(t *testing.T) {
	req, err := http.NewRequest("OPTIONS", "/api/folders", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(foldersHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}
}

func TestFoldersHandlerMethodNotAllowed(t *testing.T) {
	req, err := http.NewRequest("POST", "/api/folders", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(foldersHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusMethodNotAllowed {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusMethodNotAllowed)
	}
}

func TestFilesHandlerMethodNotAllowed(t *testing.T) {
	req, err := http.NewRequest("POST", "/api/files/test-folder", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(filesHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusMethodNotAllowed {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusMethodNotAllowed)
	}
}

func TestFilesHandlerMissingFolderID(t *testing.T) {
	req, err := http.NewRequest("GET", "/api/files/", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(filesHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
	}

	var response map[string]string
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	if err != nil {
		t.Fatal(err)
	}

	expectedError := "Folder ID is missing in path"
	if response["error"] != expectedError {
		t.Errorf("Expected error message %s, got %s", expectedError, response["error"])
	}
}

func TestFolderNameHandlerMissingFolderID(t *testing.T) {
	req, err := http.NewRequest("GET", "/api/folder-name/", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(folderNameHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
	}

	var response map[string]string
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	if err != nil {
		t.Fatal(err)
	}

	expectedError := "Folder ID is missing in path"
	if response["error"] != expectedError {
		t.Errorf("Expected error message %s, got %s", expectedError, response["error"])
	}
}

func TestProfilesHandlerMethodNotAllowed(t *testing.T) {
	req, err := http.NewRequest("DELETE", "/api/profiles", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(profilesHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusMethodNotAllowed {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusMethodNotAllowed)
	}
}

func TestProfileHandlerMissingProfileID(t *testing.T) {
	req, err := http.NewRequest("GET", "/api/profiles/", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(profileHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
	}
}

func TestUploadIconHandlerMethodNotAllowed(t *testing.T) {
	req, err := http.NewRequest("GET", "/api/upload/icon", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(uploadIconHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusMethodNotAllowed {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusMethodNotAllowed)
	}
}

func TestUploadFileHandlerMethodNotAllowed(t *testing.T) {
	req, err := http.NewRequest("GET", "/api/upload/file", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(uploadFileHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusMethodNotAllowed {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusMethodNotAllowed)
	}
}

func TestUpdateFileMetadataHandlerInvalidJSON(t *testing.T) {
	invalidJSON := "{"
	req, err := http.NewRequest("POST", "/api/update/file-metadata", bytes.NewBuffer([]byte(invalidJSON)))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(updateFileMetadataHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
	}
}

func TestUpdateFileMetadataHandlerMissingFields(t *testing.T) {
	requestBody := map[string]string{
		"id": "test-id",
		// missing mime_type
	}
	jsonBody, _ := json.Marshal(requestBody)

	req, err := http.NewRequest("POST", "/api/update/file-metadata", bytes.NewBuffer(jsonBody))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(updateFileMetadataHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("Handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
	}
}