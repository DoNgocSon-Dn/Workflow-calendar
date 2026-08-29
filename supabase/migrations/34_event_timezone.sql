-- Migration 34: Múi giờ cho sự kiện.
--
-- Thêm cột `start_tz` (tên IANA, vd 'America/New_York') lên bảng events.
-- Ý nghĩa: múi giờ mà sự kiện "thuộc về" — nơi cuộc họp thực sự diễn ra.
-- `start_at`/`end_at` vẫn là timestamptz (mốc UTC tuyệt đối) như cũ; cột này
-- chỉ để hiển thị lại đúng giờ gốc khi người xem ở múi giờ khác.
--
-- NULL = sự kiện không gắn múi giờ cụ thể (mọi sự kiện cũ, và sự kiện tạo ở
-- đúng múi giờ trình duyệt) — hiển thị theo múi giờ người xem, y như trước.
--
-- Idempotent. Chạy trong Supabase Dashboard > SQL Editor.

alter table public.events
  add column if not exists start_tz text;

comment on column public.events.start_tz is
  'Tên múi giờ IANA sự kiện thuộc về (NULL = theo múi giờ người xem). start_at/end_at vẫn là UTC.';
