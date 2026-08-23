-- Dọn dữ liệu MỘT LẦN: xoá các lịch "Cá nhân" trùng lặp do lỗi tự tạo lịch
-- mặc định sinh ra (loadAll() cũ gọi createDefaultCalendar() trong nhánh catch,
-- nên mỗi lần GET /calendars lỗi lại đẻ thêm một lịch rỗng).
--
-- Đây KHÔNG phải migration schema — chạy sau khi đã deploy bản frontend có
-- createDefaultCalendarOnce(), nếu không lỗi cũ sẽ tạo lại y như cũ.
--
-- Điều kiện xoá được siết chặt để không đụng vào lịch thật:
--   * đúng tên 'Cá nhân' (lịch nhóm tên '... (Lịch nhóm)' nên không dính),
--   * KHÔNG có sự kiện nào,
--   * KHÔNG được chia sẻ cho ai ngoài chủ lịch,
--   * KHÔNG phải lịch của một nhóm,
--   * KHÔNG phải bản ghi cũ nhất của chính người đó (bản cũ nhất luôn giữ lại).

-- BƯỚC 1 — XEM TRƯỚC. Chạy riêng câu này để biết sẽ xoá những gì.
-- Nếu kết quả trống thì không có gì để dọn.
with doomed as (
  select c.id, c.owner_id, c.name, c.created_at
  from public.calendars c
  where c.name = 'Cá nhân'
    and not exists (select 1 from public.events e where e.calendar_id = c.id)
    and not exists (
      select 1 from public.calendar_members m
      where m.calendar_id = c.id and m.user_id <> c.owner_id
    )
    and not exists (select 1 from public.groups g where g.calendar_id = c.id)
    and c.id <> (
      select c2.id from public.calendars c2
      where c2.owner_id = c.owner_id and c2.name = c.name
      order by c2.created_at asc
      limit 1
    )
)
select owner_id, count(*) as se_xoa, min(created_at) as cu_nhat, max(created_at) as moi_nhat
from doomed
group by owner_id;

-- BƯỚC 2 — XOÁ THẬT. Chỉ chạy sau khi đã xem bước 1 và thấy con số hợp lý.
-- Bỏ dấu comment ở khối dưới rồi chạy.
--
-- delete from public.calendars c
-- where c.name = 'Cá nhân'
--   and not exists (select 1 from public.events e where e.calendar_id = c.id)
--   and not exists (
--     select 1 from public.calendar_members m
--     where m.calendar_id = c.id and m.user_id <> c.owner_id
--   )
--   and not exists (select 1 from public.groups g where g.calendar_id = c.id)
--   and c.id <> (
--     select c2.id from public.calendars c2
--     where c2.owner_id = c.owner_id and c2.name = c.name
--     order by c2.created_at asc
--     limit 1
--   );
