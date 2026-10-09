import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerSW } from 'virtual:pwa-register';
import { GlassPanel } from '../components/GlassPanel';
import { useOnline } from './network';
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export function PwaControls() {
  const online = useOnline();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [ready, setReady] = useState(false),
    [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const capture = (event: Event) => {
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        event.preventDefault();
        setInstall(event as InstallEvent);
      }
    };
    const installed = () => {
      setInstall(null);
      setStatus('FlipChart installed. Browser use remains available.');
    };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let mounted = true;
    const reload = registerSW({
      immediate: true,
      onOfflineReady: () => {
        if (mounted) setReady(true);
      },
      onNeedRefresh: () => {
        if (mounted) setUpdate(() => () => reload(true));
      },
      onRegisterError: () => {
        if (mounted)
          setStatus(
            'Offline shell could not be saved. Browser use still works while connected.',
          );
      },
    });
    return () => {
      mounted = false;
    };
  }, []);
  const readiness = document.getElementById('offline-readiness');
  return (
    <>
      {ready &&
        readiness &&
        createPortal(
          <p className="small" role="status">
            Application shell saved for offline use. Demo/import datasets use
            their separate local library; provider data is never saved by the
            service worker.
          </p>,
          readiness,
        )}
      {!online && (
        <div className="notice" role="status">
          Offline. Demo and saved CSV data remain available with their original
          source and dates. Loaded provider charts are retained; fresh requests
          need internet access.
        </div>
      )}
      {(install || update || status) && (
        <GlassPanel
          className="pwa-controls"
          aria-label="Application availability"
        >
          {install && (
            <button
              onClick={() => {
                const event = install;
                setInstall(null);
                void event
                  .prompt()
                  .then(() => event.userChoice)
                  .then((choice) =>
                    setStatus(
                      choice.outcome === 'accepted'
                        ? 'Installation accepted.'
                        : 'Installation dismissed; continue in your browser.',
                    ),
                  )
                  .catch(() =>
                    setStatus(
                      'Installation is unavailable; continue in your browser.',
                    ),
                  );
              }}
            >
              Install FlipChart
            </button>
          )}
          {update && (
            <>
              <p role="status">
                An application update is ready. Finish pending imports/exports
                first. Saved datasets and preferences stay; memory-only keys and
                live data require reconnecting after reload.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void update().catch(() => {
                    setBusy(false);
                    setStatus(
                      'Update could not finish. Try again when connected.',
                    );
                  });
                }}
              >
                Update and reload
              </button>
              <button disabled={busy} onClick={() => setUpdate(null)}>
                Later
              </button>
            </>
          )}
          {status && <p role="status">{status}</p>}
        </GlassPanel>
      )}
    </>
  );
}
