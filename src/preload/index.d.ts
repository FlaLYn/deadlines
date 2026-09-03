import type { DeadlinesApi } from './index';

declare global {
  interface Window {
    deadlines: DeadlinesApi;
  }
}

export {};
