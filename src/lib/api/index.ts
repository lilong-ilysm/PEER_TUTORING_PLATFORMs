/**
 * Backend selection.
 *
 * The chosen implementation is loaded lazily so that demo mode never pulls the
 * Amplify SDK into the initial bundle, and so that a missing `amplify_outputs.json`
 * cannot break a demo build at module-evaluation time.
 */

import { DATA_MODE } from '../config';
import type { Backend } from './contract';

let backendPromise: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise =
      DATA_MODE === 'amplify'
        ? import('./amplify/amplifyBackend').then((module) => module.amplifyBackend)
        : import('./local/localBackend').then((module) => module.localBackend);
  }
  return backendPromise;
}

type AsyncBackend = {
  [K in keyof Backend]: Backend[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

/**
 * Call the active backend without awaiting its module first:
 * `await api.listTutorListings()`.
 */
export const api = new Proxy({} as AsyncBackend, {
  get(_target, property) {
    // Guard against the object being treated as a thenable by `await`.
    if (property === 'then') return undefined;

    return (...args: unknown[]) =>
      getBackend().then((backend) => {
        const method = backend[property as keyof Backend];
        if (typeof method !== 'function') {
          throw new Error(`Backend has no method "${String(property)}".`);
        }
        return (method as (...callArgs: unknown[]) => unknown).apply(backend, args);
      });
  },
});

export type { Backend } from './contract';
export * from './contract';
