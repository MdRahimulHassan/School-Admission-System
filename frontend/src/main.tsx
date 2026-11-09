import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Bundled with the app (no internet needed): a typeface that renders Bangla and English well together.
import '@fontsource/hind-siliguri/400.css';
import '@fontsource/hind-siliguri/500.css';
import '@fontsource/hind-siliguri/600.css';
import '@fontsource/hind-siliguri/700.css';
import './styles.css';
import App from './App';
import { ErrorBoundary } from './components/Feedback';
import { LanguageProvider } from './lib/i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
);
