/**
 * Lấy file THẬT ra khỏi một `DataTransfer`.
 *
 * Cùng một bộ hàm phục vụ CẢ HAI nguồn, vì trình duyệt đưa ra cùng một kiểu
 * dữ liệu: `ClipboardEvent.clipboardData` khi dán và `DragEvent.dataTransfer`
 * khi kéo-thả. Nhờ vậy chỉ có một cách hiểu "lần này có file hay không",
 * không mỗi màn hình hay mỗi nguồn tự đoán một kiểu.
 */

/**
 * Trả về các `File` thật sự có trong clipboard/DataTransfer.
 *
 * Đọc `files` trước vì đó là đường chuẩn và đầy đủ nhất, sau đó mới quét
 * `items` — không phải trình duyệt nào cũng điền cả hai. `getAsFile()` có thể
 * trả về null (item là text, hoặc trình duyệt từ chối cấp file), khi đó bỏ qua
 * thay vì dựng một File rỗng cho có.
 */
export function extractFiles(data: DataTransfer | null): File[] {
  if (!data) return [];

  const files: File[] = [];
  const seen = new Set<string>();
  const remember = (file: File): void => {
    // Cùng một file thường xuất hiện ở CẢ `files` lẫn `items`. Khoá theo
    // tên + kích thước + thời điểm sửa để không đếm nó hai lần.
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };

  for (const file of Array.from(data.files ?? [])) {
    if (file) remember(file);
  }

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    // Chỉ nhận khi trình duyệt đưa ra file thật. Không tự chế File giả.
    if (file) remember(file);
  }

  return files;
}

/**
 * Clipboard có chữ thật sự để dán hay không.
 *
 * Quyết định việc này để KHÔNG cướp thao tác dán văn bản thông thường: người
 * dùng copy một đoạn text rồi Ctrl+V thì phải được dán vào ô nhập như bình
 * thường, kể cả khi trong clipboard còn sót dữ liệu khác.
 */
export function hasMeaningfulText(data: DataTransfer | null): boolean {
  if (!data) return false;
  try {
    return data.getData('text/plain').trim().length > 0;
  } catch {
    // Một số ngữ cảnh chặn đọc clipboard — coi như không có text.
    return false;
  }
}

/**
 * Trình duyệt có TỰ KHAI rằng lần dán này mang theo file hay không.
 *
 * `DataTransfer.types` chứa "Files" khi nội dung clipboard là file (copy trong
 * File Explorer / Finder). Đây là tín hiệu đáng tin hơn việc suy đoán từ chỗ
 * có hay không có text: một số nền tảng kèm THÊM đường dẫn file dưới dạng
 * text/plain khi copy file, nên nếu chỉ dựa vào "có text thì ưu tiên text" thì
 * đúng thao tác dán file lại bị bỏ qua.
 */
export function signalsFiles(data: DataTransfer | null): boolean {
  if (!data) return false;
  try {
    return Array.from(data.types ?? []).includes('Files');
  } catch {
    return false;
  }
}

/** Kết quả chọn file khi hệ thống chỉ nhận một file mỗi lần. */
export interface PickedFile {
  readonly file: File | null;
  /** Số file bị bỏ qua, để còn nói cho người dùng biết. */
  readonly skipped: number;
}

/**
 * Lấy file đầu tiên và đếm phần bị bỏ lại.
 *
 * Gom vào đây để dán và kéo-thả không thể hành xử khác nhau khi người dùng
 * đưa vào nhiều file cùng lúc.
 */
export function pickSingleFile(data: DataTransfer | null): PickedFile {
  const files = extractFiles(data);
  return {
    file: files[0] ?? null,
    skipped: Math.max(files.length - 1, 0),
  };
}

/**
 * Câu thông báo khi phải bỏ bớt file. `null` nghĩa là không có gì bị bỏ.
 *
 * Dùng chung để ba nguồn file nói cùng một câu — im lặng nuốt mất file của
 * người dùng mới là điều không được phép.
 */
export function skippedFilesMessage(skipped: number): string | null {
  if (skipped <= 0) return null;
  return `Mỗi lần chỉ hỗ trợ một file. Đã bỏ qua ${skipped} file còn lại.`;
}
