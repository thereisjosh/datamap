import type { Express, Request, Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "../lib/db";
import { 
  organization, 
  member, 
  invitation, 
  user,
  projects,
  type Organization,
  type OrganizationMember,
  type Invitation 
} from "../shared/schema";
import { 
  createTenantContextManager, 
  PERMISSIONS,
  ORGANIZATION_ROLES,
  hasMinimumRole,
  type TenantContext 
} from "../lib/tenant-context";
import { emailService } from "./services/emailService";

/**
 * Custom Organization API - Industry Standard Multi-Tenant Implementation
 * Custom organization management implementation for multi-tenant SaaS
 * Based on patterns from Auth0, Clerk, and successful SaaS platforms
 */

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
  session?: any;
}

/**
 * Extract user information from BetterAuth session
 */
async function getUserFromRequest(req: AuthenticatedRequest): Promise<{ id: string; email: string; name: string } | null> {
  // Return cached user if already extracted
  if (req.user) {
    return req.user;
  }
  
  try {
    // Enhanced debugging for WWW vs non-WWW domain issues
    const host = req.headers.host || 'unknown';
    const origin = req.headers.origin || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const cookies = req.headers.cookie || 'no-cookies';
    
    console.log('🔍 Session extraction debug:', {
      host,
      origin, 
      userAgent: userAgent.substring(0, 50) + '...',
      hasCookies: !!req.headers.cookie,
      cookieCount: cookies.split(';').length,
      cookiePreview: cookies.substring(0, 100) + '...'
    });

    // Use BetterAuth to get session
    const { getAuth } = await import('./auth');
    const auth = await getAuth();
    
    console.log('🔍 Calling BetterAuth getSession with headers:', {
      host,
      hasAuthHeader: !!req.headers.authorization,
      hasCookieHeader: !!req.headers.cookie,
      cookieNames: req.headers.cookie ? Object.keys(parseCookies(req.headers.cookie)) : []
    });
    
    const sessionData = await auth.api.getSession({ headers: req.headers });
    
    console.log('🔍 BetterAuth session result:', {
      hasSession: !!sessionData,
      hasUser: !!sessionData?.user,
      userId: sessionData?.user?.id,
      userEmail: sessionData?.user?.email,
      sessionId: sessionData?.session?.id
    });
    
    if (sessionData?.user) {
      const user = {
        id: sessionData.user.id,
        email: sessionData.user.email,
        name: sessionData.user.name,
      };
      
      console.log('✅ Successfully extracted user from session:', {
        userId: user.id,
        email: user.email,
        host,
        origin
      });
      
      // Cache user on request for subsequent middleware
      req.user = user;
      return user;
    } else {
      console.warn('⚠️ No user found in session data:', {
        host,
        origin,
        sessionDataExists: !!sessionData,
        cookiesExist: !!req.headers.cookie
      });
      
      // Manual cookie parsing fallback for debugging
      if (req.headers.cookie) {
        console.log('🔍 Attempting manual cookie parsing for debugging...');
        const cookieObj = parseCookies(req.headers.cookie);
        console.log('🔍 Parsed cookies:', {
          cookieNames: Object.keys(cookieObj),
          betterAuthSession: cookieObj['better-auth.session_token'] ? 'present' : 'missing',
          sessionTokenPreview: cookieObj['better-auth.session_token']?.substring(0, 20) + '...' || 'not found'
        });
        
        // If we have a session token but Better-Auth couldn't parse it, there might be a domain issue
        if (cookieObj['better-auth.session_token']) {
          console.warn('⚠️ Session token exists in cookies but Better-Auth failed to extract user. This suggests a domain/path configuration issue.');
        }
      }
    }
  } catch (error) {
    console.error('❌ Failed to extract user from session:', {
      error: error instanceof Error ? error.message : error,
      host: req.headers.host,
      origin: req.headers.origin,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
  
  return null;
}

/**
 * Parse cookie string into key-value pairs
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  cookieHeader.split(';').forEach(cookie => {
    const [key, ...valueParts] = cookie.trim().split('=');
    if (key && valueParts.length > 0) {
      cookies[key] = valueParts.join('=');
    }
  });
  
  return cookies;
}

/**
 * Middleware to verify user is authenticated
 */
async function requireAuth(req: AuthenticatedRequest, res: Response, next: Function) {
  const host = req.headers.host || 'unknown';
  const origin = req.headers.origin || 'unknown';
  const hasCookies = !!req.headers.cookie;
  
  console.log('🔐 requireAuth middleware called:', {
    method: req.method,
    path: req.path,
    host,
    origin,
    hasCookies,
    timestamp: new Date().toISOString()
  });

  const user = await getUserFromRequest(req);
  if (!user) {
    console.warn('❌ Authentication failed in requireAuth:', {
      host,
      origin,
      hasCookies,
      path: req.path
    });
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  console.log('✅ Authentication successful in requireAuth:', {
    userId: user.id,
    email: user.email,
    host,
    path: req.path
  });
  
  req.user = user;
  next();
}

/**
 * Middleware to verify user has access to organization
 */
function requireOrganizationAccess(requiredRoles: string[] = PERMISSIONS.VIEW_ORGANIZATION) {
  return async (req: AuthenticatedRequest, res: Response, next: Function) => {
    try {
      const { organizationId } = req.params;
      const user = req.user!;

      const tenantManager = await createTenantContextManager();
      const { hasAccess, role } = await tenantManager.verifyOrganizationAccess(organizationId, user.id);

      if (!hasAccess || !role || !requiredRoles.includes(role)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: requiredRoles,
          current: role || 'none'
        });
      }

      // Set tenant context for this request
      req.tenantContext = {
        organizationId,
        userId: user.id,
        userRole: role
      };

      next();
    } catch (error) {
      console.error('Organization access check failed:', error);
      res.status(500).json({ error: 'Access verification failed' });
    }
  };
}

/**
 * Register all organization API endpoints
 */
export function registerOrganizationAPI(app: Express) {
  const db = getDb();

  // Create new organization
  app.post('/api/organizations',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;
        const { name, description } = req.body;

        // Validate required fields
        if (!name || name.trim().length === 0) {
          return res.status(400).json({ error: 'Organization name is required' });
        }

        if (name.trim().length > 100) {
          return res.status(400).json({ error: 'Organization name must be 100 characters or less' });
        }

        // Auto-derive domain from user's email
        const userEmailDomain = user.email.split('@')[1].toLowerCase();
        
        // List of personal email providers - for these, we'll generate a unique domain
        const personalEmailProviders = new Set([
          'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 
          'icloud.com', 'aol.com', 'protonmail.com', 'mail.com'
        ]);
        
        let organizationDomain: string;
        
        if (personalEmailProviders.has(userEmailDomain)) {
          // For personal email providers, generate domain from org name + random suffix
          const baseDomain = name.toLowerCase()
            .replace(/[^\w\s]/g, '')    // Remove special characters except spaces
            .replace(/\s+/g, '')        // Remove all spaces
            .substring(0, 20);         // Limit length
          
          // Add random suffix to ensure uniqueness
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          organizationDomain = `${baseDomain}-${randomSuffix}.local`;
        } else {
          // Use the email domain for business emails
          organizationDomain = userEmailDomain;
        }
        
        // Generate slug from name
        const slug = name.toLowerCase()
          .replace(/[^\w\s-]/g, '') // Remove special characters
          .replace(/\s+/g, '-')     // Replace spaces with hyphens
          .replace(/-+/g, '-')      // Replace multiple hyphens with single
          .trim();

        // Check if slug is already taken
        if (slug) {
          const existingOrg = await (await getDb())
            .select()
            .from(organization)
            .where(eq(organization.slug, slug))
            .limit(1);

          if (existingOrg.length > 0) {
            return res.status(400).json({ 
              error: 'An organization with this name already exists. Please choose a different name.' 
            });
          }
        }

        // Check if the derived domain is already taken
        const existingDomain = await (await getDb())
          .select()
          .from(organization)
          .where(eq(organization.domain, organizationDomain))
          .limit(1);

        if (existingDomain.length > 0) {
          if (personalEmailProviders.has(userEmailDomain)) {
            // For personal emails with conflict, generate a new random domain
            const baseDomain = name.toLowerCase().replace(/[^\w]/g, '').substring(0, 15);
            const timestamp = Date.now().toString(36);
            organizationDomain = `${baseDomain}-${timestamp}.local`;
          } else {
            // For business emails, suggest joining existing organization
            return res.status(400).json({ 
              error: `An organization with the domain "${organizationDomain}" already exists. You may need to join the existing organization instead of creating a new one.`,
              suggestJoin: true,
              domain: organizationDomain
            });
          }
        }

        const db = await getDb();
        const organizationId = randomUUID();

        // Create organization
        const newOrganization = await db
          .insert(organization)
          .values({
            id: organizationId,
            name: name.trim(),
            slug,
            description: description?.trim() || null,
            domain: organizationDomain,
            createdAt: new Date(),
            metadata: null,
            subscription_tier: 'free',
            settings: {}
          })
          .returning();

        // Add user as owner
        const membership = await db
          .insert(member)
          .values({
            id: randomUUID(),
            organizationId,
            userId: user.id,
            role: ORGANIZATION_ROLES.OWNER,
            createdAt: new Date(),
          })
          .returning();

        console.log(`✅ Created organization "${name}" with owner ${user.email}`);

        res.status(201).json({
          organization: newOrganization[0],
          membership: membership[0],
          message: 'Organization created successfully'
        });
      } catch (error) {
        console.error('Failed to create organization:', error);
        res.status(500).json({ error: 'Failed to create organization' });
      }
    }
  );

  // List organization members
  app.get('/api/organizations/:organizationId/members', 
    requireAuth,
    requireOrganizationAccess(PERMISSIONS.VIEW_MEMBERS),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const tenantManager = await createTenantContextManager();

        // Set tenant context and query members
        const members = await tenantManager.withTenantContext(
          req.tenantContext!,
          async () => {
            const db = await getDb();
            return await db
              .select({
                id: member.id,
                role: member.role,
                createdAt: member.createdAt,
                user: {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  image: user.image,
                }
              })
              .from(member)
              .innerJoin(user, eq(member.userId, user.id))
              .where(eq(member.organizationId, organizationId))
              .orderBy(desc(member.createdAt));
          }
        );

        res.json({ members });
      } catch (error) {
        console.error('Failed to list members:', error);
        res.status(500).json({ error: 'Failed to list organization members' });
      }
    }
  );

  // List organization invitations
  app.get('/api/organizations/:organizationId/invitations',
    requireAuth,
    requireOrganizationAccess(PERMISSIONS.VIEW_MEMBERS),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const tenantManager = await createTenantContextManager();

        const invitations = await tenantManager.withTenantContext(
          req.tenantContext!,
          async () => {
            const db = await getDb();
            return await db
              .select({
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                status: invitation.status,
                createdAt: invitation.createdAt,
                expiresAt: invitation.expiresAt,
                inviter: {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                }
              })
              .from(invitation)
              .innerJoin(user, eq(invitation.inviterId, user.id))
              .where(and(
                eq(invitation.organizationId, organizationId),
                eq(invitation.status, 'pending')
              ))
              .orderBy(desc(invitation.createdAt));
          }
        );

        res.json({ invitations });
      } catch (error) {
        console.error('Failed to list invitations:', error);
        res.status(500).json({ error: 'Failed to list organization invitations' });
      }
    }
  );

  // Invite member to organization
  app.post('/api/organizations/:organizationId/invite',
    requireAuth,
    requireOrganizationAccess(PERMISSIONS.INVITE_MEMBERS),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const { email, role = ORGANIZATION_ROLES.VIEWER } = req.body;
        const user = req.user!;

        if (!email || !email.includes('@')) {
          return res.status(400).json({ error: 'Valid email address required' });
        }

        if (!Object.values(ORGANIZATION_ROLES).includes(role)) {
          return res.status(400).json({ error: 'Invalid role specified' });
        }

        // Check if user is already a member
        const existingMember = await (await getDb())
          .select()
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(and(
            eq(member.organizationId, organizationId),
            eq(user.email, email)
          ))
          .limit(1);

        if (existingMember.length > 0) {
          return res.status(400).json({ error: 'User is already a member of this organization' });
        }

        // Check for existing pending invitation
        const existingInvitation = await (await getDb())
          .select()
          .from(invitation)
          .where(and(
            eq(invitation.organizationId, organizationId),
            eq(invitation.email, email),
            eq(invitation.status, 'pending')
          ))
          .limit(1);

        if (existingInvitation.length > 0) {
          return res.status(400).json({ error: 'Invitation already sent to this email' });
        }

        // Get organization details for email
        const org = await (await getDb())
          .select()
          .from(organization)
          .where(eq(organization.id, organizationId))
          .limit(1);

        if (org.length === 0) {
          return res.status(404).json({ error: 'Organization not found' });
        }

        const tenantManager = await createTenantContextManager();

        // Create invitation
        const invitationId = randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const newInvitation = await tenantManager.withTenantContext(
          req.tenantContext!,
          async () => {
            const db = await getDb();
            return await db
              .insert(invitation)
              .values({
                id: invitationId,
                organizationId,
                email,
                role,
                status: 'pending',
                expiresAt,
                inviterId: user.id,
                token: randomUUID(),
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .returning();
          }
        );

        // Send invitation email
        try {
          await emailService.sendInvitationEmail({
            email,
            organizationName: org[0].name,
            inviterName: user.name,
            inviterEmail: user.email,
            role,
            invitationId,
            invitationUrl: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/accept-invitation/${invitationId}`
          });
        } catch (emailError) {
          console.error('Failed to send invitation email:', emailError);
          // Continue - invitation was created even if email failed
        }

        res.status(201).json({ 
          invitation: newInvitation[0],
          message: 'Invitation sent successfully'
        });
      } catch (error) {
        console.error('Failed to create invitation:', error);
        res.status(500).json({ error: 'Failed to create invitation' });
      }
    }
  );

  // Cancel invitation
  app.delete('/api/invitations/:invitationId',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { invitationId } = req.params;
        const user = req.user!;

        // Get invitation details and verify access
        const invitationDetails = await (await getDb())
          .select({
            invitation: invitation,
            organization: organization,
          })
          .from(invitation)
          .innerJoin(organization, eq(invitation.organizationId, organization.id))
          .where(eq(invitation.id, invitationId))
          .limit(1);

        if (invitationDetails.length === 0) {
          return res.status(404).json({ error: 'Invitation not found' });
        }

        const inv = invitationDetails[0];
        
        // Verify user has permission to cancel this invitation
        const tenantManager = await createTenantContextManager();
        const hasPermission = await tenantManager.hasPermission(
          inv.invitation.organizationId,
          user.id,
          PERMISSIONS.INVITE_MEMBERS
        );

        if (!hasPermission) {
          return res.status(403).json({ error: 'Insufficient permissions to cancel invitation' });
        }

        // Cancel invitation
        await tenantManager.withTenantContext(
          { organizationId: inv.invitation.organizationId, userId: user.id },
          async () => {
            const db = await getDb();
            return await db
              .update(invitation)
              .set({ 
                status: 'cancelled',
                updatedAt: new Date(),
              })
              .where(eq(invitation.id, invitationId));
          }
        );

        res.json({ message: 'Invitation cancelled successfully' });
      } catch (error) {
        console.error('Failed to cancel invitation:', error);
        res.status(500).json({ error: 'Failed to cancel invitation' });
      }
    }
  );

  // Remove member from organization
  app.delete('/api/organizations/:organizationId/members/:memberId',
    requireAuth,
    requireOrganizationAccess(PERMISSIONS.REMOVE_MEMBERS),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId, memberId } = req.params;
        const user = req.user!;

        // Prevent removing self unless they're transferring ownership
        const memberToRemove = await (await getDb())
          .select()
          .from(member)
          .where(eq(member.id, memberId))
          .limit(1);

        if (memberToRemove.length === 0) {
          return res.status(404).json({ error: 'Member not found' });
        }

        if (memberToRemove[0].userId === user.id) {
          return res.status(400).json({ error: 'Cannot remove yourself from organization' });
        }

        // Prevent removing the last owner
        if (memberToRemove[0].role === ORGANIZATION_ROLES.OWNER) {
          const ownerCount = await (await getDb())
            .select()
            .from(member)
            .where(and(
              eq(member.organizationId, organizationId),
              eq(member.role, ORGANIZATION_ROLES.OWNER)
            ));

          if (ownerCount.length <= 1) {
            return res.status(400).json({ error: 'Cannot remove the last owner from organization' });
          }
        }

        const tenantManager = await createTenantContextManager();

        // Remove member
        await tenantManager.withTenantContext(
          req.tenantContext!,
          async () => {
            const db = await getDb();
            return await db
              .delete(member)
              .where(eq(member.id, memberId));
          }
        );

        res.json({ message: 'Member removed successfully' });
      } catch (error) {
        console.error('Failed to remove member:', error);
        res.status(500).json({ error: 'Failed to remove member' });
      }
    }
  );

  // Update member role
  app.patch('/api/organizations/:organizationId/members/:memberId/role',
    requireAuth,
    requireOrganizationAccess(PERMISSIONS.MANAGE_ROLES),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId, memberId } = req.params;
        const { role } = req.body;
        const user = req.user!;

        if (!Object.values(ORGANIZATION_ROLES).includes(role)) {
          return res.status(400).json({ error: 'Invalid role specified' });
        }

        // Get member details
        const memberToUpdate = await (await getDb())
          .select()
          .from(member)
          .where(eq(member.id, memberId))
          .limit(1);

        if (memberToUpdate.length === 0) {
          return res.status(404).json({ error: 'Member not found' });
        }

        // Prevent changing own role
        if (memberToUpdate[0].userId === user.id) {
          return res.status(400).json({ error: 'Cannot change your own role' });
        }

        const tenantManager = await createTenantContextManager();

        // Update member role
        const updatedMember = await tenantManager.withTenantContext(
          req.tenantContext!,
          async () => {
            const db = await getDb();
            return await db
              .update(member)
              .set({ role })
              .where(eq(member.id, memberId))
              .returning();
          }
        );

        res.json({ 
          member: updatedMember[0],
          message: 'Member role updated successfully' 
        });
      } catch (error) {
        console.error('Failed to update member role:', error);
        res.status(500).json({ error: 'Failed to update member role' });
      }
    }
  );

  // Accept invitation
  app.post('/api/invitations/:invitationId/accept',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { invitationId } = req.params;
        const user = req.user!;

        // Get invitation details
        const invitationDetails = await (await getDb())
          .select()
          .from(invitation)
          .where(and(
            eq(invitation.id, invitationId),
            eq(invitation.email, user.email),
            eq(invitation.status, 'pending')
          ))
          .limit(1);

        if (invitationDetails.length === 0) {
          return res.status(404).json({ error: 'Invalid or expired invitation' });
        }

        const inv = invitationDetails[0];

        // Check if invitation is expired
        if (new Date() > inv.expiresAt) {
          return res.status(400).json({ error: 'Invitation has expired' });
        }

        // Check if user is already a member
        const existingMember = await (await getDb())
          .select()
          .from(member)
          .where(and(
            eq(member.organizationId, inv.organizationId),
            eq(member.userId, user.id)
          ))
          .limit(1);

        if (existingMember.length > 0) {
          return res.status(400).json({ error: 'You are already a member of this organization' });
        }

        const tenantManager = await createTenantContextManager();

        // Accept invitation - create membership and update invitation
        await tenantManager.executeAsAdmin(async () => {
          const db = await getDb();
          
          // Create membership
          await db.insert(member).values({
            id: randomUUID(),
            organizationId: inv.organizationId,
            userId: user.id,
            role: inv.role,
            createdAt: new Date(),
          });

          // Update invitation status
          await db
            .update(invitation)
            .set({ 
              status: 'accepted',
              updatedAt: new Date(),
            })
            .where(eq(invitation.id, invitationId));
        });

        res.json({ message: 'Invitation accepted successfully' });
      } catch (error) {
        console.error('Failed to accept invitation:', error);
        res.status(500).json({ error: 'Failed to accept invitation' });
      }
    }
  );

  // Get organization details
  app.get('/api/organizations/:organizationId',
    requireAuth,
    requireOrganizationAccess(PERMISSIONS.VIEW_ORGANIZATION),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const tenantManager = await createTenantContextManager();

        const org = await tenantManager.withTenantContext(
          req.tenantContext!,
          async () => {
            const db = await getDb();
            return await db
              .select()
              .from(organization)
              .where(eq(organization.id, organizationId))
              .limit(1);
          }
        );

        if (org.length === 0) {
          return res.status(404).json({ error: 'Organization not found' });
        }

        res.json({ organization: org[0] });
      } catch (error) {
        console.error('Failed to get organization:', error);
        res.status(500).json({ error: 'Failed to get organization details' });
      }
    }
  );

  // Update organization
  app.patch('/api/organizations/:organizationId',
    requireAuth,
    requireOrganizationAccess(PERMISSIONS.UPDATE_ORGANIZATION),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const { name, domain, description } = req.body;

        if (!name || name.trim().length === 0) {
          return res.status(400).json({ error: 'Organization name is required' });
        }

        const tenantManager = await createTenantContextManager();

        const updatedOrg = await tenantManager.withTenantContext(
          req.tenantContext!,
          async () => {
            const db = await getDb();
            // Only update fields that are provided and handle domain carefully
            const updateData: any = {
              name: name.trim(),
              description: description?.trim() || null,
            };
            
            // Handle domain update - allow clearing domain if explicitly provided
            if (domain !== undefined) {
              updateData.domain = domain.trim() || null;
            }
            
            return await db
              .update(organization)
              .set(updateData)
              .where(eq(organization.id, organizationId))
              .returning();
          }
        );

        res.json({ 
          organization: updatedOrg[0],
          message: 'Organization updated successfully' 
        });
      } catch (error) {
        console.error('Failed to update organization:', error);
        res.status(500).json({ error: 'Failed to update organization' });
      }
    }
  );

  // Delete organization
  app.delete('/api/organizations/:organizationId',
    requireAuth,
    requireOrganizationAccess(PERMISSIONS.DELETE_ORGANIZATION),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const user = req.user!;

        // Check if this is the last organization
        const userOrgs = await (await getDb())
          .select()
          .from(member)
          .where(eq(member.userId, user.id));

        if (userOrgs.length <= 1) {
          return res.status(400).json({ 
            error: 'Cannot delete your last organization',
            details: 'You must be a member of at least one organization'
          });
        }

        // Get all projects in this organization to delete them
        const orgProjects = await (await getDb())
          .select()
          .from(projects)
          .where(eq(projects.organizationId, organizationId));

        const tenantManager = await createTenantContextManager();

        // Delete organization and cascade all related data
        await tenantManager.executeAsAdmin(async () => {
          const db = await getDb();
          
          // Delete all projects first (this will cascade to tables, relationships, etc.)
          for (const project of orgProjects) {
            await db.delete(projects).where(eq(projects.id, project.id));
          }

          // Delete all invitations
          await db.delete(invitation).where(eq(invitation.organizationId, organizationId));

          // Delete all members
          await db.delete(member).where(eq(member.organizationId, organizationId));

          // Finally delete the organization
          await db.delete(organization).where(eq(organization.id, organizationId));
        });

        res.json({ 
          message: 'Organization deleted successfully',
          deletedProjects: orgProjects.length
        });
      } catch (error) {
        console.error('Failed to delete organization:', error);
        res.status(500).json({ error: 'Failed to delete organization' });
      }
    }
  );

  // List user's organizations with full details
  app.get('/api/organizations',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;
        const host = req.headers.host || 'unknown';
        const origin = req.headers.origin || 'unknown';
        const referer = req.headers.referer || 'unknown';
        
        console.log('🔍 Organizations API Request:', {
          userId: user.id,
          email: user.email,
          host,
          origin,
          referer,
          isWWW: host.startsWith('www.'),
          domain: host.replace(/^www\./, ''),
          timestamp: new Date().toISOString()
        });
        
        console.log('🔍 Loading organizations for user:', user.email, 'ID:', user.id, 'from:', host);
        
        const tenantManager = await createTenantContextManager();

        // Get user's organizations with roles and full organization details
        const userOrganizations = await tenantManager.executeAsAdmin(async () => {
          const db = await getDb();
          console.log('🔍 Executing organization query for user ID:', user.id);
          
          const results = await db
            .select({
              orgId: organization.id,
              orgName: organization.name,
              orgDomain: organization.domain,
              orgDescription: organization.description,
              orgCreatedAt: organization.createdAt,
              memberId: member.id,
              memberRole: member.role,
              memberCreatedAt: member.createdAt,
            })
            .from(member)
            .innerJoin(organization, eq(member.organizationId, organization.id))
            .where(eq(member.userId, user.id))
            .orderBy(desc(member.createdAt));
            
          // Transform the flat result into nested structure
          const transformedResults = results.map(row => ({
            organization: {
              id: row.orgId,
              name: row.orgName,
              domain: row.orgDomain,
              description: row.orgDescription,
              createdAt: row.orgCreatedAt,
            },
            membership: {
              id: row.memberId,
              role: row.memberRole,
              createdAt: row.memberCreatedAt,
            }
          }));
            
          console.log('🔍 Database query returned', results.length, 'organizations');
          console.log('🔍 Query results:', results);
          console.log('🔍 Transformed results:', transformedResults);
          
          return transformedResults;
        });

        console.log('✅ Returning organizations:', {
          count: userOrganizations.length,
          orgNames: userOrganizations.map(org => org.organization.name),
          userId: user.id,
          host,
          timestamp: new Date().toISOString()
        });
        
        res.json({ organizations: userOrganizations });
      } catch (error) {
        console.error('❌ Failed to list user organizations:', error);
        res.status(500).json({ error: 'Failed to list organizations' });
      }
    }
  );

  console.log('✅ Organization API endpoints registered');
}

// Extend Request interface for TypeScript
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}