/**
 * Sinh link phòng họp trực tuyến cho một sự kiện hoặc một buổi họp nhóm.
 *
 * KHÔNG phải Google Meet, dù nhãn cũ trong giao diện từng ghi vậy. Mã phòng
 * `meet.google.com/xxx-yyyy-zzz` do server Google cấp qua Calendar API; app này
 * chỉ xin scope đăng nhập của Google nên không có đường nào tự sinh ra một mã
 * hợp lệ — một link "Google Meet" bịa ở client sẽ dẫn thẳng tới trang lỗi.
 *
 * Jitsi Meet thì ngược lại: phòng được tạo ngay lần đầu có người mở URL, không
 * cần gọi API trước, nên link sinh ở client là link chạy được thật.
 */
const MEETING_HOST = 'https://meet.jit.si';

/**
 * Bảng chữ bỏ hết ký tự dễ đọc nhầm khi có người chép tay link: `0`/`o`,
 * `1`/`l`. Đúng 32 ký tự, và 256 chia hết cho 32 — nhờ vậy lấy `byte % 32`
 * không lệch xác suất về đầu bảng như bảng có độ dài lẻ.
 */
const ROOM_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Mã phòng chia cụm 4 ký tự cho dễ đọc to, giống cách Google Meet chia 3-4-3. */
const ROOM_GROUPS = 3;
const ROOM_GROUP_LENGTH = 4;

/**
 * Mã phòng ngẫu nhiên, ví dụ `k7pq-3mwd-hj4b`.
 *
 * Dùng `crypto.getRandomValues` chứ KHÔNG dùng `Math.random()`: link phòng họp
 * là một capability URL — ai có link là vào được, không cần đăng nhập. 12 ký tự
 * từ bảng 32 ký tự cho 60 bit, đủ để không ai dò trúng phòng của nhóm khác.
 */
export function createMeetingRoomName(): string {
  const bytes = new Uint8Array(ROOM_GROUPS * ROOM_GROUP_LENGTH);
  crypto.getRandomValues(bytes);

  const chars = Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]);
  const groups: string[] = [];
  for (let i = 0; i < ROOM_GROUPS; i++) {
    groups.push(chars.slice(i * ROOM_GROUP_LENGTH, (i + 1) * ROOM_GROUP_LENGTH).join(''));
  }
  return groups.join('-');
}

/** Link đầy đủ, mở ra là vào thẳng phòng. */
export function createMeetingRoomLink(): string {
  return `${MEETING_HOST}/${createMeetingRoomName()}`;
}
