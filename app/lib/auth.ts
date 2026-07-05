'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`)
  }

  if (data.session) {
    redirect('/workspace')
  }

  redirect('/login?message=' + encodeURIComponent('Check your email to confirm your account.'))
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/workspace')
}

export async function signInWithGoogleAction() {
  const origin = (await headers()).get('origin')
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  if (data.url) {
    redirect(data.url)
  }
}

export async function signInWithGitHubAction() {
  const origin = (await headers()).get('origin')
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${origin}/auth/callback` },
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  if (data.url) {
    redirect(data.url)
  }
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const origin = (await headers()).get('origin')

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  })

  // Supabase's own API never errors just because the email doesn't belong
  // to an account (by design, to prevent enumeration) -- it only errors for
  // real failures like rate-limiting. So surfacing `error` here is safe and
  // doesn't leak whether an account exists; it just stops pretending an
  // email was sent when the request actually failed.
  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/forgot-password?message=' + encodeURIComponent(
    'If an account exists for that email, a password reset link is on its way.',
  ))
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/workspace')
}
