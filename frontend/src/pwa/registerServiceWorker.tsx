/// <reference types="vite-plugin-pwa/client" />
// =============================================================================
// Service-worker registration. Import ONLY after vite-plugin-pwa is enabled in
// vite.config.mts — `virtual:pwa-register` does not exist without the plugin.
//
//   main.tsx (lead):   import { registerServiceWorker } from './pwa/registerServiceWorker';
//                      registerServiceWorker();
//
// registerType 'prompt': a new deploy shows a toast with "Reload" instead of
// silently swapping code under a teacher in the middle of a register.
// =============================================================================
import { registerSW } from 'virtual:pwa-register';
import toast from 'react-hot-toast';
import { translate } from '@/i18n';

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast(
        (tst) => (
          <span className="flex items-center gap-3">
            {translate('A new version of PeopleNIT is available.')}
            <button
              type="button"
              className="font-semibold text-primary-600 hover:underline"
              onClick={() => {
                toast.dismiss(tst.id);
                void updateSW(true);
              }}
            >
              {translate('Reload')}
            </button>
          </span>
        ),
        { id: 'sw-update', duration: Infinity },
      );
    },
    onOfflineReady() {
      toast.success(translate('PeopleNIT is ready to work offline'), { id: 'sw-offline-ready' });
    },
  });
}
