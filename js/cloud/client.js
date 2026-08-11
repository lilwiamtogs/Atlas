import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
let clientPromise;

function loadSdk() {
  if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('atlas-supabase-sdk');
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        existing.remove();
        reject(new Error('Atlas cloud services are unavailable.'));
        return;
      }
      existing.addEventListener('load', () => resolve(globalThis.supabase), { once: true });
      existing.addEventListener('error', () => {
        existing.remove();
        reject(new Error('Atlas could not load cloud services.'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'atlas-supabase-sdk';
    script.src = SDK_URL;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve(globalThis.supabase);
    }, { once: true });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('Atlas could not load cloud services.'));
    }, { once: true });
    document.head.append(script);
  });
}

export function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = loadSdk().then((sdk) => {
      if (!sdk?.createClient) throw new Error('Atlas cloud services are unavailable.');
      return sdk.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storageKey: 'atlas.auth',
        },
      });
    }).catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}
