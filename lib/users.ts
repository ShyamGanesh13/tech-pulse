import {
  createUser, findUserByEmail, findUserByFirebaseUid,
  linkFirebaseUid, touchUserLogin, getUserById,
} from './data'
import type { User } from './types'

export interface GoogleIdentity {
  firebaseUid: string
  email: string
  name: string | null
  picture: string | null
}

// Resolution order matters. firebase_uid is the stable key, so it is tried
// first. The email fallback exists so that a Google login and the passcode
// break-glass login for the same person converge on ONE tenant instead of
// creating a second, empty one.
export async function resolveGoogleUser(identity: GoogleIdentity): Promise<User> {
  const normalizedEmail = identity.email.trim().toLowerCase()

  const byUid = await findUserByFirebaseUid(identity.firebaseUid)
  if (byUid) {
    await touchUserLogin(byUid.id, {
      email: normalizedEmail, name: identity.name, picture: identity.picture,
    })
    return (await getUserById(byUid.id))!
  }

  const byEmail = await findUserByEmail(normalizedEmail)
  if (byEmail) {
    await linkFirebaseUid(byEmail.id, identity.firebaseUid)
    await touchUserLogin(byEmail.id, { name: identity.name, picture: identity.picture })
    return (await getUserById(byEmail.id))!
  }

  return createUser({
    email: normalizedEmail,
    firebase_uid: identity.firebaseUid,
    name: identity.name,
    picture: identity.picture,
  })
}

// The passcode admin account is identified by email alone and carries a null
// firebase_uid until a Google login links one.
export async function resolveAdminUser(email: string): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase()

  const existing = await findUserByEmail(normalizedEmail)
  if (existing) {
    await touchUserLogin(existing.id, {})
    return (await getUserById(existing.id))!
  }
  return createUser({ email: normalizedEmail, firebase_uid: null, name: 'Admin', picture: null })
}
