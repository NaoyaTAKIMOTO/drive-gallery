import { test, expect } from '@playwright/test'

test.describe('Luke Avenue Drive Gallery', () => {
  test.beforeEach(async ({ page }) => {
    // モックAPIレスポンスを設定
    await page.route('**/api/folders', async route => {
      await route.fulfill({
        json: {
          data: [
            { id: 'folder1', name: '第1回', createdAt: '2023-01-01T00:00:00Z' },
            { id: 'folder2', name: '第2回', createdAt: '2023-02-01T00:00:00Z' },
          ]
        }
      })
    })

    await page.route('**/api/folder-name/**', async route => {
      await route.fulfill({
        json: { name: '第1回' }
      })
    })

    await page.route('**/api/files/**', async route => {
      await route.fulfill({
        json: {
          data: [
            {
              id: 'file1',
              name: 'test-image.jpg',
              mimeType: 'image/jpeg',
              storagePath: 'folder1/test-image.jpg',
              downloadUrl: 'https://via.placeholder.com/300x200/0066cc/ffffff?text=Test+Image',
              folderId: 'folder1',
              hash: 'abc123',
              createdAt: '2023-01-01T00:00:00Z'
            }
          ],
          nextPageToken: ''
        }
      })
    })

    await page.route('**/api/profiles', async route => {
      await route.fulfill({
        json: {
          data: [
            {
              id: 'profile1',
              name: '田中太郎',
              bio: '# プロフィール\n\n音楽が大好きです。',
              icon_url: 'https://via.placeholder.com/100x100/0066cc/ffffff?text=Profile'
            }
          ]
        }
      })
    })
  })

  test('ホームページの基本機能', async ({ page }) => {
    await page.goto('/')

    // ページタイトルを確認
    await expect(page).toHaveTitle(/Vite \+ React \+ TS/)

    // メインヘッダーを確認
    await expect(page.getByRole('heading', { name: 'Luke Avenue' })).toBeVisible()

    // フォルダーが表示されることを確認
    await expect(page.getByText('📁 第1回')).toBeVisible()
    await expect(page.getByText('📁 第2回')).toBeVisible()

    // プロフィールボタンが表示されることを確認
    await expect(page.getByText('メンバープロフィールを見る')).toBeVisible()
  })

  test('フォルダーナビゲーション', async ({ page }) => {
    await page.goto('/')

    // フォルダーをクリック
    await page.getByText('📁 第1回').click()

    // フォルダーページに遷移したことを確認
    await expect(page).toHaveURL(/\/folder\/folder1/)
    await expect(page.getByRole('heading', { name: 'Files in: 第1回' })).toBeVisible()

    // ファイルが表示されることを確認
    await expect(page.getByText('test-image.jpg')).toBeVisible()

    // 戻るリンクをテスト
    await page.getByText('↩ Back to Folders').click()
    await expect(page).toHaveURL('/')
  })

  test('ファイル表示とフィルタリング', async ({ page }) => {
    await page.goto('/folder/folder1')

    // ファイルが表示されることを確認
    await expect(page.getByText('test-image.jpg')).toBeVisible()

    // フィルターボタンが存在することを確認
    await expect(page.getByText('すべて')).toBeVisible()
    await expect(page.getByText('写真 📷')).toBeVisible()
    await expect(page.getByText('動画 🎥')).toBeVisible()

    // フィルターボタンのテスト
    await page.getByText('写真 📷').click()
    await expect(page.getByText('写真 📷')).toHaveClass(/active/)
  })

  test('ページネーション機能', async ({ page }) => {
    await page.goto('/folder/folder1')

    // ページネーションコントロールが表示されることを確認
    await expect(page.getByText('前へ')).toBeVisible()
    await expect(page.getByText('次へ')).toBeVisible()

    // ページ番号ボタンが表示されることを確認
    await expect(page.getByText('1')).toBeVisible()
    await expect(page.getByText('2')).toBeVisible()

    // 現在のページが1であることを確認
    await expect(page.getByText('1')).toHaveClass(/active/)

    // ページ2をクリック
    await page.getByText('2').click()
    // Note: モックデータではページ2に移動しないが、UIの動作を確認
  })

  test('画像モーダル機能', async ({ page }) => {
    await page.goto('/folder/folder1')

    // 画像をクリック
    await page.getByAltText('test-image.jpg').click()

    // モーダルが開くことを確認
    await expect(page.getByAltText('Selected Image')).toBeVisible()
    await expect(page.getByText('×')).toBeVisible()

    // モーダルを閉じる
    await page.getByText('×').click()
    await expect(page.getByAltText('Selected Image')).not.toBeVisible()
  })

  test('プロフィール機能', async ({ page }) => {
    await page.goto('/')

    // プロフィールページに移動
    await page.getByText('メンバープロフィールを見る').click()
    await expect(page).toHaveURL('/profiles')

    // プロフィール一覧ページの確認
    await expect(page.getByRole('heading', { name: 'メンバープロフィール' })).toBeVisible()
    await expect(page.getByText('田中太郎')).toBeVisible()
    await expect(page.getByText('新しいプロフィールを追加')).toBeVisible()

    // 戻るリンクのテスト
    await page.getByText('↩ トップページに戻る').click()
    await expect(page).toHaveURL('/')
  })

  test('ファイルアップロード機能の表示', async ({ page }) => {
    await page.goto('/folder/folder1')

    // アップロードセクションが表示されることを確認
    await expect(page.getByText('フォルダ/ファイルをアップロード')).toBeVisible()
    
    // ファイル入力が存在することを確認
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeVisible()
    await expect(fileInput).toHaveAttribute('webkitdirectory', 'true')
  })

  test('レスポンシブデザインのテスト', async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // モバイルでもメインコンテンツが表示されることを確認
    await expect(page.getByRole('heading', { name: 'Luke Avenue' })).toBeVisible()
    await expect(page.getByText('📁 第1回')).toBeVisible()

    // フォルダーページでもレスポンシブ対応を確認
    await page.getByText('📁 第1回').click()
    await expect(page.getByRole('heading', { name: 'Files in: 第1回' })).toBeVisible()
    await expect(page.getByText('test-image.jpg')).toBeVisible()
  })

  test('エラーハンドリング', async ({ page }) => {
    // APIエラーレスポンスをモック
    await page.route('**/api/folders', async route => {
      await route.fulfill({
        status: 500,
        json: { error: 'Internal server error' }
      })
    })

    await page.goto('/')

    // エラーメッセージが表示されることを確認
    await expect(page.getByText(/Error fetching folders/)).toBeVisible()
  })

  test('WebSocket接続のモック', async ({ page }) => {
    // WebSocket接続をモック
    await page.addInitScript(() => {
      class MockWebSocket {
        constructor(url: string) {
          setTimeout(() => {
            if (this.onopen) this.onopen({} as Event)
          }, 100)
        }
        
        send(data: string) {
          console.log('WebSocket send:', data)
        }
        
        close() {
          if (this.onclose) this.onclose({} as CloseEvent)
        }

        onopen: ((event: Event) => void) | null = null
        onmessage: ((event: MessageEvent) => void) | null = null
        onclose: ((event: CloseEvent) => void) | null = null
        onerror: ((event: Event) => void) | null = null
      }
      
      (window as any).WebSocket = MockWebSocket
    })

    await page.goto('/folder/folder1')
    
    // ページが正常に読み込まれることを確認（WebSocket接続エラーなし）
    await expect(page.getByRole('heading', { name: 'Files in: 第1回' })).toBeVisible()
  })
})

test.describe('キーボードナビゲーション', () => {
  test('キーボードでフォルダー選択', async ({ page }) => {
    await page.goto('/')
    
    // フォルダーにフォーカスを当てる
    await page.getByText('📁 第1回').focus()
    
    // Enterキーで選択
    await page.keyboard.press('Enter')
    
    // フォルダーページに遷移することを確認
    await expect(page).toHaveURL(/\/folder\/folder1/)
  })

  test('Escキーでモーダルを閉じる', async ({ page }) => {
    await page.goto('/folder/folder1')
    
    // 画像をクリックしてモーダルを開く
    await page.getByAltText('test-image.jpg').click()
    await expect(page.getByAltText('Selected Image')).toBeVisible()
    
    // Escキーでモーダルを閉じる
    await page.keyboard.press('Escape')
    await expect(page.getByAltText('Selected Image')).not.toBeVisible()
  })
})