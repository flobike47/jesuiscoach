import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Valeurs factices : aucun test ne doit joindre un vrai service
    // (Postgres = PGlite en mémoire, Redis = ioredis-mock, Intervals mocké).
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Prioritaire sur un apps/bff/.env local (dotenv n'écrase pas) : les tests
      // qui veulent la démo l'activent eux-mêmes.
      DEMO_MODE: 'false',
      COACH_ATHLETE_IDS: '',
      INTERVALS_CLIENT_ID: 'test-client',
      INTERVALS_CLIENT_SECRET: 'test-secret',
      TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      PUBLIC_API_URL: 'http://api.test',
    },
    restoreMocks: true,
  },
});
