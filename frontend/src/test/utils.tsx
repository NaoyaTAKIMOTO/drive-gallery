import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

// テスト用のQueryClientを作成（エラーログを抑制）
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
  logger: {
    log: console.log,
    warn: console.warn,
    error: () => {}, // テスト中のエラーログを抑制
  },
})

// カスタムレンダー関数
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient()
  
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </BrowserRouter>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }

// モックデータ
export const mockFileMetadata = {
  id: '1',
  name: 'test-image.jpg',
  mimeType: 'image/jpeg',
  storagePath: 'folder1/test-image.jpg',
  downloadUrl: 'https://example.com/test-image.jpg',
  folderId: 'folder1',
  hash: 'abc123',
  createdAt: '2023-01-01T00:00:00Z',
}

export const mockFolderMetadata = {
  id: 'folder1',
  name: '第1回',
  createdAt: '2023-01-01T00:00:00Z',
}

export const mockPaginatedResponse = {
  data: [mockFileMetadata],
  nextPageToken: 'next-token',
}

// Fetch モックヘルパー
export const mockFetch = (data: unknown, ok = true) => {
  const fetchMock = vi.mocked(global.fetch)
  fetchMock.mockResolvedValueOnce({
    ok,
    json: async () => data,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
  } as Response)
}

// 複数の API コールを順番にモック
export const mockFetchSequence = (responses: Array<{ data: unknown; ok?: boolean }>) => {
  const fetchMock = vi.mocked(global.fetch)
  responses.forEach(({ data, ok = true }) => {
    fetchMock.mockResolvedValueOnce({
      ok,
      json: async () => data,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Internal Server Error',
    } as Response)
  })
}