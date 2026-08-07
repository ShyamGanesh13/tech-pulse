import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, setPersistence, inMemoryPersistence } from 'firebase/auth'

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey:     process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    })

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

// Use in-memory persistence — avoids IndexedDB "closing/hidden" errors on
// Safari/WebKit when the popup causes the main page to become hidden.
// We don't need Firebase to persist anything since we set our own cookie.
setPersistence(auth, inMemoryPersistence)
