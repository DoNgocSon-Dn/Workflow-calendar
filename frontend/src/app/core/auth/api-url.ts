/** Match the API origin and path boundary before attaching a user's token. */
export function isApiRequest(requestUrl: string, apiUrl: string): boolean {
  try {
    const request = new URL(requestUrl);
    const api = new URL(apiUrl);
    if (!['http:', 'https:'].includes(api.protocol) || request.origin !== api.origin
      || request.username || request.password) return false;
    const path = api.pathname.replace(/\/+$/, '');
    return !path || request.pathname === path || request.pathname.startsWith(`${path}/`);
  } catch {
    return false;
  }
}
