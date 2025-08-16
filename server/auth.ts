import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { getDb } from "../lib/db.ts";
import { sendInvitationEmailTemplate } from "./services/emailService.ts";

let authInstance: any = null;

// Create auth with lazy database connection
async function getAuth() {
  if (!authInstance) {
    try {
      console.log('🔧 Initializing BetterAuth instance...');
      const db = await getDb();
      
      if (!db) {
        console.warn('⚠️ Database unavailable, creating auth without persistence');
        console.warn('⚠️ Organization plugin features will be limited in in-memory mode');
        // Create auth without database - it will use in-memory storage
        authInstance = betterAuth({
          emailAndPassword: {
            enabled: true,
          },
          user: {
            deleteUser: {
              enabled: true,
            }
          },
          trustedOrigins: ["http://localhost:3000"],
          session: {
            expiresIn: 60 * 60 * 24 * 7, // 7 days
            updateAge: 60 * 60 * 24, // 1 day
          },
          plugins: [
            organization({
              allowUserToCreateOrganization: false, // Prevent personal workspace creation
              requireEmailVerificationOnInvitation: false, // Disable for development
              async sendInvitationEmail(data) {
                console.log('📧 Would send invitation email (in-memory mode):', data);
                // In-memory mode - just log the invitation
                return;
              }
            })
          ],
        });
      } else {
        console.log('✅ Creating auth with database persistence');
        console.log('✅ Organization plugin will have full database support');
        authInstance = betterAuth({
          database: drizzleAdapter(db, {
            provider: "pg", // PostgreSQL
          }),
          emailAndPassword: {
            enabled: true,
          },
          user: {
            deleteUser: {
              enabled: true,
            }
          },
          trustedOrigins: ["http://localhost:3000"],
          session: {
            expiresIn: 60 * 60 * 24 * 7, // 7 days
            updateAge: 60 * 60 * 24, // 1 day
          },
          plugins: [
            organization({
              allowUserToCreateOrganization: false, // Prevent personal workspace creation for invited users
              requireEmailVerificationOnInvitation: false, // Disable for development - enable in production
              async sendInvitationEmail(data) {
                try {
                  console.log('📧 Sending invitation email via BetterAuth plugin');
                  await sendInvitationEmailTemplate({
                    email: data.email,
                    organizationName: data.organization.name,
                    inviterName: data.inviter.user.name,
                    inviterEmail: data.inviter.user.email,
                    role: data.role,
                    invitationId: data.id,
                    invitationUrl: `${process.env.VITE_APP_URL || 'http://localhost:3000'}/accept-invitation/${data.id}`
                  });
                  console.log(`✅ Invitation email sent to ${data.email}`);
                } catch (error) {
                  console.error('❌ Failed to send invitation email:', error);
                  throw error;
                }
              }
            })
          ],
        });
      }
      
      // Log successful initialization
      console.log('✅ BetterAuth instance created successfully with organization plugin support');
      
      // Debug: Log available endpoints
      try {
        console.log('🔍 BetterAuth API object methods:', Object.keys(authInstance.api || {}));
        console.log('🔍 BetterAuth instance methods:', Object.keys(authInstance || {}));
        if (authInstance.api?.organization) {
          console.log('🔍 Organization API methods:', Object.keys(authInstance.api.organization || {}));
        }
      } catch (debugError) {
        console.log('🔍 Could not debug BetterAuth endpoints:', debugError.message);
      }
      
    } catch (error) {
      console.error('❌ Failed to create auth instance:', error);
      throw error;
    }
  }
  
  return authInstance;
}

export { getAuth };
export type Session = any; // Will be properly typed when auth is created