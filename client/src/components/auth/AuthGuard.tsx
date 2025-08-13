import React, { useEffect } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from './AuthProvider'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, organizations, activeOrganization } = useAuth()
  const [, setLocation] = useLocation()

  useEffect(() => {
    // If not loading and no user, redirect to welcome page
    if (!loading && !user) {
      setLocation('/')
      return
    }

    // If user exists but no organizations, there might be an onboarding issue
    if (!loading && user && organizations.length === 0) {
      console.warn('User authenticated but no organizations found')
      // Could redirect to a setup page or show an error
    }
  }, [loading, user, organizations.length, setLocation])

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // If no user, don't render children (redirect will happen in useEffect)
  if (!user) {
    return null
  }

  // If user has no organizations, show error state
  if (organizations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-xl font-semibold">Setup Required</h2>
          <p className="text-muted-foreground">
            There was an issue setting up your organization. Please sign out and try again.
          </p>
        </div>
      </div>
    )
  }

  // If user has organizations but no active one selected, select the first one
  if (!activeOrganization && organizations.length > 0) {
    // This should be handled by AuthProvider, but as a fallback
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
        </div>
      </div>
    )
  }

  // User is authenticated and has organizations - render protected content
  return <>{children}</>
}