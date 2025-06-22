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

    // Set URL to home page explicitly
    window.history.pushState({}, '', '/')
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

    // Set URL to home page explicitly
    window.history.pushState({}, '', '/')
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

    // Set URL to home page explicitly
    window.history.pushState({}, '', '/')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/No folders found/)).toBeInTheDocument()
    })
  })

  test('プロフィールボタンがクリックできる', async () => {
    const user = userEvent.setup()
    mockFetch({ data: [mockFolderMetadata] })

    // Set URL to home page explicitly
    window.history.pushState({}, '', '/')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/メンバープロフィール/)).toBeInTheDocument()
    })

    await user.click(screen.getByText(/メンバープロフィール/))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profiles')
    })
  })

  test('APIエラー時にエラーメッセージが表示される', async () => {
    mockFetch(null, false)

    // Set URL to home page explicitly
    window.history.pushState({}, '', '/')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument()
    })
  })
})