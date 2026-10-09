/** Only exact, credential-free application asset URLs are eligible. */
export function isShellRequest(request: Request, origin: string): boolean {
  const url = new URL(request.url);
  return (
    request.method === 'GET' &&
    url.origin === origin &&
    !url.search &&
    !request.headers.has('Authorization') &&
    !request.headers.has('X-API-Key') &&
    !request.headers.has('apikey')
  );
}
