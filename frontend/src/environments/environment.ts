const isBrowser = typeof window !== 'undefined';
const origin = isBrowser ? window.location.origin : 'http://localhost:4200';

export const environment = {
  production: false,
  apiUrl: origin,
  supabaseUrl: 'https://wdiuuhsfflragxuurwpk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXV1aHNmZmxyYWd4dXVyd3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNjc3MzksImV4cCI6MjEwMTg0MzczOX0.E51zfO0SoWwFT2LZkBoyuA4E89gbE_yBiwsY3odmWyE',
  // Khoá công khai VAPID cho Web Push (an toàn để lộ). Đổi ở đây thì phải đổi
  // VAPID_PRIVATE_KEY tương ứng trong backend/.env. Rỗng = tắt push phía client.
  vapidPublicKey:
    'BDpf9IsDbrbp1GFqjod7FNtpsUNRYtU3KbMeGDv1XMWgAbCJCugrk5Gw8uo_zvgXUPqtzRH4vezCCVdY_yv52Xo',
};
