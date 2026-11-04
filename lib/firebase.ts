import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth'

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey:     process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      // Serve Firebase's auth handler from our OWN domain (reverse-proxied to
      // <project>.firebaseapp.com in next.config.ts). Using the app's own host
      // as authDomain keeps the OAuth handshake first-party, so
      // signInWithRedirect completes inside an installed PWA and in Safari. With
      // the default firebaseapp.com authDomain the handler is a third party
      // there, and Safari's storage partitioning drops the redirect result —
      // getRedirectResult() comes back empty and the login loops forever.
      authDomain: typeof window !== 'undefined'
        ? window.location.host
        : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    })

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

// localStorage persistence. The mobile / installed-PWA sign-in path uses
// signInWithRedirect, which navigates the whole page to Google and back, so the
// pending-redirect state MUST survive a full reload — in-memory persistence
// would be wiped and getRedirectResult() would always come back empty. This
// uses localStorage (not IndexedDB), so it also avoids the Safari/WebKit
// "closing/hidden" IndexedDB errors the popup flow used to hit.
setPersistence(auth, browserLocalPersistence)
