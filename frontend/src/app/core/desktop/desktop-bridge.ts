export interface DesktopAlert {
  id: string;
  title: string;
  body: string;
  kind: string;
  eventId?: string;
  groupId?: string;
  messageId?: string;
  peerId?: string;
  sound?: boolean;
}

export interface DesktopBridge {
  openSettings(): Promise<void>;
  notify(alert: DesktopAlert): Promise<boolean>;
  clearNotifications(): Promise<void>;
  acknowledgeNotificationClick(id: string): Promise<boolean>;
  onNotificationClick(callback: (alert: DesktopAlert) => void): () => void;
  onNotificationCancelled(callback: (id: string) => void): () => void;
}

declare global {
  interface Window {
    workflowDesktop?: DesktopBridge;
  }
}

export function desktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.workflowDesktop;
}
