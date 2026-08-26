// Registers the device for Apple push notifications and forwards the token to
// our backend. Only runs inside the native app; a no-op on the website.
import { Capacitor } from '@capacitor/core';
import api from '../api/client';

let started = false;

export async function initPush(onOpen) {
  if (started) return () => {};
  if (!Capacitor.isNativePlatform?.()) return () => {};
  started = true;

  let PushNotifications;
  try {
    ({ PushNotifications } = await import('@capacitor/push-notifications'));
  } catch { started = false; return () => {}; }

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') { started = false; return () => {}; }

    await PushNotifications.register();

    const subs = [];
    subs.push(await PushNotifications.addListener('registration', (t) => {
      api.post('/notifications/register-device', { token: t.value, platform: 'ios' }).catch(() => {});
    }));
    subs.push(await PushNotifications.addListener('registrationError', (e) => {
      console.warn('[push] registration error', e);
    }));
    // Tapped a notification → deep-link to the relevant page.
    subs.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const link = action?.notification?.data?.link;
      if (link && onOpen) onOpen(link);
    }));

    return () => { subs.forEach(s => s.remove?.()); started = false; };
  } catch (e) {
    console.warn('[push] init failed', e);
    started = false;
    return () => {};
  }
}
