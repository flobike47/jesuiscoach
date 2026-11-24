---
name: react-frontend
description: Développer ou relire le frontend jesuiscoach (apps/web — React 19, Vite, composants iOS maison, TanStack Query v5, Zustand, React Router 7). À utiliser pour toute page, composant, hook de données, mutation, gestion d'auth côté client ou appel au BFF.
---

# Frontend — standard de qualité

## Architecture
- `services/api.ts` est **le seul** endroit qui parle au BFF. Aucun `axios`/`fetch` dans les composants.
- `hooks/use*.ts` encapsulent TanStack Query ; les pages consomment les hooks, jamais `api.*` directement.
- `lib/` = logique pure (scoring, indicateurs, audio, devises) : **aucun import React**, testable unitairement.
- État serveur → TanStack Query. État UI local → `useState`. Préférences locales persistées → Zustand (`store/`). Ne pas dupliquer une donnée serveur dans Zustand.

## TanStack Query v5
- **Query keys centralisées** dans une factory (aujourd'hui dans `hooks/useCoach.ts`) — une faute de frappe dans une clé casse le partage de cache silencieusement.
- Clé = toutes les variables de la `queryFn`. Si l'utilisateur change, les données privées doivent changer : inclure `user.id` dans les clés privées **ou** faire `queryClient.clear()` au logout / changement de session.
- `staleTime` aligné sur le TTL Redis du BFF (inutile de refetch plus souvent que le cache serveur).
- Mutations : optimistic update = `cancelQueries` → snapshot → `setQueryData` → rollback dans `onError` → `invalidateQueries` dans `onSettled` (à appliquer au déplacement de séance dans le calendrier).
- `retry` : ne pas retenter les 4xx (401, 400, 429) — `retry: (count, err) => status >= 500 && count < 2`.
- Erreurs : `(err as ApiError).message` contient déjà le message du BFF.

## Auth & client HTTP
- Le jeton de session (opaque, émis par le BFF, gardé dans `store/localSettings`) est injecté via `configureApi` pendant le rendu d'`AuthProvider`. Un 401 hors `/api/public/*` déconnecte localement (callback `onUnauthorized`).
- Sur 401 du BFF : tenter un refresh de session une fois, sinon `signOut` + redirection `/login`. Pas de boucle.
- `timeout` explicite (`DEFAULT_TIMEOUT_MS` 20 s, `GENERATION_TIMEOUT_MS` 120 s dans `services/api.ts`) — `timeout: 0` interdit.
- Toute erreur d'appel est une `ApiError { message, status, reqId }` (intercepteur dans `services/api.ts`) : afficher `message`, et le `reqId` quand c'est utile au support.
- Connexion : `/connexion` → BFF → Intervals.icu → `/connexion/retour#code=…` → `api.exchangeLoginCode` → session. Jamais de jeton de session dans une URL.

## React 19
- `useEffect` : toujours un cleanup (abonnements, `speechSynthesis.cancel()`, `URL.revokeObjectURL`, `AbortController`). StrictMode monte deux fois en dev : un effet non idempotent = bug visible.
- Pas de `useEffect` pour dériver un état d'un autre état ou de props → calcul direct ou `useMemo`. Pas d'effet pour réagir à un événement utilisateur → handler.
- Dépendances d'effet exactes (ESLint `react-hooks/exhaustive-deps` doit passer sans `disable`). Attention aux effets qui dépendent d'un état qu'ils modifient.
- `useRef` initialisé par un calcul coûteux (`useRef(parseWorkout(text))`) recalcule à chaque render → `useMemo` ou init paresseuse.
- Listes : `key` stable issue de la donnée (id d'athlète, id de sortie), jamais l'index si la liste est réordonnable.
- Ajouter un **Error Boundary** par route (React Router `errorElement`) : une exception dans un graphique ne doit pas blanchir toute l'app.

## Interface iOS (composants maison)
- **Charger le skill `apple-design`** avant toute UI : retour visuel au pointer-down, ressorts sans rebond par défaut, tout interruptible, `prefers-reduced-motion` / `prefers-reduced-transparency` / `prefers-contrast` respectés. `mobile-native` pour les correctifs WebKit.
- Composants dans `components/ios` (`Page` à grand titre, `Section` / `Cell` en liste groupée, `Segmented`, `Rings`, `Avatar`, `Sheet`) ; couleurs système en variables CSS dans `styles.css` (`--label`, `--cell`, `--blue`…), jamais de couleur en dur. Ne pas réintroduire Ant Design.
- Couleurs des indicateurs fixes partout : `METRIC_COLORS` de `theme.ts` (fitness bleu, fatigue rose, forme jaune).
- Vocabulaire : « Charge », « Puissance pondérée », « Intensité » — jamais TSS / NP / IF (marques TrainingPeaks).
- Accessibilité : boutons-icônes avec `aria-label`, cibles ≥ 44 px, contrastes OK en clair **et** sombre.

## Performance
- Code-splitting par page (`lazy` dans `router.tsx`) — recharts est gros, il ne doit charger qu'avec la fiche athlète.
- Pas de `JSON.stringify` / tri dans le render sur de gros tableaux sans `useMemo`.

## Structure de l'interface
- Navigation : 5 onglets (`components/layout/AppLayout.tsx`), barre translucide en bas, le contenu défile dessous.
- Fiche athlète = route `/athletes/:id` (depuis Équipe et Activité). Éditeur de séance = `Sheet` (feuille qu'on ferme en la tirant vers le bas).
- Chaque page commence par `Page` et respecte les zones sûres iOS (`env(safe-area-inset-*)`).

## PWA (installable sur iPhone)
- `public/manifest.webmanifest`, `public/sw.js`, balises Apple dans `index.html`. Tous les chemins sont **relatifs** (l'app peut vivre sous `BASE_PATH`).
- Service worker : seules les requêtes GET de même origine sont interceptées ; jamais le BFF ni les autres origines. Changer la stratégie de la coquille ⇒ incrémenter `VERSION` dans `sw.js`.
- Icônes : `node scripts/generate-icons.mjs` (aucune dépendance). iOS exige une `apple-touch-icon` opaque et carrée.
- À vérifier sur un vrai iPhone après toute modification : installation, plein écran, barre d'état, zones sûres, notifications reçues app fermée.

## Configuration runtime
Les valeurs viennent de `window.__APP_CONFIG__` (substituées au boot du conteneur) avec fallback `import.meta.env.VITE_*` en dev. Toute nouvelle variable : `runtimeConfig.ts` + `public/config.js` + `docker-entrypoint.sh` + `.env.example` + `docker-compose.prod.yml`. Rien de secret côté web.

## Vérification
`npm run typecheck`, lint, tests, puis lancer l'app (`npm run dev`) et vérifier le parcours touché dans le navigateur, thème clair et sombre, état de chargement, état d'erreur (couper le BFF) et état vide.
