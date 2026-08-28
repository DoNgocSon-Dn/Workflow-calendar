# Migrations

Các file `.sql` ở đây được chạy **thủ công trong Supabase SQL Editor**, không qua
`supabase db push`. Không có bảng theo dõi migration — thứ tự do tiền tố số quyết
định.

## Thứ tự chạy khi dựng DB mới

1. Chạy `../schema.sql` trước (tạo bảng gốc + RLS + RPC ban đầu).
2. Sau đó chạy toàn bộ file trong thư mục này **theo thứ tự tên file** (sắp xếp
   chuỗi): `0000`, `0002` … `0006`, `02` … `15a`, `15b`, `16` … `20a`, `20b`,
   `21` … `33`.

Mọi file đều dùng `create or replace` / `drop … if exists` / `if not exists` nên
chạy lại nhiều lần vẫn an toàn.

## Lưu ý về đánh số

- Không có `0001` và `01` — đánh số nhảy từ đầu dự án, không phải thiếu file.
- Tiền tố đổi từ 4 chữ số (`0000`–`0006`) sang 2 chữ số (`02`+) giữa chừng.
- `15a/15b` và `20a/20b` là hai cặp file từng **trùng số** (`15_`, `20_`); đã tách
  hậu tố `a`/`b` để sắp đúng thứ tự. `a` = file tạo trước, `b` = file tạo sau.

## Trạng thái

Tất cả migration tới `33_` đã được áp dụng lên project Supabase đang chạy
(`wdiuuhsfflragxuurwpk`). Đổi tên file ở trên **không ảnh hưởng** DB hiện tại —
chỉ để lần dựng DB mới chạy đúng thứ tự.
