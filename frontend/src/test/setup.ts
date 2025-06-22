import '@testing-library/jest-dom'

// Mock環境変数
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Fetch APIのモック
global.fetch = vi.fn()

// Alert と Confirm のモック
global.alert = vi.fn()
global.confirm = vi.fn(() => true)

// WebSocketのモック
global.WebSocket = vi.fn().mockImplementation(() => ({
  readyState: 1,
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}))

// 環境変数のモック
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_API_BASE_URL: 'http://localhost:8080',
  },
  writable: true,
})