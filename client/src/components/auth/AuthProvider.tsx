import React, { createContext, useContext, useEffect, useState } from 'react'
import { authClient } from '../../../../lib/auth.client'
import type { User, Session } from '../../../../lib/auth.client'

// Extended organization type with custom fields
type Organization = {
  id: string
  name: string
  slug?: string
  metadata?: any
  domain?: string
  description?: string
  createdAt?: string
  updatedAt?: string
}

type OrganizationMember = {
  id: string
  organizationId: string
  userId: string
  role: string
}

type UserProfile = {
  id: string
  name: string
  email: string
  avatar_url?: string
}

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
  // Use BetterAuth React hooks for session and organization management
  const { data: session, isPending, error, refetch } = authClient.useSession()
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activeOrganization, setActiveOrganizationState] = useState<Organization | null>(null)
  
  // Use BetterAuth organization hooks (if available, fallback to state)
  const [organizations, setOrganizations] = useState<{
    organization: Organization
    membership: OrganizationMember
  }[]>([])
  
  // Derive user from session
  const user = session?.user || null
  const loading = isPending

  useEffect(() => {
    // Handle session changes
    if (session?.user) {
      console.log('✅ Session detected, loading user profile:', session.user.email)
      loadUserProfile(session.user.id).catch(console.error)
    } else {
      console.log('❌ No session, clearing user state')
      setProfile(null)
      setOrganizations([])
      setActiveOrganizationState(null)
    }
  }, [session])

  const loadUserProfile = async (userId: string) => {
    try {
      console.log('Loading user profile for:', userId)
      
      // Create profile from user data
      setProfile({
        id: userId,
        name: user?.name || 'User',
        email: user?.email || '',
        avatar_url: user?.image || undefined,
      })

      // Use BetterAuth organization APIs to get user organizations
      await loadUserOrganizations()

      console.log('✅ User profile loaded successfully')
    } catch (error) {
      console.error('❌ Error loading user profile:', error)
    }
  }

  const loadUserOrganizations = async () => {
    try {
      console.log('🔍 Loading organizations for user:', user?.email)
      
      // Use our custom organization API that includes all fields
      const response = await fetch('/api/organizations', {
        credentials: 'include'
      })
      
      console.log('🔍 API response status:', response.status)
      
      if (!response.ok) {
        console.warn('❌ Failed to load organizations. Status:', response.status)
        const errorText = await response.text()
        console.warn('❌ Error response:', errorText)
        setOrganizations([])
        return
      }

      const responseData = await response.json()
      console.log('🔍 Raw API response:', responseData)
      
      const { organizations: orgsData } = responseData
      
      // Debug: Log the custom API response
      console.log('🔍 Custom API returned', orgsData?.length || 0, 'organizations')
      console.log('🔍 Organizations data:', orgsData)

      if (!orgsData || !Array.isArray(orgsData)) {
        console.warn('❌ Invalid organizations data structure:', orgsData)
        setOrganizations([])
        return
      }

      // Transform custom API data to our format
      const formattedOrgs = orgsData.map((orgItem: any) => {
        console.log('🔍 Processing organization item:', orgItem)
        console.log('🔍 Organization name:', orgItem.organization?.name, 'Role:', orgItem.membership?.role)
        
        return {
          organization: {
            id: orgItem.organization.id,
            name: orgItem.organization.name,
            domain: orgItem.organization.domain,
            description: orgItem.organization.description,
            createdAt: orgItem.organization.createdAt
          },
          membership: {
            id: orgItem.membership.id,
            organizationId: orgItem.organization.id,
            userId: user?.id || '',
            role: orgItem.membership.role
          }
        }
      })

      console.log('✅ Formatted organizations:', formattedOrgs)
      console.log('✅ Organizations count:', formattedOrgs.length)
      setOrganizations(formattedOrgs)

      // Set active organization (default to first one)
      if (formattedOrgs.length > 0) {
        const savedActiveOrgId = localStorage.getItem('activeOrganizationId')
        const activeOrg = formattedOrgs.find(o => o.organization.id === savedActiveOrgId)?.organization || formattedOrgs[0].organization
        setActiveOrganizationState(activeOrg)
        console.log('✅ Active organization set:', activeOrg.name)
      } else {
        console.warn('❌ No organizations found for user')
        setActiveOrganizationState(null)
      }
      
      console.log('✅ Organizations loaded via custom API:', formattedOrgs.length)
    } catch (error) {
      console.error('❌ Error loading organizations:', error)
      setOrganizations([])
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user.id)
    }
  }

  const signIn = async (email: string, password: string): Promise<void> => {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    })
    
    if (error) {
      throw new Error(error.message)
    }
  }

  const signUp = async (email: string, password: string, name: string): Promise<void> => {
    const { data, error } = await authClient.signUp.email({
      email,
      password,
      name,
    })

    if (error) {
      throw new Error(error.message)
    }

    // BetterAuth organization plugin handles organization creation/assignment automatically
    // No custom onboarding logic needed - organization membership is handled via invitation acceptance
    console.log('✅ User registration completed via BetterAuth')
  }

  const signOut = async () => {
    const { error } = await authClient.signOut()
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