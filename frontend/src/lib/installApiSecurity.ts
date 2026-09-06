import { API_ROOT } from '../config/api';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken = '';
let csrfRequest: Promise<string> | null = null;
let installed = false;
let originalFetch: typeof window.fetch | null = null;

const isApiRequest = (value: string): boolean => {
  const requestUrl = new URL(value, window.location.href);
  const apiUrl = new URL(API_ROOT, window.location.href);
  const apiPath = apiUrl.pathname.replace(/\/+$/, '');
  return requestUrl.origin === apiUrl.origin
    && (requestUrl.pathname === apiPath || requestUrl.pathname.startsWith(`${apiPath}/`));
};

export const obtainApiCsrfToken = async (forceRefresh = false): Promise<string> => {
  if (typeof window === 'undefined') throw new Error('CSRF tokens are only available in the browser.');
  if (forceRefresh) csrfToken = '';
  if (csrfToken) return csrfToken;
  if (csrfRequest) return csrfRequest;

  const request = originalFetch || window.fetch.bind(window);
  csrfRequest = request(`${API_ROOT}/csrf.php`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      const token = typeof payload?.csrf_token === 'string' ? payload.csrf_token : '';
      if (!response.ok || !token) throw new Error('Unable to establish a secure session token.');
      csrfToken = token;
      return token;
    })
    .finally(() => {
      csrfRequest = null;
    });

  return csrfRequest;
};

export const installApiSecurity = (): void => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);
  originalFetch = nativeFetch;

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const inputUrl = input instanceof Request ? input.url : input.toString();
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!UNSAFE_METHODS.has(method) || !isApiRequest(inputUrl)) {
      return nativeFetch(input, init);
    }

    const execute = async (forceRefresh = false): Promise<Response> => {
      const token = await obtainApiCsrfToken(forceRefresh);
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      headers.set('X-CSRF-Token', token);

      const requestInput = input instanceof Request ? input.clone() : input;
      return nativeFetch(requestInput, {
        ...init,
        credentials: init.credentials || 'include',
        headers,
      });
    };

    let response = await execute();
    if (response.status === 419) response = await execute(true);
    return response;
  };
};
