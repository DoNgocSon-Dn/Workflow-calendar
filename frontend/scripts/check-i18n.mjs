/**
 * Đối chiếu khoá i18n ĐANG DÙNG với khoá ĐÃ KHAI BÁO.
 *
 * Lý do cần: `TranslationService.t()` fallback về chính tên khoá khi tra
 * không thấy. Đó là hành vi cố ý (hiện tên khoá còn hơn hiện ô trống), nhưng
 * hệ quả là khoá thiếu KHÔNG làm gãy build — nó lọt thẳng ra giao diện và chỉ
 * lộ ra khi có người nhìn thấy. Script này bắt lỗi đó ngay lúc dev.
 *
 * Kiểm 3 thứ:
 *   1. Khoá dùng trong .ts/.html mà chưa khai báo  -> LỖI, thoát mã 1
 *   2. Khoá có ở tiếng Việt mà thiếu bản tiếng Anh -> LỖI, thoát mã 1
 *   3. Khoá khai báo mà không nơi nào dùng          -> chỉ cảnh báo
 *
 *   npm run i18n:check
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(fileURLToPath(new URL('../src/app', import.meta.url)));
const DICT_FILE = join(APP_DIR, 'core/i18n/translations.ts');

/** Khoá chỉ xuất hiện trong ví dụ ở comment, không phải khoá thật. */
const IGNORED = new Set(['namespace.key']);

function collectDeclared(source) {
  // Tách theo từng khối ngôn ngữ để so được vi <-> en, thay vì gộp một rổ.
  const locales = {};
  const blocks = [...source.matchAll(/^\s{2}(\w+):\s*\{$/gm)];

  for (let i = 0; i < blocks.length; i++) {
    const name = blocks[i][1];
    const from = blocks[i].index;
    const to = i + 1 < blocks.length ? blocks[i + 1].index : source.length;
    locales[name] = new Set(
      [...source.slice(from, to).matchAll(/^\s*'([\w.]+)':/gm)].map((m) => m[1]),
    );
  }
  return locales;
}

function collectUsed(dir, found = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectUsed(full, found);
      continue;
    }
    if (!['.ts', '.html'].includes(extname(entry.name))) continue;
    if (full === DICT_FILE) continue;

    const src = readFileSync(full, 'utf8');
    // Bắt cả i18n.t('x') lẫn this.i18n.t('x'); bỏ qua biến động vì không
    // kiểm tĩnh được (vd. i18n.t(tab.labelKey)).
    for (const m of src.matchAll(/\bi18n\.t\(\s*'([\w.]+)'/g)) {
      const key = m[1];
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(relative(APP_DIR, full).split(String.fromCharCode(92)).join('/'));
    }
  }
  return found;
}

const dict = readFileSync(DICT_FILE, 'utf8');
const declared = collectDeclared(dict);
const localeNames = Object.keys(declared);
const base = localeNames[0];
const used = collectUsed(APP_DIR);

const problems = [];

// 1. Dùng mà chưa khai báo
const allDeclared = new Set(localeNames.flatMap((l) => [...declared[l]]));
for (const [key, files] of used) {
  if (IGNORED.has(key) || allDeclared.has(key)) continue;
  problems.push(`  [thieu] '${key}'  <- ${[...files].join(', ')}`);
}

// 2. Có ở ngôn ngữ gốc mà thiếu ở ngôn ngữ khác
for (const locale of localeNames.slice(1)) {
  for (const key of declared[base]) {
    if (!declared[locale].has(key)) {
      problems.push(`  [chua dich] '${key}'  co o '${base}' nhung thieu o '${locale}'`);
    }
  }
}

console.log(`Ngon ngu       : ${localeNames.join(', ')}`);
for (const l of localeNames) console.log(`  ${l}: ${declared[l].size} khoa`);
console.log(`Khoa dang dung : ${used.size}`);

// 3. Khai báo thừa — chỉ cảnh báo, vì có khoá được tra động qua biến.
const unused = [...declared[base]].filter((k) => !used.has(k));
if (unused.length > 0) {
  console.log(`\nCanh bao: ${unused.length} khoa khai bao ma khong thay dung truc tiep`);
  console.log('(co the dang duoc tra dong qua bien — kiem tra truoc khi xoa)');
  for (const k of unused.slice(0, 15)) console.log(`  ${k}`);
  if (unused.length > 15) console.log(`  ... va ${unused.length - 15} khoa nua`);
}

if (problems.length > 0) {
  console.error(`\nCO ${problems.length} VAN DE:`);
  problems.forEach((p) => console.error(p));
  process.exit(1);
}

console.log('\nOK — khong co khoa thieu hay chua dich.');
