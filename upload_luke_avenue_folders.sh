#!/bin/bash

# アップロード対象のベースディレクトリ
BASE_DIR="/Users/takimotonaoya/Desktop/dev/drive-gallery/LukeAvenue"

# CLIアップローダーのパス
UPLOADER_PATH="./cli_uploader/uploader"

# アップロードするフォルダのリスト
FOLDERS=("第1回" "第2回" "第3回" "第4回" "第5回" "第6回" "第7回" "第8回" "第9回")

echo "Luke Avenue フォルダのアップロードを開始します..."

for FOLDER_NAME in "${FOLDERS[@]}"; do
    FULL_PATH="${BASE_DIR}/${FOLDER_NAME}"
    
    if [ -d "$FULL_PATH" ]; then
        echo "--------------------------------------------------"
        echo "フォルダ: ${FOLDER_NAME} のアップロードを開始します..."
        
        # CLIアップローダーを実行
        "${UPLOADER_PATH}" --path "${FULL_PATH}" --folder-name "${FOLDER_NAME}"
        
        if [ $? -eq 0 ]; then
            echo "フォルダ: ${FOLDER_NAME} のアップロードが完了しました。"
        else
            echo "エラー: フォルダ: ${FOLDER_NAME} のアップロードに失敗しました。"
        fi
    else
        echo "警告: フォルダ ${FULL_PATH} が見つかりませんでした。スキップします。"
    fi
done

echo "すべてのフォルダのアップロード処理が完了しました。"
