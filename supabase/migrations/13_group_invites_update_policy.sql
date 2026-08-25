-- inviteMember() upsert vào group_invites với onConflict (group_id, invited_user_id)
-- (vd. mời lại người đã từ chối trước đó) — khi trúng conflict, Postgres thực hiện
-- UPDATE trên hàng cũ, nhưng bảng group_invites chưa từng có policy UPDATE nên bị
-- RLS chặn: "new row violates row-level security policy (USING expression)".
--
-- Chạy 1 lần trong Supabase SQL Editor, sau 07_group_invites_and_deadlines.sql.

drop policy if exists group_invites_update on public.group_invites;
create policy group_invites_update on public.group_invites
  for update using (
    public.is_group_member(group_id, auth.uid())
  ) with check (
    invited_by = auth.uid()
    and public.is_group_member(group_id, auth.uid())
  );
