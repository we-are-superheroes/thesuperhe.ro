import { SignIn } from '@clerk/nextjs'
import { Logo } from '@/components/ui/logo'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 50% 20%, rgba(46,95,170,0.2) 0%, transparent 70%)',
        }}
      />
      <div className="relative z-10 mb-8">
        <Logo size="lg" />
      </div>
      <SignIn />
    </div>
  )
}
