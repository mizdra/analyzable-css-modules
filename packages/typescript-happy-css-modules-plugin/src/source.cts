import { parse } from 'node:path';
import type { Config } from './config.cjs';

export function getCssFileName(fileName: string, config: Config): string {
  const { dir, name } = parse(fileName);
  return `${dir}/${name}${config.styleFileExtension}`;
}
