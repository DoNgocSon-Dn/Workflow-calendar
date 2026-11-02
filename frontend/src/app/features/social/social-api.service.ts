import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DirectMessage, MessagePage, SocialOverview } from './social.models';

@Injectable({ providedIn: 'root' })
export class SocialApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/social`;
  overview() {
    return firstValueFrom(this.http.get<SocialOverview>(this.url));
  }
  request(email: string) {
    return firstValueFrom(this.http.post(`${this.url}/requests`, { email }));
  }
  code() { return firstValueFrom(this.http.get<{ code: string }>(`${this.url}/code`)); }
  requestCode(code: string) { return firstValueFrom(this.http.post(`${this.url}/requests/code`, { code })); }
  action(id: string, action: 'accept' | 'decline' | 'cancel' | 'remove') {
    return firstValueFrom(this.http.patch(`${this.url}/requests/${id}`, { action }));
  }
  block(peer: string, blocked: boolean) {
    return firstValueFrom(this.http.put(`${this.url}/blocks/${peer}`, { blocked }));
  }
  messages(peer: string, before?: string) {
    return firstValueFrom(
      this.http.get<MessagePage>(`${this.url}/messages/${peer}`, {
        params: before ? new HttpParams().set('before', before) : undefined,
      }),
    );
  }
  send(peer: string, clientId: string, body: string) {
    return firstValueFrom(
      this.http.post<DirectMessage>(`${this.url}/messages/${peer}`, { clientId, body }),
    );
  }
  read(messageIds: string[]) {
    return firstValueFrom(
      this.http.post<{ messageIds: string[] }>(`${this.url}/messages/read`, { messageIds }),
    );
  }
}
