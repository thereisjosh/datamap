import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "../lib/db.ts";

let authInstance: any = null;

// Create auth with lazy database connection
async function getAuth() {
  if (!authInstance) {
    try {
      console.log('🔧 Initializing BetterAuth instance...');
      const db = await getDb();
      
      if (!db) {
        console.warn('⚠️ Database unavailable, creating auth without persistence');
        // Create auth without database - it will use in-memory storage
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined;
        const trustedOrigins = process.env.AUTH_TRUSTED_ORIGINS?.split(',') || ["http://localhost:3000"];
        
        authInstance = betterAuth({
          emailAndPassword: {
            enabled: true,
          },
          user: {
            deleteUser: {
              enabled: true,
            }
          },
          trustedOrigins: trustedOrigins,
          cookies: isProduction ? {
            domain: cookieDomain,
            secure: true,
            sameSite: "lax"
          } : undefined,
          session: {
            expiresIn: 60 * 60 * 24 * 7, // 7 days
            updateAge: 60 * 60 * 24, // 1 day
          },
          plugins: [],
        });
      } else {
        console.log('✅ Creating auth with database persistence');
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined;
        const trustedOrigins = process.env.AUTH_TRUSTED_ORIGINS?.split(',') || ["http://localhost:3000"];
        
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
          trustedOrigins: trustedOrigins,
          cookies: isProduction ? {
            domain: cookieDomain,
            secure: true,
            sameSite: "lax"
          } : undefined,
          session: {
            expiresIn: 60 * 60 * 24 * 7, // 7 days
            updateAge: 60 * 60 * 24, // 1 day
          },
          plugins: [],
        });
      }
      
      console.log('✅ BetterAuth instance created successfully');
      
    } catch (error) {
      console.error('❌ Failed to create auth instance:', error);
      throw error;
    }
  }
  
  return authInstance;
}

export { getAuth };
export type Session = any; // Will be properly typed when auth is created