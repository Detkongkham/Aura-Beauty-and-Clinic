import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPalette,
  paletteVars,
  THEME_TONES,
  type ColorScheme,
} from '../src/theme/palette';

const SCHEMES: ColorScheme[] = ['light', 'dark'];

describe('theme palette', () => {
  it('ທຸກ token ຂອງທຸກໂທນ/ໂໝດ ເປັນ hex ທີ່ຖືກຕ້ອງ', () => {
    for (const tone of THEME_TONES) {
      for (const scheme of SCHEMES) {
        const palette = buildPalette(tone, scheme);
        for (const [key, value] of Object.entries(palette)) {
          if (key === 'tone' || key === 'scheme') continue;
          expect(value, `${tone}/${scheme}.${key}`).toMatch(/^#[0-9A-F]{6}$/i);
        }
        expect(palette.tone).toBe(tone);
        expect(palette.scheme).toBe(scheme);
      }
    }
  });

  it('ທຸກໂທນມີຊຸດ var ດຽວກັນ — ບໍ່ມີ token ຕົກຫຼົ່ນຕອນສະຫຼັບ', () => {
    const base = Object.keys(paletteVars(buildPalette('azure', 'light'))).sort();
    for (const tone of THEME_TONES) {
      for (const scheme of SCHEMES) {
        expect(Object.keys(paletteVars(buildPalette(tone, scheme))).sort()).toEqual(base);
      }
    }
  });

  it('ຊື່ var ກົງກັບທີ່ tailwind.config.js ອ້າງເຖິງ', () => {
    const config = readFileSync(join(__dirname, '..', 'tailwind.config.js'), 'utf8');
    const used = new Set(
      [...config.matchAll(/c\('([a-z0-9-]+)'\)/g)].map((m) => `--color-${m[1]}`),
    );
    const provided = new Set(Object.keys(paletteVars(buildPalette('azure', 'light'))));
    for (const name of used) expect(provided.has(name), `${name} ບໍ່ມີໃນ palette`).toBe(true);
  });

  it('ຊ່ອງ channel ຂອງ var ເປັນຮູບແບບ "R G B"', () => {
    const vars = paletteVars(buildPalette('cobalt', 'dark'));
    for (const value of Object.values(vars)) expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    expect(vars['--color-chart-1']).toBeDefined();
    expect(vars['--color-aura-100']).toBeDefined();
  });

  it('ຄ່າເລີ່ມຕົ້ນໃນ global.css ກົງກັບ azure/light', () => {
    const css = readFileSync(join(__dirname, '..', 'global.css'), 'utf8');
    const vars = paletteVars(buildPalette('azure', 'light'));
    for (const [name, channels] of Object.entries(vars)) {
      expect(css, name).toContain(`${name}: ${channels};`);
    }
  });
});
