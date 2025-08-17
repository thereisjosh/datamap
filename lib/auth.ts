// Legacy types and interfaces for backward compatibility
// Organization management now handled by custom API endpoints

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

// Organization management functions moved to custom API endpoints
// See server/organization-api.ts for current implementation

// Organization member management handled by custom API endpoints
// See server/organization-api.ts for member operations

// User onboarding handled during signup process
// Custom organization setup handled by organization API