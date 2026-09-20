import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { StorageAdapter } from './index.js';

/** Local disk adapter (dev). ໄຟລ໌ serve ຜ່ານ express.static ທີ່ /uploads. */
export class LocalDiskStorage implements StorageAdapter {
  private readonly root: string;
  private readonly publicUrl: string;

  constructor(rootDir: string, publicUrl: string) {
    this.root = resolve(process.cwd(), rootDir);
    this.publicUrl = publicUrl.replace(/\/$/, '');
  }

  private pathFor(key: string): string {
    return join(this.root, key.replace(/^\/+/, ''));
  }

  async save(key: string, data: Buffer): Promise<{ url: string; key: string }> {
    const filePath = this.pathFor(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { url: this.url(key), key };
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  url(key: string): string {
    return `${this.publicUrl}/${key.replace(/^\/+/, '')}`;
  }
}
