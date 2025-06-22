import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render, mockFetchSequence, mockFileMetadata, mockPaginatedResponse } from './utils'
import { App } from '../App'

// テスト用のRouterでFolderPageを直接テスト
const renderFolderPage = (folderId = 'folder1') => {
  // URLを設定してFolderPageをレンダリング
  window.history.pushState({}, '', `/folder/${folderId}`)
  return render(<App />)
}

describe('FolderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('ファイル一覧が正しく表示される', async () => {
    // フォルダー名とファイル一覧のAPIをモック
    mockFetchSequence([
      { data: '第1回' }, // folder name API
      { data: mockPaginatedResponse } // files API
    ])

    renderFolderPage('folder1')

    await waitFor(() => {
      expect(screen.getByText('Files in: 第1回')).toBeInTheDocument()
      expect(screen.getByText('test-image.jpg')).toBeInTheDocument()
    })
  })

  test('フィルターボタンが動作する', async () => {
    const user = userEvent.setup()
    mockFetchSequence([
      { data: '第1回' }, // folder name API
      { data: mockPaginatedResponse }, // initial files API
      { data: mockPaginatedResponse } // filtered files API
    ])

    renderFolderPage('folder1')

    await waitFor(() => {
      expect(screen.getByText('すべて')).toBeInTheDocument()
    })

    // 写真フィルターをクリック
    await user.click(screen.getByText('写真 📷'))

    // フィルターが適用されたAPIリクエストが送信されることを確認
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('&filter=image')
      )
    })
  })

  test('ページネーションが正しく動作する', async () => {
    const user = userEvent.setup()
    mockFetchSequence([
      { data: '第1回' }, // folder name API
      { data: {
        data: [mockFileMetadata],
        nextPageToken: 'page2-token'
      }}, // initial files API
      { data: mockPaginatedResponse } // next page API
    ])

    renderFolderPage('folder1')

    await waitFor(() => {
      expect(screen.getByText('次へ')).toBeInTheDocument()
    })

    // 次へボタンをクリック
    await user.click(screen.getByText('次へ'))

    // ページ2のAPIリクエストが送信されることを確認
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('pageToken=page2-token')
      )
    })
  })

  test('ページ番号クリックでページ移動する', async () => {
    const user = userEvent.setup()
    mockFetchSequence([
      { data: '第1回' }, // folder name API
      { data: mockPaginatedResponse }, // initial files API
      { data: mockPaginatedResponse } // page 2 API when clicking
    ])

    renderFolderPage('folder1')

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    // ページ2をクリック
    await user.click(screen.getByText('2'))

    // ページ2への移動処理が実行されることを確認
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/pageToken=.*/)
      )
    })
  })

  test('画像をクリックするとモーダルが開く', async () => {
    const user = userEvent.setup()
    mockFetchSequence([
      { data: '第1回' }, // folder name API
      { data: mockPaginatedResponse } // files API
    ])

    renderFolderPage('folder1')

    await waitFor(() => {
      expect(screen.getByAltText('test-image.jpg')).toBeInTheDocument()
    })

    // 画像をクリック
    await user.click(screen.getByAltText('test-image.jpg'))

    // モーダルが開くことを確認
    await waitFor(() => {
      expect(screen.getByAltText('Selected Image')).toBeInTheDocument()
      expect(screen.getByText('×')).toBeInTheDocument()
    })
  })

  test('ファイルアップロード機能が表示される', async () => {
    mockFetchSequence([
      { data: '第1回' }, // folder name API
      { data: mockPaginatedResponse } // files API
    ])

    renderFolderPage('folder1')

    await waitFor(() => {
      expect(screen.getByText('フォルダ/ファイルをアップロード')).toBeInTheDocument()
    })
  })

  test('戻るリンクが動作する', async () => {
    const user = userEvent.setup()
    mockFetchSequence([
      { data: '第1回' }, // folder name API
      { data: mockPaginatedResponse } // files API
    ])

    renderFolderPage('folder1')

    await waitFor(() => {
      expect(screen.getByText('↩ Back to Folders')).toBeInTheDocument()
    })

    await user.click(screen.getByText('↩ Back to Folders'))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
    })
  })
})