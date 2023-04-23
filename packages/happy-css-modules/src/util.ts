import { constants, readFileSync } from 'fs';
import { access } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { resolve as importMetaResolve } from 'import-meta-resolve';
import minimatch from 'minimatch';

/**
 * The SystemError type of Node.js.
 * @see https://nodejs.org/api/errors.html#class-systemerror
 */
export interface SystemError {
  code: string;
}

export function isSystemError(value: unknown): value is SystemError {
  return (
    isObject(value) &&
    hasProp(value, 'constructor') &&
    isObject(value.constructor) &&
    hasProp(value.constructor, 'name') &&
    value.constructor.name === 'Error' &&
    hasProp(value, 'code') &&
    typeof value.code === 'string'
  );
}

export function isObject(value: unknown): value is object {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}

export function hasProp<T extends string>(obj: object, prop: T): obj is { [key in T]: unknown } {
  return prop in obj;
}

export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function uniqueBy<T, U>(arr: T[], fn: (el: T) => U): T[] {
  const result: T[] = [];
  const keys = new Set<U>();
  for (const el of arr) {
    const key = fn(el);
    if (!keys.has(key)) {
      keys.add(key);
      result.push(el);
    }
  }
  return result;
}

export function sleepSync(ms: number) {
  const start = Date.now();
  // eslint-disable-next-line no-empty
  while (Date.now() - start < ms) {}
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_e) {
    return false;
  }
}

export function isMatchByGlob(filePath: string, pattern: string, options: { cwd: string }): boolean {
  return minimatch(filePath, join(options.cwd, pattern));
}

export function getPackageJson() {
  return JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'));
}

export async function getInstalledPeerDependencies(): Promise<string[]> {
  const pkgJson = getPackageJson();
  const result = [];
  for (const deps of Object.keys(pkgJson.peerDependencies)) {
    const isInstalled = await importMetaResolve(deps, import.meta.url)
      .then(() => true)
      .catch(() => false);
    if (isInstalled) result.push(deps);
  }
  return result;
}
