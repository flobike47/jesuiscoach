import { useEffect, useMemo, useState } from 'react';
import { api } from '@/services/api';
import { deviceSubscription, disableDevicePush, enableDevicePush } from '@/services/push';
import { pushSupport, type PushSupport } from '@/lib/push';

function currentPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}

/**
 * Notifications de l'appareil courant (nouvelles sorties, alertes) : support,
 * permission, abonné ou non. L'abonnement est par appareil.
 */
export function usePushNotifications() {
  const support: PushSupport = useMemo(() => pushSupport(navigator, window), []);
  const [permission, setPermission] = useState<NotificationPermission>(currentPermission);
  /** null tant qu'inconnu. */
  const [deviceSubscribed, setDeviceSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support !== 'supported') return;
    let cancelled = false;
    deviceSubscription().then(
      (sub) => !cancelled && setDeviceSubscribed(sub !== null),
      () => !cancelled && setDeviceSubscribed(false),
    );
    return () => {
      cancelled = true;
    };
  }, [support]);

  /** Abonne cet appareil. À appeler depuis un geste (exigence iOS). */
  const enable = async () => {
    setBusy(true);
    try {
      await enableDevicePush();
      setDeviceSubscribed(true);
    } finally {
      setPermission(currentPermission());
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disableDevicePush().catch(() => undefined);
      setDeviceSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  return { support, permission, deviceSubscribed, busy, enable, disable, sendTest: () => api.sendTestPush() };
}
