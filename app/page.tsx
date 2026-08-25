import { redirect } from 'next/navigation'
import { getUserIdOrNull } from '@/lib/auth'
import Landing from '@/app/components/Landing'

export default async function Home() {
  const uid = await getUserIdOrNull()
  if (uid) redirect('/home')
  return <Landing />
}
