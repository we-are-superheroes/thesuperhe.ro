import Link from 'next/link'

export default function MarketingHomePage() {
  return (
    <main className="flex flex-col min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
        <span className="font-semibold text-lg tracking-tight">thesuperhe.ro</span>
        <div className="flex gap-3">
          <Link
            href="/sign-in"
            className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      <section className="flex flex-col items-center justify-center flex-1 px-6 py-24 text-center">
        <h1 className="max-w-2xl text-5xl font-bold tracking-tight leading-tight text-zinc-900">
          Your skills can fight the climate crisis
        </h1>
        <p className="mt-6 max-w-xl text-xl text-zinc-600 leading-relaxed">
          Connect with climate and sustainability projects that need exactly what you have to offer — whether you have ten minutes or ten hours.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            href="/sign-up"
            className="px-6 py-3 text-base font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Find a project
          </Link>
          <Link
            href="/projects"
            className="px-6 py-3 text-base font-semibold border border-zinc-300 text-zinc-700 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Browse projects
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 px-6 py-16 max-w-5xl mx-auto w-full">
        {[
          {
            title: 'All skills welcome',
            body: 'Legal, creative, technical, community — every skill has a place in the climate movement.',
          },
          {
            title: 'Contribute on your schedule',
            body: 'Join a single project step that fits your availability, not the whole project.',
          },
          {
            title: 'Blueprints to get started fast',
            body: 'Reusable project templates — Repair Cafés, community solar groups, and more — ready to spin up anywhere.',
          },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-zinc-200 p-6">
            <h3 className="font-semibold text-zinc-900 mb-2">{card.title}</h3>
            <p className="text-zinc-600 text-sm leading-relaxed">{card.body}</p>
          </div>
        ))}
      </section>
    </main>
  )
}
