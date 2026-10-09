import { useSyncExternalStore } from 'react';
import { ProviderError } from '../providers/types';
const snapshot = () =>
  typeof navigator === 'undefined' || navigator.onLine !== false;
function subscribe(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}
export const useOnline = () =>
  useSyncExternalStore(subscribe, snapshot, () => true);
export function requireOnline() {
  if (!snapshot())
    throw new ProviderError(
      'network-cors',
      'You are offline. Loaded charts are retained; reconnect before requesting fresh provider data.',
    );
}
