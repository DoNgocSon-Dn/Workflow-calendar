/**
 * Sinh `src/environments/environment.prod.ts` từ biến môi trường lúc build.
 *
 * Vì sao: bản production (Vercel chạy `ng build`) thay `environment.ts` bằng
 * `environment.prod.ts`. Nếu để `apiUrl` cứng là placeholder thì web deploy
 * gọi API vào URL rác. Script này để Vercel truyền URL backend thật qua
 * biến môi trường `API_URL` (Settings → Environment Variables).
 *
 * Chạy: `node scripts/set-env.mjs` TRƯỚC `ng build` (xem calendar/vercel.json).
 *
 * Biến dùng (đều tùy chọn — thiếu thì lấy giá trị mặc định hiện tại):
 *   API_URL             URL công khai của backend NestJS (vd https://xxx.onrender.com)
 *   SUPABASE_URL        mặc định: project hiện tại
 *   SUPABASE_ANON_KEY   mặc định: key hiện tại
 *   VAPID_PUBLIC_KEY    mặc định: key hiện tại
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/environments/environment.prod.ts');

const DEFAULTS = {
  supabaseUrl: 'https://wdiuuhsfflragxuurwpk.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXV1aHNmZmxyYWd4dXVyd3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNjc3MzksImV4cCI6MjEwMTg0MzczOX0.E51zfO0SoWwFT2LZkBoyuA4E89gbE_yBiwsY3odmWyE',
  vapidPublicKey:
    'BDpf9IsDbrbp1GFqjod7FNtpsUNRYtU3KbMeGDv1XMWgAbCJCugrk5Gw8uo_zvgXUPqtzRH4vezCCVdY_yv52Xo',
};

const apiUrl = (process.env.API_URL ?? '').trim().replace(/\/+$/, '');
const supabaseUrl = (process.env.SUPABASE_URL ?? DEFAULTS.supabaseUrl).trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? DEFAULTS.supabaseAnonKey).trim();
const vapidPublicKey = (process.env.VAPID_PUBLIC_KEY ?? DEFAULTS.vapidPublicKey).trim();

// Không có API_URL: quay về dùng chính origin của trang (chỉ đúng khi backend
// nằm cùng domain). In cảnh báo to để không deploy nhầm mà không biết.
const apiUrlExpr = apiUrl
  ? JSON.stringify(apiUrl)
  : `(typeof window !== 'undefined' ? window.location.origin : '')`;

if (!apiUrl) {
  console.warn(
    '\n⚠️  set-env.mjs: CHƯA đặt biến API_URL — apiUrl sẽ trỏ về origin của web.\n' +
      '   Nếu backend deploy ở domain khác (Render/Railway...), app sẽ KHÔNG gọi được API.\n',
  );
} else {
  console.log(`set-env.mjs: apiUrl = ${apiUrl}`);
}

const contents = `// TỆP NÀY ĐƯỢC SINH TỰ ĐỘNG bởi scripts/set-env.mjs lúc build — đừng sửa tay.
export const environment = {
  production: true,
  apiUrl: ${apiUrlExpr},
  supabaseUrl: ${JSON.stringify(supabaseUrl)},
  supabaseAnonKey:
    ${JSON.stringify(supabaseAnonKey)},
  vapidPublicKey:
    ${JSON.stringify(vapidPublicKey)},
};
`;

writeFileSync(target, contents, 'utf8');
console.log(`set-env.mjs: đã ghi ${target}`);
