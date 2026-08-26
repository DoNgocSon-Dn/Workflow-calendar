-- events_select_invited (on events) and event_attendees_select_member/write_editor
-- (on event_attendees) each subquery the other table directly, so Postgres hits
-- "infinite recursion detected in policy" as soon as either is evaluated under
-- RLS. Fix: route the attendee check through a SECURITY DEFINER function owned
-- by the table owner, which bypasses RLS internally and breaks the cycle.
create or replace function public.is_event_attendee(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_attendees
    where event_id = p_event_id and user_id = p_user_id
  );
$$;

drop policy if exists events_select_invited on public.events;
create policy events_select_invited on public.events
  for select using (
    public.is_event_attendee(events.id, auth.uid())
  );
