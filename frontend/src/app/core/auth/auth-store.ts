import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase-client';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly supabase = inject(SUPABASE_CLIENT);

  readonly session = signal<Session | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.access_token ?? null);

  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this.session.set(data.session);

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
    });
  }

  async signInWithPassword(email: string, password: string): Promise<AuthError | null> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  async signUpWithPassword(email: string, password: string): Promise<AuthError | null> {
    const { error } = await this.supabase.auth.signUp({ email, password });
    return error;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }
}
