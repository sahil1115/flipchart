import { validateCredential } from '../providers/twelve-data';
const storageKey = (provider: string) => `flipchart:credential:${provider}`;
export interface SavedCredential {
  credential: string;
  remembered: boolean;
  warning: string;
}
export function readCredential(provider = 'twelve-data'): SavedCredential {
  const key = storageKey(provider);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      typeof saved === 'object' &&
      saved !== null &&
      'version' in saved &&
      saved.version === 1 &&
      'credential' in saved &&
      typeof saved.credential === 'string'
    )
      return {
        credential: validateCredential(saved.credential),
        remembered: true,
        warning: '',
      };
    return { credential: '', remembered: false, warning: '' };
  } catch {
    return {
      credential: '',
      remembered: false,
      warning:
        'Saved-key storage is unavailable or invalid. Enter a key for this session.',
    };
  }
}
export function writeCredential(
  credential: string,
  remember: boolean,
  provider = 'twelve-data',
): boolean {
  const key = storageKey(provider);
  try {
    if (remember)
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          credential: validateCredential(credential),
        }),
      );
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
