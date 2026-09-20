const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Chrome\//, 'Chrome'],
  [/CriOS\//, 'Chrome'],
  [/Firefox\//, 'Firefox'],
  [/Version\/.*Safari\//, 'Safari'],
];

const PLATFORMS: Array<[RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Linux/, 'Linux'],
];

/** Short "Browser • OS" label for a login's User-Agent header — no external dependency. */
export function parseDeviceLabel(ua?: string | null): string | null {
  if (!ua) return null;
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const platform = PLATFORMS.find(([re]) => re.test(ua))?.[1];
  if (!browser && !platform) return null;
  if (browser && platform) return `${browser} • ${platform}`;
  return browser ?? platform ?? null;
}
