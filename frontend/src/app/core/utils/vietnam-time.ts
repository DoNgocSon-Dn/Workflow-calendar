/**
 * Ngày lễ phải được xác định theo giờ Việt Nam (Asia/Ho_Chi_Minh), không phải
 * múi giờ trình duyệt của người dùng. VN không có DST nên lệch UTC luôn cố
 * định +7h — cộng thẳng vào timestamp rồi đọc bằng getUTC*() là đủ chính
 * xác, không cần Intl.DateTimeFormat.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Hôm nay" theo giờ Việt Nam, tại thời điểm `now` (dùng `Clock.now()`),
 *  trả về `Date` lúc 00:00 giờ địa phương của TRÌNH DUYỆT mang đúng ngày VN
 *  — để so sánh trực tiếp với `HolidayDateRule`/`resolveHolidaysForDate`
 *  vốn đọc year/month/date theo local getters như phần còn lại của app. */
export function todayInVietnam(now: Date): Date {
  const vnWallClock = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(vnWallClock.getUTCFullYear(), vnWallClock.getUTCMonth(), vnWallClock.getUTCDate());
}

/**
 * Đặt lịch chạy `callback` ngay sau nửa đêm giờ VN tiếp theo, rồi tự lặp lại
 * mỗi ngày sau đó — cho các state cần "biết hôm nay" luôn đúng dù tab mở
 * xuyên nửa đêm, không cần reload trang. Trả về hàm huỷ lịch.
 */
export function scheduleVietnamMidnightTick(clock: { now(): Date }, callback: () => void): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const scheduleNext = (): void => {
    if (cancelled) return;
    const nowMs = clock.now().getTime();
    const msIntoVnDay = (nowMs + VN_OFFSET_MS) % DAY_MS;
    const msUntilNextMidnight = DAY_MS - msIntoVnDay + 1000; // +1s: an vào sau mốc, không rơi đúng biên
    timeoutId = setTimeout(() => {
      if (cancelled) return;
      callback();
      scheduleNext();
    }, msUntilNextMidnight);
  };

  scheduleNext();
  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}
