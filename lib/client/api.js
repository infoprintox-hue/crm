export async function api(path, options = {}) {
  const startedAt = Date.now();
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Visitinglink API]', { method, path, status: response.status, durationMs: Date.now() - startedAt });
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VL_API_LOGS === 'true') {
    console.info('[Visitinglink API]', { method, path, status: response.status, durationMs: Date.now() - startedAt });
  }
  return body;
}
