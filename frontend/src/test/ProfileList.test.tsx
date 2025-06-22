import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render, mockFetch } from './utils'
import { App } from '../App'

const mockProfile = {
  id: 'profile1',
  name: '田中太郎',
  bio: '# プロフィール\n\n音楽が大好きです。\n\n- ギター歴5年\n- 好きなジャンル: ロック',
  icon_url: 'https://example.com/profile1.jpg',
}

const renderProfileList = () => {
  window.history.pushState({}, '', '/profiles')
  return render(<App />)
}

describe('ProfileList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('プロフィール一覧が正しく表示される', async () => {
    mockFetch({ data: [mockProfile] })

    renderProfileList()

    expect(screen.getByText('Loading profiles...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('メンバープロフィール')).toBeInTheDocument()
      expect(screen.getByText('田中太郎')).toBeInTheDocument()
      expect(screen.getByText('プロフィール')).toBeInTheDocument() // Markdown rendered
    })
  })

  test('プロフィールアイコンが正しく表示される', async () => {
    mockFetch({ data: [mockProfile] })

    renderProfileList()

    await waitFor(() => {
      const iconImage = screen.getByAltText('田中太郎')
      expect(iconImage).toBeInTheDocument()
      expect(iconImage).toHaveAttribute('src', 'https://example.com/profile1.jpg')
    })
  })

  test('編集ボタンがクリックできる', async () => {
    const user = userEvent.setup()
    mockFetch({ data: [mockProfile] })

    renderProfileList()

    await waitFor(() => {
      expect(screen.getByText('編集')).toBeInTheDocument()
    })

    await user.click(screen.getByText('編集'))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profiles/profile1/edit')
    })
  })

  test('新しいプロフィール追加ボタンがクリックできる', async () => {
    const user = userEvent.setup()
    mockFetch({ data: [mockProfile] })

    renderProfileList()

    await waitFor(() => {
      expect(screen.getByText('新しいプロフィールを追加')).toBeInTheDocument()
    })

    await user.click(screen.getByText('新しいプロフィールを追加'))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profiles/new/edit')
    })
  })

  test('プロフィールが見つからない場合のメッセージが表示される', async () => {
    mockFetch({ data: [] })

    renderProfileList()

    await waitFor(() => {
      expect(screen.getByText('プロフィールが見つかりませんでした。')).toBeInTheDocument()
    })
  })

  test('Markdownコンテンツが正しくレンダリングされる', async () => {
    mockFetch({ data: [mockProfile] })

    renderProfileList()

    await waitFor(() => {
      // Markdownがレンダリングされてリストアイテムが表示される
      expect(screen.getByText('ギター歴5年')).toBeInTheDocument()
      expect(screen.getByText('好きなジャンル: ロック')).toBeInTheDocument()
    })
  })

  test('戻るボタンが動作する', async () => {
    const user = userEvent.setup()
    mockFetch({ data: [mockProfile] })

    renderProfileList()

    await waitFor(() => {
      expect(screen.getByText('↩ トップページに戻る')).toBeInTheDocument()
    })

    await user.click(screen.getByText('↩ トップページに戻る'))

    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
    })
  })

  test('APIエラー時にエラーメッセージが表示される', async () => {
    mockFetch(null, false)

    renderProfileList()

    await waitFor(() => {
      expect(screen.getByText(/Error fetching profiles/)).toBeInTheDocument()
    })
  })

  test('複数プロフィールが正しく表示される', async () => {
    const profiles = [
      { ...mockProfile, id: 'profile1', name: '田中太郎' },
      { ...mockProfile, id: 'profile2', name: '佐藤花子' },
      { ...mockProfile, id: 'profile3', name: '鈴木次郎' },
    ]
    mockFetch({ data: profiles })

    renderProfileList()

    await waitFor(() => {
      expect(screen.getByText('田中太郎')).toBeInTheDocument()
      expect(screen.getByText('佐藤花子')).toBeInTheDocument()
      expect(screen.getByText('鈴木次郎')).toBeInTheDocument()
      
      // 3つの編集ボタンが存在する
      const editButtons = screen.getAllByText('編集')
      expect(editButtons).toHaveLength(3)
    })
  })
})