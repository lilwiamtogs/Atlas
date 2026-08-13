import { getSupabaseClient } from './client.js';
import { loadSyncMetadata } from '../sync/metadata.js';

let initialized = false;
let store;
let authSubscription;

function accountPatch(status, values = {}) {
  const currentSync = store?.get().syncStatus || { state: 'disabled', lastSyncedAt: '', error: '' };
  const signedInSyncState = currentSync.lastSyncedAt ? 'synced' : 'ready';
  return {
    account: {
      status,
      user: null,
      message: '',
      error: '',
      ...values,
    },
    syncStatus: {
      state: status === 'signed-in' ? signedInSyncState : status === 'offline' ? 'offline' : 'disabled',
      lastSyncedAt: currentSync.lastSyncedAt,
      error: status === 'offline' ? currentSync.error : '',
    },
  };
}

function applySession(session) {
  const user = session?.user || null;
  if (user) {
    localStorage.setItem('atlas.profileSignedIn', 'true');
    const name = String(user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || '').trim().toLocaleLowerCase();
    if (name) localStorage.setItem('atlas.profileName', name);
  } else {
    localStorage.removeItem('atlas.profileSignedIn');
  }
  const metadata = loadSyncMetadata();
  if (user && metadata.userId && metadata.userId !== user.id) {
    store.set({ syncStatus: { state: 'ready', lastSyncedAt: '', error: '' } });
  }
  store.set(accountPatch(user ? 'signed-in' : 'signed-out', { user }));
}

export async function updateDisplayName(displayName) {
  const name = String(displayName || '').trim().toLocaleLowerCase().slice(0, 40);
  if (!name) throw new Error('Enter a name first.');
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.updateUser({ data: { display_name: name } });
  if (error) throw error;
  localStorage.setItem('atlas.profileName', name);
  applySession({ user: data.user });
  return name;
}

export async function initializeAuth(Store) {
  if (initialized) return;
  initialized = true;
  store = Store;

  const updateConnectionState = () => {
    if (!navigator.onLine) {
      const current = store.get().account;
      store.set(accountPatch('offline', { user: current?.user || null }));
    } else if (store.get().account?.status === 'offline') {
      initializeSession();
    }
  };
  window.addEventListener('online', updateConnectionState);
  window.addEventListener('offline', updateConnectionState);

  if (!navigator.onLine) {
    store.set(accountPatch('offline'));
    return;
  }
  await initializeSession();
}

async function initializeSession() {
  try {
    store.set(accountPatch('loading', { user: store.get().account?.user || null }));
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    applySession(data.session);
    if (!authSubscription) {
      const listener = client.auth.onAuthStateChange((_event, session) => applySession(session));
      authSubscription = listener.data.subscription;
    }
  } catch (error) {
    store.set(accountPatch(navigator.onLine ? 'error' : 'offline', { error: error.message }));
  }
}

export async function requestSignIn(email) {
  if (!navigator.onLine) throw new Error('Connect to the internet before signing in.');
  const client = await getSupabaseClient();
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  store.set(accountPatch('signed-out', {
    message: `A sign-in link was sent to ${email}.`,
  }));
}

export async function requestGoogleSignIn() {
  if (!navigator.onLine) throw new Error('Connect to the internet before signing in.');
  const client = await getSupabaseClient();
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  const client = await getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
  store.set(accountPatch('signed-out', { message: 'Signed out. Your local Atlas data is still here.' }));
}

export function setAccountError(message) {
  const current = store.get().account;
  store.set({ account: { ...current, error: message, message: '' } });
}
