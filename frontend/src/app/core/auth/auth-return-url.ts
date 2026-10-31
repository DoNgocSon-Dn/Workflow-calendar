/** Keep destinations internal when carrying them through auth pages and emails. */
export function safeAuthReturnUrl(value: string | null | undefined): string | undefined {
  return value && /^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(value)
    ? value
    : undefined;
}

export function authEmailRedirect(path: '/login' | '/reset-password', returnUrl?: string): string {
  const redirect = new URL(path, window.location.origin);
  const destination = safeAuthReturnUrl(returnUrl);
  if (destination) redirect.searchParams.set('returnUrl', destination);
  return redirect.href;
}
