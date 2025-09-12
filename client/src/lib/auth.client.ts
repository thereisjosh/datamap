import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host}/api/auth`
    : (import.meta.env?.VITE_BETTER_AUTH_URL || "http://localhost:3000/api/auth"),
  plugins: [],
});

// Export types for better TypeScript support
export type User = typeof authClient.$Infer.Session.user;
export type Session = typeof authClient.$Infer.Session;

// Helper interfaces for multi-tenant functionality
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

// Organization management handled via custom API endpoints in server/organization-api.ts
// Available at /api/organizations/*