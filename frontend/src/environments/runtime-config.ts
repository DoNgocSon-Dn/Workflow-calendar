interface PublicConnection {
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}
declare global {
  interface Window {
    __workflowConnection?: PublicConnection;
  }
}
export function runtimeConnection(): PublicConnection {
  return typeof window === 'undefined' ? {} : (window.__workflowConnection ?? {});
}
