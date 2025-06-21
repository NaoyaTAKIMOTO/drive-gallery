package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	folderPath := flag.String("path", "", "アップロードするフォルダのパス")
	targetFolderName := flag.String("folder-name", "", "アップロード先の論理フォルダ名 (例: 第1回)")
	apiBaseURL := flag.String("api-url", "http://localhost:8080", "バックエンドAPIのベースURL")

	flag.Parse()

	if *folderPath == "" || *targetFolderName == "" {
		fmt.Println("エラー: --path と --folder-name は必須です。")
		flag.Usage()
		os.Exit(1)
	}

	fmt.Printf("フォルダ '%s' を '%s' としてアップロードします。\n", *folderPath, *targetFolderName)

	err := filepath.Walk(*folderPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil // ディレクトリはスキップ
		}

		// ルートフォルダからの相対パスを取得
		relativePath, err := filepath.Rel(*folderPath, path)
		if err != nil {
			return fmt.Errorf("相対パスの取得に失敗しました: %v", err)
		}

		// Windowsパス区切り文字をUnix形式に変換
		relativePath = strings.ReplaceAll(relativePath, "\\", "/")

		fmt.Printf("ファイルをアップロード中: %s (相対パス: %s)\n", path, relativePath)

		file, err := os.Open(path)
		if err != nil {
			return fmt.Errorf("ファイルのオープンに失敗しました %s: %v", path, err)
		}
		defer file.Close()

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// ファイル内容を読み込み
		fileContent, err := io.ReadAll(file)
		if err != nil {
			return fmt.Errorf("ファイル内容の読み込みに失敗しました %s: %v", path, err)
		}

		// MIMEタイプを検出
		detectedMimeType := http.DetectContentType(fileContent)
		fmt.Printf("検出されたMIMEタイプ: %s\n", detectedMimeType)

		// ファイルフィールドの追加
		part, err := writer.CreateFormFile("file", filepath.Base(path))
		if err != nil {
			return fmt.Errorf("フォームファイル作成に失敗しました: %v", err)
		}
		_, err = part.Write(fileContent)
		if err != nil {
			return fmt.Errorf("ファイル内容の書き込みに失敗しました: %v", err)
		}

		// フォルダ名、相対パス、MIMEタイプフィールドの追加
		writer.WriteField("folder_name", *targetFolderName)
		writer.WriteField("relative_path", relativePath)
		writer.WriteField("mime_type", detectedMimeType) // MIMEタイプを追加

		err = writer.Close()
		if err != nil {
			return fmt.Errorf("マルチパートライターのクローズに失敗しました: %v", err)
		}

		req, err := http.NewRequest("POST", fmt.Sprintf("%s/api/upload/file", *apiBaseURL), body)
		if err != nil {
			return fmt.Errorf("リクエスト作成に失敗しました: %v", err)
		}
		req.Header.Set("Content-Type", writer.FormDataContentType())

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("HTTPリクエストの送信に失敗しました: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			respBody, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("アップロードに失敗しました。ステータス: %d, レスポンス: %s", resp.StatusCode, string(respBody))
		}

		fmt.Printf("アップロード成功: %s\n", relativePath)
		return nil
	})

	if err != nil {
		fmt.Printf("エラーが発生しました: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("すべてのファイルのアップロードが完了しました。")
}
