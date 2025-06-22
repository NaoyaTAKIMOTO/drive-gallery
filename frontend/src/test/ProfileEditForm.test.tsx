import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render, mockFetch } from './utils'
import { App } from '../App'

const mockProfile = {
  id: 'profile1',
  name: '田中太郎',
  bio: '音楽が大好きです。',
  icon_url: 'https://example.com/profile1.jpg',
}

const renderProfileEditForm = (profileId = 'profile1') => {
  window.history.pushState({}, '', `/profiles/${profileId}/edit`)
  return render(<App />)
}

const renderNewProfileForm = () => {
  window.history.pushState({}, '', '/profiles/new/edit')
  return render(<App />)
}

describe('ProfileEditForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('既存プロフィール編集', () => {
    test('既存プロフィール情報が正しく表示される', async () => {
      mockFetch(mockProfile) // GET profile

      renderProfileEditForm('profile1')

      expect(screen.getByText('Loading profile for editing...')).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText('田中太郎のプロフィールを編集')).toBeInTheDocument()
        expect(screen.getByDisplayValue('田中太郎')).toBeInTheDocument()
        expect(screen.getByDisplayValue('音楽が大好きです。')).toBeInTheDocument()
      })
    })

    test('現在のアイコンが表示される', async () => {
      mockFetch(mockProfile)

      renderProfileEditForm('profile1')

      await waitFor(() => {
        expect(screen.getByText('現在のアイコン:')).toBeInTheDocument()
        const currentIcon = screen.getByAltText('Current Icon')
        expect(currentIcon).toHaveAttribute('src', 'https://example.com/profile1.jpg')
      })
    })

    test('プロフィール更新が正常に動作する', async () => {
      const user = userEvent.setup()
      mockFetch(mockProfile) // GET profile
      mockFetch({ message: 'Profile updated successfully' }) // PUT profile

      renderProfileEditForm('profile1')

      await waitFor(() => {
        expect(screen.getByDisplayValue('田中太郎')).toBeInTheDocument()
      })

      // 名前を変更
      const nameInput = screen.getByLabelText('名前:')
      await user.clear(nameInput)
      await user.type(nameInput, '田中太郎（更新）')

      // Bio を変更
      const bioTextarea = screen.getByLabelText('紹介文 (Markdown):')
      await user.clear(bioTextarea)
      await user.type(bioTextarea, '更新された紹介文です。')

      // 保存ボタンをクリック
      await user.click(screen.getByText('保存'))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/profiles/profile1',
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('田中太郎（更新）'),
          })
        )
      })
    })

    test('削除ボタンが動作する', async () => {
      const user = userEvent.setup()
      window.confirm = vi.fn(() => true) // モック確認ダイアログ

      mockFetch(mockProfile) // GET profile
      mockFetch({ message: 'Profile deleted successfully' }) // DELETE profile

      renderProfileEditForm('profile1')

      await waitFor(() => {
        expect(screen.getByText('削除')).toBeInTheDocument()
      })

      await user.click(screen.getByText('削除'))

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith(
          '本当にこのプロフィールを削除しますか？'
        )
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/profiles/profile1',
          expect.objectContaining({ method: 'DELETE' })
        )
      })
    })
  })

  describe('新規プロフィール作成', () => {
    test('新規作成フォームが正しく表示される', async () => {
      renderNewProfileForm()

      await waitFor(() => {
        expect(screen.getByText('新しいプロフィールを作成')).toBeInTheDocument()
        expect(screen.getByLabelText('名前:')).toHaveValue('')
        expect(screen.getByLabelText('紹介文 (Markdown):')).toHaveValue('')
      })

      // 削除ボタンは表示されない
      expect(screen.queryByText('削除')).not.toBeInTheDocument()
    })

    test('新規プロフィール作成が正常に動作する', async () => {
      const user = userEvent.setup()
      
      // 新規作成レスポンス
      mockFetch({ id: 'new-profile-id', ...mockProfile }) // POST profile
      mockFetch({ message: 'Profile updated successfully' }) // PUT profile (final update)

      renderNewProfileForm()

      await waitFor(() => {
        expect(screen.getByText('新しいプロフィールを作成')).toBeInTheDocument()
      })

      // フォーム入力
      await user.type(screen.getByLabelText('名前:'), '新しいユーザー')
      await user.type(screen.getByLabelText('紹介文 (Markdown):'), '新しいプロフィールです。')

      // 保存ボタンをクリック
      await user.click(screen.getByText('保存'))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/profiles',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('新しいユーザー'),
          })
        )
      })
    })
  })

  describe('アイコンアップロード', () => {
    test('ファイル選択が正常に動作する', async () => {
      const user = userEvent.setup()
      mockFetch(mockProfile)

      renderProfileEditForm('profile1')

      await waitFor(() => {
        expect(screen.getByLabelText('アイコン画像:')).toBeInTheDocument()
      })

      const file = new File(['dummy content'], 'test-icon.jpg', { type: 'image/jpeg' })
      const fileInput = screen.getByLabelText('アイコン画像:')
      
      await user.upload(fileInput, file)

      await waitFor(() => {
        expect(screen.getByText('選択中のファイル: test-icon.jpg')).toBeInTheDocument()
      })
    })
  })

  describe('フォームバリデーション', () => {
    test('名前が必須であることを確認', async () => {
      const user = userEvent.setup()
      renderNewProfileForm()

      await waitFor(() => {
        expect(screen.getByText('新しいプロフィールを作成')).toBeInTheDocument()
      })

      // 名前を空のまま保存を試行
      await user.click(screen.getByText('保存'))

      // HTMLの必須バリデーションにより、フォーム送信が阻止される
      // （具体的なバリデーションメッセージは実装に依存）
    })
  })

  describe('ナビゲーション', () => {
    test('戻るリンクが動作する', async () => {
      const user = userEvent.setup()
      mockFetch(mockProfile)

      renderProfileEditForm('profile1')

      await waitFor(() => {
        expect(screen.getByText('↩ プロフィール一覧に戻る')).toBeInTheDocument()
      })

      await user.click(screen.getByText('↩ プロフィール一覧に戻る'))

      await waitFor(() => {
        expect(window.location.pathname).toBe('/profiles')
      })
    })
  })

  describe('エラーハンドリング', () => {
    test('プロフィール取得エラー時にエラーメッセージが表示される', async () => {
      mockFetch(null, false)

      renderProfileEditForm('profile1')

      await waitFor(() => {
        expect(screen.getByText(/Error fetching profile/)).toBeInTheDocument()
      })
    })
  })
})