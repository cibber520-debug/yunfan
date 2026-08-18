import { STEP_COUNT } from '../config';

export const routes = {
  home: '/',
  wizard: (step: number): string => `/wizard/${step}`,
  results: '/results',
  volunteers: '/volunteers',
  profile: '/profile',
} as const;

export { STEP_COUNT };
