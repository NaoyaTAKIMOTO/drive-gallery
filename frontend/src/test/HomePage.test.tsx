import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render, mockFetch, mockFolderMetadata } from './utils'
import { App } from '../App'

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('フォルダー一覧が正しく表示される', async () => {
    mockFetch({ data: [mockFolderMetadata] })

    render(<App />)

    expect(screen.getByText('Loading folders...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Luke Avenue')).toBeInTheDocument()
      expect(screen.getByText('📁 第1回')).toBeInTheDocument()
    })
  })

  test('フォルダーをクリックするとフォルダーページに遷移する', async () => {
    const user = userEvent.setup()
    mockFetch({ data: [mockFolderMetadata] })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('📁 第1回')).toBeInTheDocument()
    })

    await user.click(screen.getByText('📁 第1回'))

    // URLの変化やページ遷移を確認
    await waitFor(() => {
      expect(window.location.pathname).toBe('/folder/folder1')
    })
  })

  test('フォルダーが見つからない場合のメッセージが表示される', async () => {
    mockFetch({ data: [] })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('No folders found in the root directory.')).toBeInTheDocument()
    })
  })

  test('プロフィールボタンがクリックできる', async () => {
    const user = userEvent.setup()
    mockFetch({ data: [mockFolderMetadata] })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('メンバープロフィールを見る')).toBeInTheDocument()
    })

    await user.click(screen.getByText('メンバープロフィールを見る'))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profiles')
    })
  })

  test('APIエラー時にエラーメッセージが表示される', async () => {
    mockFetch(null, false)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Error fetching folders/)).toBeInTheDocument()
    })
  })
})