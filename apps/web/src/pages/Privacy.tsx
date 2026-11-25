import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Politique de confidentialité (page publique, sans connexion), exigée par
 * Intervals.icu pour valider l'app OAuth. Le contenu décrit ce que l'app fait
 * réellement : à mettre à jour (avec la date) dès qu'un traitement change.
 */

const UPDATED_FR = '25 novembre 2026';
const UPDATED_EN = 'November 25, 2026';
const CONTACT = 'flobordignon@hotmail.fr';
const OWNER = 'Florian Bordignon';
const SITE = 'https://jesuiscoach.fb-cloud.fr';

export default function Privacy() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 'calc(env(safe-area-inset-top, 0px) + 32px) 20px calc(env(safe-area-inset-bottom, 0px) + 48px)', lineHeight: 1.55 }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }} className="footnote">
        <Link to="/">← Je suis coach</Link>
        <a href="#english" lang="en">English version ↓</a>
      </nav>

      <article lang="fr">
        <h1 className="large-title">Politique de confidentialité</h1>
        <p className="footnote secondary">Dernière mise à jour : {UPDATED_FR}</p>

        <P>
          <strong>Je suis coach</strong> ({SITE}) est une application de coaching vélo pour un petit groupe d'amis. Elle affiche
          les sorties, la forme et le calendrier d'entraînement des athlètes à partir de leur compte{' '}
          <a href="https://intervals.icu">Intervals.icu</a>, et permet à leur coach de leur envoyer des séances.
        </P>

        <H2>Responsable du traitement</H2>
        <P>
          {OWNER}, particulier, joignable à <Mail />. L'application est développée et exploitée à titre personnel, sans
          but commercial.
        </P>

        <H2>Données traitées</H2>
        <List
          items={[
            <>
              <strong>Identité Intervals.icu</strong> : identifiant d'athlète et nom, reçus à la connexion.
            </>,
            <>
              <strong>Jeton d'accès Intervals.icu</strong> : chiffré (AES-256-GCM) avant d'être stocké, jamais affiché ni
              journalisé. Il sert uniquement à lire tes sorties, ta forme et ton calendrier, et à ajouter ou modifier les
              séances prévues par ton coach.
            </>,
            <>
              <strong>Données d'entraînement lues sur Intervals.icu</strong> : sorties (date, durée, distance, puissance,
              fréquence cardiaque, charge), indicateurs de forme et séances du calendrier. Elles restent dans Intervals.icu ;
              l'application n'en garde qu'une copie temporaire en cache (de quelques minutes à 30 jours au plus) et
              l'identifiant des sorties déjà notifiées (30 jours).
            </>,
            <>
              <strong>Ressenti saisi dans l'app</strong> : humeur, effort perçu et note libre, conservés jusqu'à la
              suppression du compte.
            </>,
            <>
              <strong>Notifications</strong> : adresse d'abonnement fournie par ton navigateur (Apple, Google, Mozilla ou
              Microsoft) et type d'appareil, jusqu'à ce que tu les désactives.
            </>,
            <>
              <strong>Sessions</strong> : empreinte du jeton de session (jamais le jeton lui-même) et type d'appareil, 90
              jours au plus.
            </>,
            <>
              <strong>Journaux techniques</strong> : adresse IP et requêtes reçues, pour la sécurité et le diagnostic ;
              limités en taille et effacés automatiquement par rotation.
            </>,
          ]}
        />
        <P>
          Aucun mot de passe n'est demandé ni stocké : la connexion passe par Intervals.icu. Aucun cookie n'est utilisé ;
          l'app garde seulement ton jeton de session et tes préférences (thème) dans le stockage local de ton navigateur.
        </P>

        <H2>Finalités et base légale</H2>
        <P>
          Les données servent uniquement à faire fonctionner le coaching : afficher ta forme et tes sorties, prévenir ton
          coach d'une nouvelle sortie ou d'une alerte (fatigue, inactivité), et synchroniser les séances avec ta montre via
          Intervals.icu. La base légale est ton consentement, donné en connectant ton compte Intervals.icu ; les journaux
          techniques relèvent de l'intérêt légitime (sécurité du service).
        </P>

        <H2>Qui voit tes données</H2>
        <List
          items={[
            <>Toi, et le coach qui t'a invité dans son équipe. Les autres athlètes ne voient pas tes données.</>,
            <>
              Aucune vente, aucune publicité, aucun outil de mesure d'audience, aucun traitement par intelligence
              artificielle.
            </>,
            <>
              Prestataires techniques : <strong>Intervals.icu</strong> (source des données), <strong>Cloudflare</strong>{' '}
              (acheminement chiffré du trafic vers le serveur) et le service de notifications de ton appareil (contenu des
              notifications : nom de l'athlète et résumé de la sortie ou de l'alerte).
            </>,
          ]}
        />

        <H2>Hébergement et sécurité</H2>
        <P>
          L'application et sa base de données sont hébergées sur un serveur personnel de l'éditeur, accessible uniquement
          en HTTPS. Les jetons Intervals.icu sont chiffrés, les sessions ne sont stockées que sous forme d'empreinte, et la
          base est sauvegardée chaque jour (sauvegardes conservées 14 jours).
        </P>

        <H2>Tes droits</H2>
        <P>
          Tu peux demander l'accès à tes données, leur rectification, leur suppression ou leur export, et t'opposer à leur
          traitement, en écrivant à <Mail />. Réponse sous 30 jours. Tu peux aussi supprimer ton compte toi-même (Réglages →
          Supprimer mon compte) : cela efface ton compte, ton jeton, tes ressentis et tes abonnements aux notifications, et
          coupe l'accès de l'app à Intervals.icu.
        </P>
        <P>
          Tu peux aussi couper l'accès à tout moment depuis Intervals.icu (Settings → Apps) : l'application ne peut alors
          plus lire ni modifier tes données. En cas de désaccord, tu peux saisir la CNIL (
          <a href="https://www.cnil.fr">cnil.fr</a>).
        </P>

        <H2>Modifications</H2>
        <P>Toute modification de cette politique est publiée sur cette page, avec sa date de mise à jour.</P>
      </article>

      <hr style={{ border: 0, borderTop: '0.5px solid var(--separator)', margin: '48px 0' }} />

      <article lang="en" id="english">
        <h1 className="title-2">Privacy policy</h1>
        <p className="footnote secondary">Last updated: {UPDATED_EN}</p>

        <P>
          <strong>Je suis coach</strong> ({SITE}) is a cycling coaching app for a small group of friends. It shows
          athletes' rides, fitness and training calendar from their <a href="https://intervals.icu">Intervals.icu</a>{' '}
          account, and lets their coach send them workouts.
        </P>

        <H2>Data controller</H2>
        <P>
          {OWNER}, private individual, reachable at <Mail />. The app is built and run privately, on a non-commercial
          basis.
        </P>

        <H2>Data processed</H2>
        <List
          items={[
            <>
              <strong>Intervals.icu identity</strong>: athlete ID and name, received at sign-in.
            </>,
            <>
              <strong>Intervals.icu access token</strong>: encrypted (AES-256-GCM) before storage, never displayed or
              logged. Used only to read your activities, fitness and calendar, and to add or update workouts planned by your
              coach.
            </>,
            <>
              <strong>Training data read from Intervals.icu</strong>: activities (date, duration, distance, power, heart
              rate, load), fitness metrics and calendar workouts. They stay in Intervals.icu; the app only keeps a temporary
              cached copy (from a few minutes up to 30 days) and the IDs of activities already notified (30 days).
            </>,
            <>
              <strong>Check-ins entered in the app</strong>: mood, perceived effort and free-text note, kept until account
              deletion.
            </>,
            <>
              <strong>Notifications</strong>: subscription endpoint provided by your browser (Apple, Google, Mozilla or
              Microsoft) and device type, until you turn them off.
            </>,
            <>
              <strong>Sessions</strong>: a hash of the session token (never the token itself) and device type, 90 days
              maximum.
            </>,
            <>
              <strong>Technical logs</strong>: IP address and requests, for security and troubleshooting; size-limited and
              automatically deleted by rotation.
            </>,
          ]}
        />
        <P>
          No password is requested or stored: sign-in goes through Intervals.icu. No cookies are used; the app only keeps
          your session token and preferences (theme) in your browser's local storage.
        </P>

        <H2>Purposes and legal basis</H2>
        <P>
          Data is used only to run the coaching features: showing your fitness and rides, notifying your coach of a new
          ride or alert (fatigue, inactivity), and syncing workouts to your watch through Intervals.icu. The legal basis is
          your consent, given by connecting your Intervals.icu account; technical logs rely on legitimate interest
          (service security).
        </P>

        <H2>Who can see your data</H2>
        <List
          items={[
            <>You, and the coach who invited you to their team. Other athletes cannot see your data.</>,
            <>No selling, no advertising, no analytics, no artificial intelligence processing.</>,
            <>
              Technical providers: <strong>Intervals.icu</strong> (data source), <strong>Cloudflare</strong> (encrypted
              routing of traffic to the server) and your device's push notification service (notification content:
              athlete name and a summary of the ride or alert).
            </>,
          ]}
        />

        <H2>Hosting and security</H2>
        <P>
          The app and its database run on the publisher's personal server, reachable over HTTPS only. Intervals.icu tokens
          are encrypted, sessions are stored as hashes only, and the database is backed up daily (backups kept 14 days).
        </P>

        <H2>Your rights</H2>
        <P>
          You can request access to, correction, deletion or export of your data, and object to its processing, by writing
          to <Mail />. Answer within 30 days. You can also delete your account yourself (Settings → Delete my account):
          this removes your account, token, check-ins and notification subscriptions, and revokes the app's access to
          Intervals.icu.
        </P>
        <P>
          You can also revoke access at any time from Intervals.icu (Settings → Apps): the app can then no longer read or
          change your data. You may lodge a complaint with the French data protection authority, the CNIL (
          <a href="https://www.cnil.fr">cnil.fr</a>).
        </P>

        <H2>Changes</H2>
        <P>Any change to this policy is published on this page with its update date.</P>
      </article>
    </main>
  );
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="headline" style={{ fontSize: 19, margin: '28px 0 8px', letterSpacing: '-0.01em' }}>
      {children}
    </h2>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 12px', fontSize: 16 }}>{children}</p>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 16 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Mail() {
  return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
}
