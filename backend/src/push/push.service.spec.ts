import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../supabase/supabase.service';
import { PushService } from './push.service';

function makeService(pushConfig: Record<string, string>, serviceRoleClient?: unknown): Promise<PushService> {
  return Test.createTestingModule({
    providers: [
      PushService,
      {
        provide: ConfigService,
        useValue: { get: jest.fn().mockReturnValue(pushConfig) },
      },
      {
        provide: SupabaseService,
        useValue: { getServiceRoleClient: jest.fn().mockReturnValue(serviceRoleClient) },
      },
    ],
  })
    .compile()
    .then((m: TestingModule) => m.get(PushService));
}

describe('PushService', () => {
  it('tắt khi thiếu VAPID key', async () => {
    const service = await makeService({ vapidPublicKey: '', vapidPrivateKey: '', vapidSubject: 'mailto:x@y.z' });
    expect(service.isEnabled()).toBe(false);
  });

  it('sendToUser không làm gì (không đụng Supabase) khi push tắt', async () => {
    const getServiceRoleClient = jest.fn();
    const service = await makeService(
      { vapidPublicKey: '', vapidPrivateKey: '', vapidSubject: 'mailto:x@y.z' },
      { from: getServiceRoleClient },
    );
    await service.sendToUser('user-1', { title: 'x', body: 'y' });
    expect(getServiceRoleClient).not.toHaveBeenCalled();
  });

  it('bật khi có đủ public + private key', async () => {
    const service = await makeService({
      vapidPublicKey: 'BDpf9IsDbrbp1GFqjod7FNtpsUNRYtU3KbMeGDv1XMWgAbCJCugrk5Gw8uo_zvgXUPqtzRH4vezCCVdY_yv52Xo',
      vapidPrivateKey: 'QtE6WCvQRivsW4_12S8AN3tSdc7uONgg55-7XyYn4uM',
      vapidSubject: 'mailto:x@y.z',
    });
    expect(service.isEnabled()).toBe(true);
  });
});
