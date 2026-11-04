import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth'

// Popups are blocked / stall inside an installed PWA (standalone) and are
// unreliable in mobile browsers, so those sign in via signInWithRedirect;
// everything else (desktop) uses the popup. Shared by the login page so the
// authDomain picked here always matches the flow it runs.
export function prefersRedirectSignIn(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
  return standalone || mobile
}

// Only the redirect flow needs a first-party auth handler: it uses our OWN
// domain as authDomain (reverse-proxied to firebaseapp.com in next.config.ts)
// so the OAuth handshake stays first-party and Safari/PWA storage partitioning
// doesn't drop getRedirectResult(). Desktop popup keeps the default
// firebaseapp.com authDomain — it has no partitioning problem and that domain
// is already a registered OAuth redirect target.
// NOTE: the custom-domain path requires https://<host>/__/auth/handler to be
// an Authorized redirect URI on the Google OAuth client.
const authDomain = prefersRedirectSignIn()
  ? window.location.host
  : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey:     process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain,
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
