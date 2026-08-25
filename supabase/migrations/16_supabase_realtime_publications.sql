-- Enable Supabase Realtime (postgres_changes) for group messages, invites, and tasks
-- This enables direct cloud database realtime push to all browsers on any machine.

begin;

alter publication supabase_realtime add table public.group_messages;
alter publication supabase_realtime add table public.group_invites;
alter publication supabase_realtime add table public.calendar_invites;
alter publication supabase_realtime add table public.group_tasks;

commit;
