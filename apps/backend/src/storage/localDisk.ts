import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

  async read(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async list(prefix: string): Promise<{ key: string; modifiedAt: Date }[]> {
    const dir = prefix.replace(/^\/+|\/+$/g, '');
    let entries;
    try {
      entries = await readdir(this.pathFor(dir), { withFileTypes: true, recursive: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const files = entries.filter((e) => e.isFile());
    return Promise.all(
      files.map(async (e) => {
        const abs = join(e.parentPath, e.name);
        const key = abs.slice(this.root.length + 1).split(/[\\/]/).join('/');
        return { key, modifiedAt: (await stat(abs)).mtime };
      }),
    );
  }

  url(key: string): string {
    return `${this.publicUrl}/${key.replace(/^\/+/, '')}`;
  }
}
