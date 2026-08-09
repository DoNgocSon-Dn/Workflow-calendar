import { Request } from 'express';
import { SupabaseClient, User } from '@supabase/supabase-js';

export interface RequestWithSupabase extends Request {
  user: User;
  supabaseClient: SupabaseClient;
}
