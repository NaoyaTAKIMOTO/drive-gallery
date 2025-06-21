package main

import (
	"bytes"
	"context"
	"crypto/sha256" // Add crypto/sha256 import
	"encoding/hex"   // Add encoding/hex import
	"encoding/json"  // Add encoding/json import
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings" // Add strings import
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
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

var (
	// Client is the global Firestore client instance.
	Client *firestore.Client
)

const FilesCollection = "files"

func initFirebase(ctx context.Context, projectID, serviceAccountJSONPath string) error {
	var opts []option.ClientOption
	var err error

	if projectID == "" {
		return fmt.Errorf("project ID cannot be empty")
	}

	config := &firebase.Config{
		ProjectID: projectID,
	}

	if serviceAccountJSONPath != "" {
		opts = append(opts, option.WithCredentialsFile(serviceAccountJSONPath))
	}

	app, err := firebase.NewApp(ctx, config, opts...)
	if err != nil {
		return fmt.Errorf("error initializing Firebase app: %v", err)
	}

	Client, err = app.Firestore(ctx)
	if err != nil {
		return fmt.Errorf("error getting Firestore client: %v", err)
	}
	return nil
}

func main() {
	folderPath := flag.String("path", "", "メタデータを更新するフォルダのパス")
	targetFolderName := flag.String("folder-name", "", "更新対象の論理フォルダ名 (例: 第1回)") // 新しい引数
	apiBaseURL := flag.String("api-url", "http://localhost:8080", "バックエンドAPIのベースURL")
	projectID := flag.String("project-id", "", "FirebaseプロジェクトID")
	serviceAccountJSONPath := flag.String("service-account", "", "FirebaseサービスアカウントJSONファイルのパス (オプション)")

	flag.Parse()

	if *folderPath == "" || *projectID == "" || *targetFolderName == "" { // targetFolderNameも必須に
		fmt.Println("エラー: --path, --project-id, --folder-name は必須です。")
		flag.Usage()
		os.Exit(1)
	}

	ctx := context.Background()
	err := initFirebase(ctx, *projectID, *serviceAccountJSONPath)
	if err != nil {
		log.Fatalf("Firebaseの初期化に失敗しました: %v", err)
	}

	fmt.Printf("フォルダ '%s' 内のファイルのメタデータを更新します。\n", *folderPath)

	err = filepath.Walk(*folderPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil // ディレクトリはスキップ
		}

		// ファイル内容を読み込み
		fileContent, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("ファイル内容の読み込みに失敗しました %s: %v", path, err)
		}

		// MIMEタイプを検出
		detectedMimeType := http.DetectContentType(fileContent)
		fmt.Printf("ファイル: %s, 検出されたMIMEタイプ: %s\n", path, detectedMimeType)

		// ルートフォルダからの相対パスを取得
		relativePath, err := filepath.Rel(*folderPath, path)
		if err != nil {
			return fmt.Errorf("相対パスの取得に失敗しました: %v", err)
		}
		// Windowsパス区切り文字をUnix形式に変換
		relativePath = strings.ReplaceAll(relativePath, "\\", "/")

		// Firebase Storage上のパスを構築 (例: "第1回/subfolder/image.jpg")
		storagePathInFirebase := fmt.Sprintf("%s/%s", *targetFolderName, relativePath)

		// Firestoreから既存のファイルメタデータを検索 (StoragePathで検索)
		var firestoreDocID string
		iter := Client.Collection(FilesCollection).Where("storagePath", "==", storagePathInFirebase).Documents(ctx)
		doc, err := iter.Next()
		if err == nil {
			// ドキュメントが見つかった
			var existingFile FileMetadata
			if err := doc.DataTo(&existingFile); err != nil {
				log.Printf("警告: 既存のファイルメタデータのアンマーシャルに失敗しました %s: %v", doc.Ref.ID, err)
				return nil // スキップして次へ
			}
			firestoreDocID = existingFile.ID
		} else if err == iterator.Done {
			// ドキュメントが見つからなかった
			fmt.Printf("警告: StoragePath '%s' に対応する既存のメタデータが見つかりませんでした。スキップします。\n", storagePathInFirebase)
			return nil // スキップして次へ
		} else {
			return fmt.Errorf("Firestoreクエリに失敗しました: %v", err)
		}

		// バックエンドのAPIを呼び出してメタデータを更新
		updateURL := fmt.Sprintf("%s/api/update/file-metadata", *apiBaseURL)
		
		// JSON形式でデータを送信
		updateData := map[string]string{
			"id":        firestoreDocID,
			"mime_type": detectedMimeType,
		}
		jsonData, err := json.Marshal(updateData)
		if err != nil {
			return fmt.Errorf("JSONエンコードに失敗しました: %v", err)
		}

		req, err := http.NewRequest("POST", updateURL, bytes.NewBuffer(jsonData))
		if err != nil {
			return fmt.Errorf("リクエスト作成に失敗しました: %v", err)
		}
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("HTTPリクエストの送信に失敗しました: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			respBody, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("メタデータ更新に失敗しました。ステータス: %d, レスポンス: %s", resp.StatusCode, string(respBody))
		}

		fmt.Printf("メタデータ更新成功: %s (MIMEタイプ: %s)\n", path, detectedMimeType)
		return nil
	})

	if err != nil {
		fmt.Printf("エラーが発生しました: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("すべてのファイルのメタデータ更新が完了しました。")
}

// calculateFileHash calculates the SHA256 hash of the given content.
// This function is no longer used for searching, but kept for completeness if needed elsewhere.
func calculateFileHash(content []byte) (string, error) {
	hasher := sha256.New()
	_, err := hasher.Write(content)
	if err != nil {
		return "", fmt.Errorf("failed to write content to hasher: %v", err)
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}
