import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { connectedUserIds } from '../db/deviceRepo.js';
import { pushDue, wahooConfigured } from '../devices/service.js';

/**
 * Envoi des séances vers les appareils reliés : toutes les heures, pour chaque
 * athlète relié à Wahoo, les séances de l'app qui tombent entre aujourd'hui et
 * J+6 sont poussées (les autres attendent leur fenêtre). Un athlète en échec
 * n'arrête pas les autres. Désactivé en démo et sans Wahoo configuré.
 */

const INTERVAL_MS = 60 * 60 * 1000;
const FIRST_RUN_MS = 60 * 1000;

export function startDevicePush(log: FastifyBaseLogger): () => void {
  if (config.demoMode || !wahooConfigured()) {
    log.info('devicePush: désactivé (démo ou Wahoo non configuré)');
    return () => undefined;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const users = await connectedUserIds('wahoo');
      let sent = 0;
      for (const userId of users) {
        try {
          sent += await pushDue(userId);
        } catch (err) {
          log.warn({ err, userId }, 'devicePush: athlète en échec');
        }
      }
      log.info({ athletes: users.length, workouts: sent }, 'devicePush: passage terminé');
    } catch (err) {
      log.error({ err }, 'devicePush: passage en échec');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  const first = setTimeout(tick, FIRST_RUN_MS);
  first.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
