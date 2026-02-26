import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AlertProvider } from './contexts/AlertContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <AlertProvider>
          <App />
        </AlertProvider>
      </SettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>
);