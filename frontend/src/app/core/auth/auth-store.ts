import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase-client';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly supabase = inject(SUPABASE_CLIENT);

  readonly session = signal<Session | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.access_token ?? null);
  readonly displayName = computed(() => {
    const metadata = this.user()?.user_metadata as Record<string, unknown> | undefined;
    const fullName = metadata?.['full_name'];
    return typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null;
  });
  readonly avatarUrl = computed(() => {
    const metadata = this.user()?.user_metadata as Record<string, unknown> | undefined;
    const avatarUrl = metadata?.['avatar_url'];
    return typeof avatarUrl === 'string' && avatarUrl ? avatarUrl : null;
  });

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

  async signInWithGoogle(): Promise<AuthError | null> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/calendar` },
    });
    return error;
  }

  async signUpWithPassword(email: string, password: string): Promise<AuthError | null> {
    const { error } = await this.supabase.auth.signUp({ email, password });
    return error;
  }

  async sendPasswordResetEmail(email: string): Promise<AuthError | null> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return error;
  }

  async updatePassword(newPassword: string): Promise<AuthError | null> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    return error;
  }

  async updateDisplayName(fullName: string): Promise<AuthError | null> {
    const { error } = await this.supabase.auth.updateUser({ data: { full_name: fullName } });
    return error;
  }

  async uploadAvatar(file: File): Promise<string | AuthError> {
    const userId = this.user()?.id;
    if (!userId) {
      return { name: 'AuthError', message: 'Chưa đăng nhập' } as AuthError;
    }

    const extension = file.name.split('.').pop() ?? 'png';
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      return { name: 'StorageError', message: uploadError.message } as AuthError;
    }

    const { data } = this.supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await this.supabase.auth.updateUser({
      data: { avatar_url: data.publicUrl },
    });
    if (updateError) return updateError;

    return data.publicUrl;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }
}
