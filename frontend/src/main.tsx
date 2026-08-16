import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { SystemSettingsProvider } from './contexts/SystemSettingsContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <SystemSettingsProvider>
          <App />
        </SystemSettingsProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
