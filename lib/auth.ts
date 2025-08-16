// DEPRECATED: Custom organization management replaced with BetterAuth organization plugin
// All organization operations now handled by BetterAuth standard APIs

// Legacy types kept for backward compatibility during migration
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  domain?: string;
}

export interface Organization {
  id: string;
  name: string;
  domain: string;
  subscription_tier?: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

// REMOVED: All custom organization management functions
// BetterAuth organization plugin now handles:
// - getUserOrganizations() → authClient.organization.listOrganizations()
// - createDefaultOrganization() → BetterAuth handles with allowUserToCreateOrganization setting
// - getDefaultOrganization() → No longer needed, BetterAuth manages organization creation

// REMOVED: getOrganizationMembers() function
// BetterAuth organization plugin now handles member management via authClient.organization.listMembers()

// REMOVED: completeUserOnboarding() function
// BetterAuth handles user onboarding automatically during signup