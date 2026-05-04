import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export default async function DashboardPage() {
  const { userId } = await auth()
  const user = await db.user.findUnique({
    where: { id: userId! },
    select: { name: true, email: true },
  })

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">
        Welcome back{user?.name ? `, ${user.name}` : ''}
      </h1>
      <p className="mt-2 text-zinc-600">
        Find projects, contribute your skills, and help move the climate forward.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DashboardCard title="Browse projects" href="/projects" description="Find active projects looking for your skills" />
        <DashboardCard title="Browse blueprints" href="/blueprints" description="Start a proven project type in your community" />
        <DashboardCard title="My contributions" href="/profile" description="Track your impact across projects" />
      </div>
    </main>
  )
}

function DashboardCard({ title, href, description }: { title: string; href: string; description: string }) {
  return (
    <a
      href={href}
      className="block rounded-xl border border-zinc-200 p-5 hover:border-green-400 hover:shadow-sm transition-all"
    >
      <h3 className="font-semibold text-zinc-900 mb-1">{title}</h3>
      <p className="text-sm text-zinc-600">{description}</p>
    </a>
  )
}
