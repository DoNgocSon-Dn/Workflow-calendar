import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { RequestWithSupabase } from './request-with-user';

export const CurrentSupabase = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SupabaseClient => {
    const request = ctx.switchToHttp().getRequest<RequestWithSupabase>();
    return request.supabaseClient;
  },
);
