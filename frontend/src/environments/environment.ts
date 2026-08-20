const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const environment = {
  production: false,
  apiUrl: `http://${host}:3000`,
  supabaseUrl: 'https://wdiuuhsfflragxuurwpk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXV1aHNmZmxyYWd4dXVyd3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNjc3MzksImV4cCI6MjEwMTg0MzczOX0.E51zfO0SoWwFT2LZkBoyuA4E89gbE_yBiwsY3odmWyE',
  // Standalone Socket.io Google-login demo (google-auth-server/), separate from Supabase auth.
  googleClientId: '309543368918-4m7slt8ed043i8b79jr07fhahmrda97d.apps.googleusercontent.com',
  socketAuthUrl: `http://${host}:4001`,
};

