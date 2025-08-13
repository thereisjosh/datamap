import { createClient } from './supabase'
import type { Database } from './supabase'

export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type Organization = Database['public']['Tables']['organizations']['Row']
export type OrganizationMember = Database['public']['Tables']['organization_members']['Row']
export type OrganizationRole = Database['public']['Enums']['organization_role']

// Extract domain from email
export function extractDomainFromEmail(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) {
    throw new Error('Invalid email format')
  }
  return domain
}

// Create or get organization for domain
export async function createOrGetOrganization(domain: string): Promise<Organization> {
  const supabase = createClient()
  
  // First try to get existing organization
  const { data: existingOrg, error: fetchError } = await supabase
    .from('organizations')
    .select('*')
    .eq('domain', domain)
    .single()
  
  if (existingOrg) {
    return existingOrg
  }
  
  // If it doesn't exist, create new organization
  const orgName = domain.split('.')[0] // e.g., "company" from "company.com"
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letters
  
  const { data: newOrg, error: createError } = await supabase
    .from('organizations')
    .insert({
      name: orgName,
      domain: domain,
      subscription_tier: 'free'
    })
    .select()
    .single()
  
  if (createError || !newOrg) {
    throw new Error(`Failed to create organization: ${createError?.message}`)
  }
  
  return newOrg
}

// Create user profile after signup
export async function createUserProfile(
  userId: string,
  email: string,
  name: string,
  avatarUrl?: string
): Promise<UserProfile> {
  const supabase = createClient()
  const domain = extractDomainFromEmail(email)
  
  const { data, error } = await supabase
    .from('user_profiles')
    .insert({
      id: userId,
      email,
      name,
      domain,
      avatar_url: avatarUrl
    })
    .select()
    .single()
  
  if (error || !data) {
    throw new Error(`Failed to create user profile: ${error?.message}`)
  }
  
  return data
}

// Add user to organization
export async function addUserToOrganization(
  userId: string,
  organizationId: string,
  role: OrganizationRole = 'viewer',
  invitedBy?: string
): Promise<OrganizationMember> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('organization_members')
    .insert({
      user_id: userId,
      organization_id: organizationId,
      role,
      invited_by: invitedBy
    })
    .select()
    .single()
  
  if (error || !data) {
    throw new Error(`Failed to add user to organization: ${error?.message}`)
  }
  
  return data
}

// Get user's organizations with roles
export async function getUserOrganizations(userId: string): Promise<{
  organization: Organization,
  membership: OrganizationMember
}[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      *,
      organizations (*)
    `)
    .eq('user_id', userId)
  
  if (error) {
    throw new Error(`Failed to get user organizations: ${error.message}`)
  }
  
  return data?.map(member => ({
    organization: member.organizations as Organization,
    membership: member
  })) || []
}

// Check if user is first user in organization (should be owner)
export async function isFirstUserInOrganization(organizationId: string): Promise<boolean> {
  const supabase = createClient()
  
  const { count, error } = await supabase
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
  
  if (error) {
    throw new Error(`Failed to check organization membership: ${error.message}`)
  }
  
  return (count || 0) === 0
}

// Complete user onboarding (create profile + organization membership)
export async function completeUserOnboarding(
  userId: string,
  email: string,
  name: string,
  avatarUrl?: string
): Promise<{
  profile: UserProfile,
  organization: Organization,
  membership: OrganizationMember
}> {
  const domain = extractDomainFromEmail(email)
  
  // Create or get organization
  const organization = await createOrGetOrganization(domain)
  
  // Check if this is the first user (should be owner)
  const isFirstUser = await isFirstUserInOrganization(organization.id)
  const role: OrganizationRole = isFirstUser ? 'owner' : 'viewer'
  
  // Create user profile
  const profile = await createUserProfile(userId, email, name, avatarUrl)
  
  // Add user to organization
  const membership = await addUserToOrganization(userId, organization.id, role)
  
  return {
    profile,
    organization,
    membership
  }
}