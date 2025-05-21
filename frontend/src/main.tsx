// import { StrictMode } from 'react' // Comment out StrictMode
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  // <StrictMode> // Comment out StrictMode
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  // </StrictMode>, // Comment out StrictMode
)
