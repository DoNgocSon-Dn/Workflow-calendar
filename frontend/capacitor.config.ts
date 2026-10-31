import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dongocson.workflowcalendar',
  appName: 'Workflow Calendar',
  webDir: 'dist/frontend/browser',
  server: { hostname: 'localhost', androidScheme: 'https', cleartext: false },
  android: { backgroundColor: '#f7f8fa', allowMixedContent: false },
  plugins: {
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'contain' },
    LocalNotifications: { smallIcon: 'ic_stat_workflow', iconColor: '#2563EB', sound: 'workflow_reminder.mp3' },
  },
};
export default config;
