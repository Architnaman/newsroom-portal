import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [isLogin, setIsLogin] = useState(true)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'reporter' | 'editor'>('reporter')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()

    setLoading(true)
    setError('')

    try {
      // LOGIN
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setError(error.message)
        } else {
          alert('Login successful!')
        }
      }

      // SIGNUP
      else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) {
          setError(error.message)
          setLoading(false)
          return
        }

        if (data.user) {
          console.log('USER CREATED:', data.user)

          const { data: reporterData, error: reporterError } =
            await supabase
              .from('reporters')
              .insert([
                {
                  id: data.user.id,
                  name: name || email.split('@')[0],
                  email: email,
                  beats: ['General'],
                  max_stories_per_week: 4,
                  status: 'active',
                },
              ])
              .select()

          console.log('REPORTER DATA:', reporterData)
          console.log('REPORTER ERROR:', reporterError)

          if (reporterError) {
            setError(reporterError.message)
            setLoading(false)
            return
          }

          alert('Account created successfully!')
          setIsLogin(true)
        }
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Something went wrong')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center border border-yellow-500">
      <div className="w-full max-w-xl p-10 border border-yellow-500">
        <h1 className="text-6xl font-bold text-center text-yellow-400 mb-8">
          NEWSROOM OS
        </h1>

        <h2 className="text-4xl font-bold text-center mb-2">
          {isLogin ? 'Sign In' : 'Create account'}
        </h2>

        <p className="text-center text-gray-400 mb-10">
          Join the newsroom team
        </p>

        <form onSubmit={handleAuth} className="space-y-6">

          {!isLogin && (
            <div>
              <label className="block mb-2 text-xl">
                FULL NAME
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-4 bg-black border border-gray-700 text-white text-2xl"
                required
              />
            </div>
          )}

          <div>
            <label className="block mb-2 text-xl">
              EMAIL
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 bg-black border border-gray-700 text-white text-2xl"
              required
            />
          </div>

          <div>
            <label className="block mb-2 text-xl">
              PASSWORD
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 bg-black border border-gray-700 text-white text-2xl"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block mb-4 text-xl">
                ROLE
              </label>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setRole('reporter')}
                  className={`flex-1 p-4 border text-2xl ${
                    role === 'reporter'
                      ? 'bg-yellow-500 text-black border-yellow-500'
                      : 'border-gray-700'
                  }`}
                >
                  REPORTER
                </button>

                <button
                  type="button"
                  onClick={() => setRole('editor')}
                  className={`flex-1 p-4 border text-2xl ${
                    role === 'editor'
                      ? 'bg-yellow-500 text-black border-yellow-500'
                      : 'border-gray-700'
                  }`}
                >
                  EDITOR
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900 border border-red-500 text-red-200 p-4 text-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-yellow-500 text-black py-4 text-2xl font-bold hover:bg-yellow-400"
          >
            {loading
              ? 'PLEASE WAIT...'
              : isLogin
              ? 'SIGN IN'
              : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div className="text-center mt-8">
          <button
            onClick={() => {
              setIsLogin(!isLogin)
              setError('')
            }}
            className="text-yellow-400 text-xl"
          >
            {isLogin
              ? 'Need an account? Create one'
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}