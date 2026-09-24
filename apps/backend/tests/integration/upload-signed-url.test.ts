import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { storage } from '../../src/storage/index.js';
import { signUploadUrl, signUrlsDeep, unsignUrlsDeep } from '../../src/storage/signedUrl.js';

const KEY = 'signed-url-test/probe.txt';
const base = env.STORAGE_PUBLIC_URL.replace(/\/$/, '');
const pathOf = (url: string) => url.slice(new URL(base).origin.length);

describe('/uploads signed URLs', () => {
  let app: Express;
  let canonical: string;

  beforeAll(async () => {
    app = createApp();
    canonical = (await storage.save(KEY, Buffer.from('private'))).url;
  });

  afterAll(async () => {
    await storage.delete(KEY);
  });

  it('refuses an unsigned or tampered URL', async () => {
    expect((await request(app).get(pathOf(canonical))).status).toBe(403);
    const signed = signUploadUrl(canonical);
    const tampered = signed.replace('probe.txt', 'other.txt');
    expect((await request(app).get(pathOf(tampered))).status).toBe(403);
    const badSig = signed.replace(/sig=.{4}/, 'sig=AAAA');
    expect((await request(app).get(pathOf(badSig))).status).toBe(403);
  });

  it('serves a signed URL with a private cache header', async () => {
    const res = await request(app).get(pathOf(signUploadUrl(canonical)));
    expect(res.status).toBe(200);
    expect(res.text).toBe('private');
    expect(res.headers['cache-control']).toMatch(/^private, max-age=\d+$/);
  });

  it('refuses an expired signature', async () => {
    const old = signUploadUrl(canonical, Date.now() - 3 * env.UPLOAD_URL_TTL_SECONDS * 1000);
    expect((await request(app).get(pathOf(old))).status).toBe(403);
  });

  it('signs nested response URLs, keeps other values, and strips signatures on the way back in', () => {
    const when = new Date();
    const payload = { a: [{ url: canonical, n: 1 }], other: 'https://example.com/x.png', when };
    const signed = signUrlsDeep(payload);
    expect(signed.a[0]!.url).toMatch(/\?exp=\d+&sig=[\w-]{32}$/);
    expect(signed.other).toBe(payload.other);
    expect(signed.when).toBe(when);
    expect(unsignUrlsDeep(signed).a[0]!.url).toBe(canonical);
  });

  it('URL is stable within a TTL bucket so image caches keep hitting', () => {
    const now = Date.now();
    expect(signUploadUrl(canonical, now)).toBe(signUploadUrl(canonical, now + 1000));
  });
});
