import React, { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from './AuthProvider'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, organizations, activeOrganization, organizationsLoading } = useAuth()
  const [, setLocation] = useLocation()
  const [hasCheckedOrganizations, setHasCheckedOrganizations] = useState(false)

  useEffect(() => {
    // If not loading and no user, redirect to welcome page
    if (!loading && !user) {
      setLocation('/')
      return
    }

    // If user exists but no organizations, redirect to onboarding
    // Only do this after organizations have finished loading to avoid race conditions
    if (!loading && user && organizations.length === 0 && !organizationsLoading && !hasCheckedOrganizations) {
      // Give a longer grace period for organizations to load after user login/refresh
      const timer = setTimeout(() => {
        // Double-check that organizations are still not loaded and not currently loading
        if (organizations.length === 0 && !organizationsLoading) {
          console.log('User authenticated but no organizations found after grace period, redirecting to onboarding')
          setLocation('/onboarding')
          setHasCheckedOrganizations(true)
        }
      }, 1500)
      
      return () => clearTimeout(timer)
    }
    
    // Reset the check flag when organizations are found
    if (organizations.length > 0) {
      setHasCheckedOrganizations(false)
    }
  }, [loading, user, organizations.length, organizationsLoading, setLocation, hasCheckedOrganizations])

  // Show loading spinner while checking authentication or loading organizations
  if (loading || (user && organizationsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : 'Loading organizations...'}
          </p>
        </div>
      </div>
    )
  }

  // If no user, don't render children (redirect will happen in useEffect)
  if (!user) {
    return null
  }

  // If user has no organizations, show loading state while useEffect handles redirect
  // Remove direct setLocation call to prevent setState during render warning
  if (organizations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Setting up your organizations...</p>
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