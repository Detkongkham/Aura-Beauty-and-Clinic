const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Chrome\//, 'Chrome'],
  [/CriOS\//, 'Chrome'],
  [/Firefox\//, 'Firefox'],
  [/Version\/.*Safari\//, 'Safari'],
  // React Native / Expo HTTP stacks — the Aura mobile app.
  [/okhttp|CFNetwork|Expo/i, 'App'],
];

const PLATFORMS: Array<[RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Linux/, 'Linux'],
  [/okhttp/i, 'Android'],
  [/CFNetwork|Darwin/, 'iOS'],
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
