import { Resend } from 'resend';
import { 
  generateCustomInvitationHtml, 
  generateCustomInvitationText, 
  defaultEmailConfig,
  replaceTemplateVariables,
  type EmailTemplateConfig 
} from '../templates/invitationEmailTemplate.ts';

let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export interface InvitationEmailData {
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  token: string;
  expiresAt: Date;
}

export interface EmailServiceConfig {
  fromEmail: string;
  appUrl: string;
  appName: string;
  emailTemplate?: EmailTemplateConfig;
}

export class EmailService {
  private config: EmailServiceConfig;
  private templateConfig: EmailTemplateConfig;

  constructor(config?: Partial<EmailServiceConfig>) {
    this.config = {
      fromEmail: config?.fromEmail || 'onboarding@resend.dev', // Use Resend's default domain
      appUrl: config?.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      appName: config?.appName || process.env.NEXT_PUBLIC_APP_NAME || 'ERDify',
      ...config
    };

    // Merge provided template config with defaults
    this.templateConfig = {
      ...defaultEmailConfig,
      appName: this.config.appName,
      appUrl: this.config.appUrl,
      fromEmail: this.config.fromEmail,
      ...config?.emailTemplate
    };
  }

  /**
   * Send organization invitation email
   */
  async sendInvitationEmail(data: InvitationEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Input validation
      if (!data.email || !data.organizationName || !data.token) {
        return { success: false, error: 'Missing required email data' };
      }

      // Validate API key is configured
      if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your_resend_api_key_here') {
        console.warn('⚠️ Resend API key not configured. Email will be logged instead of sent.');
        return this.logEmail(data);
      }

      const invitationUrl = `${this.config.appUrl}/accept-invitation/${data.token}`;
      const expiryDate = new Date(data.expiresAt).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const templateData = {
        ...data,
        invitationUrl,
        expiryDate,
        appName: this.config.appName,
        appUrl: this.config.appUrl
      };

      const htmlContent = generateCustomInvitationHtml(templateData, this.templateConfig);
      const textContent = generateCustomInvitationText(templateData, this.templateConfig);

      // Generate dynamic subject line
      const subject = replaceTemplateVariables(this.templateConfig.emailSubject, templateData);

      const result = await getResendClient().emails.send({
        from: `${this.templateConfig.fromName || this.config.appName} <${this.config.fromEmail}>`,
        to: [data.email],
        subject,
        html: htmlContent,
        text: textContent
      });

      if (result.error) {
        console.error('❌ Failed to send invitation email:', result.error);
        return { success: false, error: result.error.message };
      }

      console.log(`✅ Invitation email sent to ${data.email}, messageId: ${result.data?.id}`);
      return { success: true, messageId: result.data?.id };

    } catch (error) {
      console.error('❌ Email service error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown email service error' 
      };
    }
  }

  /**
   * Log email instead of sending (for development/testing)
   */
  private logEmail(data: InvitationEmailData): { success: boolean; messageId: string } {
    const invitationUrl = `${this.config.appUrl}/accept-invitation/${data.token}`;
    const expiryDate = new Date(data.expiresAt).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const templateData = {
      ...data,
      invitationUrl,
      expiryDate,
      appName: this.config.appName,
      appUrl: this.config.appUrl
    };

    const subject = replaceTemplateVariables(this.templateConfig.emailSubject, templateData);
    
    console.log('\n📧 ===== EMAIL LOG (RESEND NOT CONFIGURED) =====');
    console.log(`To: ${data.email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Invitation URL: ${invitationUrl}`);
    console.log(`Role: ${data.role}`);
    console.log(`Expires: ${data.expiresAt.toISOString()}`);
    console.log('================================================\n');
    
    return { success: true, messageId: `log-${Date.now()}` };
  }

  /**
   * Update email template configuration
   */
  updateTemplateConfig(updates: Partial<EmailTemplateConfig>): void {
    this.templateConfig = {
      ...this.templateConfig,
      ...updates
    };
  }

  /**
   * Get current template configuration
   */
  getTemplateConfig(): EmailTemplateConfig {
    return { ...this.templateConfig };
  }

  /**
   * Test email service connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your_resend_api_key_here') {
        return { success: false, error: 'Resend API key not configured' };
      }

      // Just check if the API key is valid format
      const isValidFormat = process.env.RESEND_API_KEY.startsWith('re_');
      if (!isValidFormat) {
        return { success: false, error: 'Invalid API key format' };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();

// Email service interface for organization invitations
export interface BetterAuthInvitationData {
  email: string;
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  invitationId: string;
  invitationUrl: string;
}

export async function sendInvitationEmailTemplate(data: BetterAuthInvitationData): Promise<void> {
  // Convert BetterAuth data format to our email service format
  const emailData: InvitationEmailData = {
    email: data.email,
    organizationName: data.organizationName,
    inviterName: data.inviterName,
    role: data.role,
    token: data.invitationId, // BetterAuth uses invitationId as token
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  };

  const result = await emailService.sendInvitationEmail(emailData);
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to send invitation email');
  }
}