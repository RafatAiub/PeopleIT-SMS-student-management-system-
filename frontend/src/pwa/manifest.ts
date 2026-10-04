// =============================================================================
// Web app manifest for vite-plugin-pwa. Imported by vite.config.mts (see the
// snippet in docs/redesign/OPERATIONS.md §PWA). Kept free of browser/React
// imports so it can load in the Node-side Vite config.
//
// Icons: the only brand asset in /public today is favicon.svg (32×32 viewBox,
// scales cleanly). Chrome/Edge accept an SVG icon with sizes "any"; for the
// best install experience on older Android and iOS add PNGs at
// public/pwa-192.png, public/pwa-512.png and public/apple-touch-icon.png and
// list them below.
// =============================================================================

export const pwaManifest = {
  name: 'PeopleNIT SMS',
  short_name: 'PeopleNIT',
  description: 'School management for Bangladesh — attendance, results, fees and notices.',
  lang: 'en',
  dir: 'ltr' as const,
  start_url: '/',
  scope: '/',
  display: 'standalone' as const,
  orientation: 'portrait' as const,
  background_color: '#171717',
  theme_color: '#393939',
  categories: ['education', 'productivity'],
  icons: [
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
};

export default pwaManifest;
