import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="pt-14 min-h-screen bg-gray-50 flex items-center justify-center">
      <SignUp />
    </div>
  )
}
