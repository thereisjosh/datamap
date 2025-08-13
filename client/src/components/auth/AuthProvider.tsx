import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '../../../../lib/supabase'
import { completeUserOnboarding, getUserOrganizations } from '../../../../lib/auth'
import type { User } from '@supabase/supabase-js'
import type { UserProfile, Organization, OrganizationMember } from '../../../../lib/auth'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  organizations: {
    organization: Organization
    membership: OrganizationMember
  }[]
  activeOrganization: Organization | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  setActiveOrganization: (org: Organization) => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [organizations, setOrganizations] = useState<{
    organization: Organization
    membership: OrganizationMember
  }[]>([])
  const [activeOrganization, setActiveOrganizationState] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      
      if (session?.user) {
        if (event === 'SIGNED_IN') {
          await loadUserProfile(session.user.id)
        }
      } else {
        setProfile(null)
        setOrganizations([])
        setActiveOrganizationState(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadUserProfile = async (userId: string) => {
    try {
      setLoading(true)
      
      // Get user profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) {
        console.error('Profile error:', profileError)
        setLoading(false)
        return
      }

      setProfile(profileData)

      // Get user organizations
      const orgs = await getUserOrganizations(userId)
      setOrganizations(orgs)

      // Set active organization (default to first one)
      if (orgs.length > 0) {
        const savedActiveOrgId = localStorage.getItem('activeOrganizationId')
        const activeOrg = orgs.find(o => o.organization.id === savedActiveOrgId)?.organization || orgs[0].organization
        setActiveOrganizationState(activeOrg)
      }

    } catch (error) {
      console.error('Error loading user profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user.id)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      throw new Error(error.message)
    }
  }

  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
        },
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    // If user is immediately available (no email confirmation required)
    if (data.user && !data.session) {
      // User needs to confirm email
      throw new Error('Please check your email for a confirmation link')
    }

    if (data.user && data.session) {
      // Complete onboarding
      try {
        await completeUserOnboarding(
          data.user.id,
          email,
          name,
          data.user.user_metadata?.avatar_url
        )
      } catch (onboardingError) {
        console.error('Onboarding error:', onboardingError)
        // Don't throw here - user is already created
      }
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw new Error(error.message)
    }
    
    // Clear local storage
    localStorage.removeItem('activeOrganizationId')
  }

  const setActiveOrganization = (org: Organization) => {
    setActiveOrganizationState(org)
    localStorage.setItem('activeOrganizationId', org.id)
  }

  const value: AuthContextType = {
    user,
    profile,
    organizations,
    activeOrganization,
    loading,
    signIn,
    signUp,
    signOut,
    setActiveOrganization,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}