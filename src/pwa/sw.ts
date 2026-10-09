/// <reference lib="webworker" />
import {
  precache,
  matchPrecache,
  createHandlerBoundToURL,
  cleanupOutdatedCaches,
} from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { isShellRequest } from './cache-policy';
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

setCacheNameDetails({ prefix: 'flipchart', suffix: self.registration.scope });
const entries = self.__WB_MANIFEST;
const urls = new Set(
  entries.map(
    (entry) =>
      new URL(
        typeof entry === 'string' ? entry : entry.url,
        self.registration.scope,
      ).href,
  ),
);
precache(entries);
cleanupOutdatedCaches();
// No runtime cache, broad navigation fallback, or cross-origin route exists.
registerRoute(
  ({ request, url }) =>
    isShellRequest(request, self.location.origin) && urls.has(url.href),
  async ({ request, url }) => (await matchPrecache(url.href)) ?? fetch(request),
);
const index = new URL('index.html', self.registration.scope).href;
registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' &&
    isShellRequest(request, self.location.origin) &&
    (url.href === self.registration.scope || url.href === index),
  createHandlerBoundToURL(index),
);
clientsClaim();
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
