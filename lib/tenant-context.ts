import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Tenant Context Management for Multi-Tenant PostgreSQL RLS
 * Based on industry-standard patterns from Auth0, Clerk, and PostgreSQL RLS best practices
 */

export interface TenantContext {
  organizationId: string;
  userId: string;
  userRole?: string;
}

export class TenantContextManager {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  /**
   * Set the tenant context for the current database session
   * This enables PostgreSQL RLS policies to filter data automatically
   */
  async setTenantContext(context: TenantContext): Promise<void> {
    await this.db.execute(
      sql`SELECT set_config('app.current_organization_id', ${context.organizationId}, true)`
    );
    await this.db.execute(
      sql`SELECT set_config('app.current_user_id', ${context.userId}, true)`
    );
  }

  /**
   * Clear the tenant context (useful for admin operations or cleanup)
   */
  async clearTenantContext(): Promise<void> {
    await this.db.execute(
      sql`SELECT set_config('app.current_organization_id', '', true)`
    );
    await this.db.execute(
      sql`SELECT set_config('app.current_user_id', '', true)`
    );
  }

  /**
   * Execute a query within a specific tenant context
   * Automatically sets and clears context around the operation
   */
  async withTenantContext<T>(
    context: TenantContext,
    operation: () => Promise<T>
  ): Promise<T> {
    await this.setTenantContext(context);
    try {
      return await operation();
    } finally {
      // Always clear context after operation to prevent leakage
      await this.clearTenantContext();
    }
  }

  /**
   * Verify user has access to organization and return their role
   */
  async verifyOrganizationAccess(
    organizationId: string,
    userId: string
  ): Promise<{ hasAccess: boolean; role?: string }> {
    const result = await this.db.execute(
      sql`SELECT role FROM member WHERE organization_id = ${organizationId} AND user_id = ${userId}`
    );

    // Handle different result formats from postgres driver
    const rows = result.rows || result;
    if (!rows || (Array.isArray(rows) && rows.length === 0) || (!Array.isArray(rows) && Object.keys(rows).length === 0)) {
      return { hasAccess: false };
    }

    const firstRow = Array.isArray(rows) ? rows[0] : rows;
    return {
      hasAccess: true,
      role: firstRow.role,
    };
  }

  /**
   * Check if user has specific permission in organization
   */
  async hasPermission(
    organizationId: string,
    userId: string,
    requiredRoles: string[]
  ): Promise<boolean> {
    const { hasAccess, role } = await this.verifyOrganizationAccess(
      organizationId,
      userId
    );

    return hasAccess && role && requiredRoles.includes(role);
  }

  /**
   * Get all organizations for a user with their roles
   */
  async getUserOrganizations(userId: string): Promise<Array<{
    organizationId: string;
    organizationName: string;
    role: string;
  }>> {
    const result = await this.db.execute(
      sql`
        SELECT 
          m.organization_id,
          o.name as organization_name,
          m.role
        FROM member m
        JOIN organization o ON m.organization_id = o.id
        WHERE m.user_id = ${userId}
        ORDER BY o.name
      `
    );

    return result.rows.map((row: any) => ({
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      role: row.role,
    }));
  }

  /**
   * Execute query with superuser privileges (bypasses RLS)
   * Use with extreme caution - only for admin operations and migrations
   */
  async executeAsAdmin<T>(operation: () => Promise<T>): Promise<T> {
    // Store current context
    let currentOrgId: string | null = null;
    let currentUserId: string | null = null;

    try {
      // Get current context
      const orgResult = await this.db.execute(
        sql`SELECT current_setting('app.current_organization_id', true) as value`
      );
      const userResult = await this.db.execute(
        sql`SELECT current_setting('app.current_user_id', true) as value`
      );

      // Handle different result formats from postgres driver
      const orgRows = orgResult.rows || orgResult;
      const userRows = userResult.rows || userResult;
      
      currentOrgId = (Array.isArray(orgRows) && orgRows[0]?.value) || null;
      currentUserId = (Array.isArray(userRows) && userRows[0]?.value) || null;

      // Clear context to bypass RLS
      await this.clearTenantContext();

      // Execute operation
      return await operation();
    } finally {
      // Restore previous context
      if (currentOrgId && currentUserId) {
        await this.setTenantContext({
          organizationId: currentOrgId,
          userId: currentUserId,
        });
      }
    }
  }
}

/**
 * Factory function to create tenant context manager
 */
export async function createTenantContextManager(): Promise<TenantContextManager> {
  const db = await getDb();
  return new TenantContextManager(db);
}

/**
 * Convenience function for common tenant operations
 */
export async function withTenantContext<T>(
  context: TenantContext,
  operation: () => Promise<T>
): Promise<T> {
  const manager = await createTenantContextManager();
  return manager.withTenantContext(context, operation);
}

/**
 * Role hierarchy for permission checking
 */
export const ORGANIZATION_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;

export const ROLE_HIERARCHY = {
  [ORGANIZATION_ROLES.OWNER]: 4,
  [ORGANIZATION_ROLES.ADMIN]: 3,
  [ORGANIZATION_ROLES.EDITOR]: 2,
  [ORGANIZATION_ROLES.VIEWER]: 1,
} as const;

/**
 * Check if role has sufficient permissions
 */
export function hasMinimumRole(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as keyof typeof ROLE_HIERARCHY] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole as keyof typeof ROLE_HIERARCHY] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Permission sets for different operations
 */
export const PERMISSIONS = {
  // Organization management
  VIEW_ORGANIZATION: [ORGANIZATION_ROLES.VIEWER, ORGANIZATION_ROLES.EDITOR, ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  UPDATE_ORGANIZATION: [ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  DELETE_ORGANIZATION: [ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  
  // Member management
  VIEW_MEMBERS: [ORGANIZATION_ROLES.EDITOR, ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  INVITE_MEMBERS: [ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  REMOVE_MEMBERS: [ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  MANAGE_ROLES: [ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  
  // Project management
  VIEW_PROJECTS: [ORGANIZATION_ROLES.VIEWER, ORGANIZATION_ROLES.EDITOR, ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  CREATE_PROJECTS: [ORGANIZATION_ROLES.EDITOR, ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER],
  UPDATE_PROJECTS: [ORGANIZATION_ROLES.EDITOR, ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER], // Plus project owner check
  DELETE_PROJECTS: [ORGANIZATION_ROLES.EDITOR, ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.OWNER], // Plus project owner check
} as const;

export type OrganizationRole = typeof ORGANIZATION_ROLES[keyof typeof ORGANIZATION_ROLES];
export type Permission = keyof typeof PERMISSIONS;