import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import {
  applyTheme,
  loadThemeFont,
  notebook,
  resolveTheme,
} from './themes/themes';
import { readThemePreference } from './storage/theme-preference';
import '@fontsource/patrick-hand/400.css';
import './styles.css';

const preference = readThemePreference();
const theme = resolveTheme(preference.themeId);
applyTheme(theme, preference.reducedEffects);
// Preload the bundled Notebook font for everyone so switching is instant; if
// Notebook is active, wait briefly so charts measure the real handwriting font.
const notebookFont = loadThemeFont(notebook);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});
const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );
if (theme.id === notebook.id)
  void Promise.race([
    notebookFont,
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]).then(render);
else render();
