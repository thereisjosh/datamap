/**
 * Email Template Configuration for Invitation Emails
 * Customize the appearance and content of invitation emails sent to users
 */

export interface EmailTemplateConfig {
  // Branding
  appName: string;
  appUrl: string;
  logoUrl?: string;
  
  // Colors and Styling
  primaryColor: string;
  headerBackgroundColor: string;
  buttonColor: string;
  textColor: string;
  backgroundColor: string;
  
  // Content
  emailSubject: string;
  welcomeMessage: string;
  callToActionText: string;
  benefitsList: string[];
  footerText: string;
  
  // Personalization
  fromEmail: string;
  fromName: string;
  supportEmail?: string;
}

export const defaultEmailConfig: EmailTemplateConfig = {
  // Branding
  appName: 'ERDBuilder',
  appUrl: 'http://localhost:3000',
  
  // Colors and Styling (Tailwind-compatible)
  primaryColor: '#2563eb',      // Blue-600
  headerBackgroundColor: '#2563eb',
  buttonColor: '#2563eb',
  textColor: '#333333',
  backgroundColor: '#f7f7f7',
  
  // Content
  emailSubject: 'You\'re invited to join {organizationName} on {appName}',
  welcomeMessage: 'You\'re invited to join an organization!',
  callToActionText: 'Accept Invitation',
  benefitsList: [
    'Access {organizationName}\'s projects and ERD diagrams',
    'Collaborate on data modeling and database design',
    'Share insights and contribute to team projects'
  ],
  footerText: 'This email was sent from {appName}. Visit us at {appUrl}',
  
  // Personalization  
  fromEmail: 'onboarding@resend.dev', // Resend's default domain for development
  fromName: 'ERDBuilder Team'
};

export interface InvitationTemplateData {
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  token: string;
  expiresAt: Date;
  invitationUrl: string;
  expiryDate: string;
}

/**
 * Replace template variables with actual values
 */
export function replaceTemplateVariables(template: string, data: InvitationTemplateData & { appName: string; appUrl: string }): string {
  return template
    .replace(/\{organizationName\}/g, data.organizationName)
    .replace(/\{inviterName\}/g, data.inviterName)
    .replace(/\{role\}/g, data.role)
    .replace(/\{appName\}/g, data.appName)
    .replace(/\{appUrl\}/g, data.appUrl)
    .replace(/\{invitationUrl\}/g, data.invitationUrl)
    .replace(/\{expiryDate\}/g, data.expiryDate);
}

/**
 * Generate HTML email template with configuration
 */
export function generateCustomInvitationHtml(
  data: InvitationTemplateData & { appName: string; appUrl: string },
  config: EmailTemplateConfig = defaultEmailConfig
): string {
  const processedBenefits = config.benefitsList.map(benefit => 
    replaceTemplateVariables(benefit, data)
  ).map(benefit => `<li>${benefit}</li>`).join('\n                ');

  const processedFooter = replaceTemplateVariables(config.footerText, data);
  const processedWelcome = replaceTemplateVariables(config.welcomeMessage, data);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're invited to ${data.organizationName}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
            line-height: 1.6; 
            color: ${config.textColor}; 
            margin: 0; 
            padding: 0; 
            background-color: ${config.backgroundColor}; 
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #ffffff; 
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header { 
            background-color: ${config.headerBackgroundColor}; 
            padding: 40px 40px 30px; 
            text-align: center; 
        }
        .header h1 { 
            color: #ffffff; 
            margin: 0; 
            font-size: 28px; 
            font-weight: 600; 
            letter-spacing: -0.5px;
        }
        .logo {
            max-width: 150px;
            height: auto;
            margin-bottom: 10px;
        }
        .content { 
            padding: 40px; 
        }
        .welcome-message {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
            color: ${config.textColor};
        }
        .invitation-box { 
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border: 2px solid #e2e8f0; 
            border-radius: 12px; 
            padding: 32px 24px; 
            margin: 32px 0; 
            text-align: center; 
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .organization-name { 
            font-size: 24px; 
            font-weight: 700; 
            color: ${config.primaryColor}; 
            margin-bottom: 12px; 
        }
        .role-badge { 
            display: inline-block; 
            background-color: rgba(37, 99, 235, 0.1); 
            color: ${config.primaryColor}; 
            padding: 8px 16px; 
            border-radius: 20px; 
            font-size: 14px; 
            font-weight: 600; 
            margin: 12px 0; 
            border: 1px solid rgba(37, 99, 235, 0.2);
        }
        .cta-button { 
            display: inline-block; 
            background: linear-gradient(135deg, ${config.buttonColor} 0%, #1d4ed8 100%);
            color: #ffffff; 
            text-decoration: none; 
            padding: 16px 40px; 
            border-radius: 8px; 
            font-weight: 600; 
            font-size: 16px;
            margin: 24px 0; 
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }
        .cta-button:hover { 
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
        }
        .expiry-notice { 
            color: #6b7280; 
            font-size: 14px; 
            margin-top: 20px; 
            font-style: italic;
        }
        .benefits {
            background-color: #f8fafc;
            padding: 24px;
            border-radius: 8px;
            margin: 24px 0;
        }
        .benefits h3 {
            margin-top: 0;
            margin-bottom: 16px;
            color: ${config.textColor};
            font-size: 18px;
        }
        .benefits ul {
            margin: 0;
            padding-left: 20px;
        }
        .benefits li {
            margin-bottom: 8px;
            color: #4b5563;
        }
        .footer { 
            background-color: #f8fafc; 
            padding: 32px 40px; 
            border-top: 1px solid #e5e7eb; 
            color: #6b7280; 
            font-size: 14px; 
            text-align: center; 
            line-height: 1.5;
        }
        .footer a {
            color: ${config.primaryColor};
            text-decoration: none;
        }
        .divider { 
            height: 1px; 
            background: linear-gradient(90deg, transparent 0%, #e5e7eb 50%, transparent 100%); 
            margin: 32px 0; 
        }
        .disclaimer {
            font-size: 12px;
            color: #9ca3af;
            margin-top: 24px;
            line-height: 1.4;
        }
        
        /* Responsive Design */
        @media (max-width: 600px) {
            .container { margin: 0 10px; }
            .content { padding: 24px; }
            .header { padding: 24px; }
            .cta-button { padding: 14px 28px; font-size: 15px; }
            .welcome-message { font-size: 20px; }
            .organization-name { font-size: 20px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            ${config.logoUrl ? `<img src="${config.logoUrl}" alt="${config.appName}" class="logo">` : ''}
            <h1>${data.appName}</h1>
        </div>
        
        <div class="content">
            <div class="welcome-message">${processedWelcome}</div>
            
            <p>Hi there,</p>
            
            <p><strong>${data.inviterName}</strong> has invited you to join their organization on ${data.appName}.</p>
            
            <div class="invitation-box">
                <div class="organization-name">${data.organizationName}</div>
                <div class="role-badge">Role: ${data.role}</div>
                
                <a href="${data.invitationUrl}" class="cta-button">${config.callToActionText}</a>
                
                <div class="expiry-notice">
                    This invitation expires on ${data.expiryDate}
                </div>
            </div>
            
            <div class="benefits">
                <h3>By accepting this invitation, you'll be able to:</h3>
                <ul>
                    ${processedBenefits}
                </ul>
            </div>
            
            <div class="divider"></div>
            
            <div class="disclaimer">
                <p>If you weren't expecting this invitation or believe it was sent in error, you can safely ignore this email. The invitation will expire automatically.</p>
                
                <p>If you're having trouble with the button above, copy and paste the following link into your web browser:<br>
                <a href="${data.invitationUrl}" style="color: ${config.primaryColor};">${data.invitationUrl}</a></p>
            </div>
        </div>
        
        <div class="footer">
            <p>${processedFooter}</p>
            ${config.supportEmail ? `<p>Need help? Contact us at <a href="mailto:${config.supportEmail}">${config.supportEmail}</a></p>` : ''}
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate plain text email template with configuration
 */
export function generateCustomInvitationText(
  data: InvitationTemplateData & { appName: string; appUrl: string },
  config: EmailTemplateConfig = defaultEmailConfig
): string {
  const processedBenefits = config.benefitsList
    .map(benefit => replaceTemplateVariables(benefit, data))
    .map(benefit => `- ${benefit}`)
    .join('\n');

  const processedFooter = replaceTemplateVariables(config.footerText, data);
  const processedWelcome = replaceTemplateVariables(config.welcomeMessage, data);

  return `
${processedWelcome}

Hi there,

${data.inviterName} has invited you to join their organization on ${data.appName}.

Organization: ${data.organizationName}
Role: ${data.role}
Expires: ${data.expiryDate}

To accept this invitation, visit:
${data.invitationUrl}

By accepting this invitation, you'll be able to:
${processedBenefits}

If you weren't expecting this invitation or believe it was sent in error, you can safely ignore this email. The invitation will expire automatically.

${config.supportEmail ? `Need help? Contact us at ${config.supportEmail}` : ''}

--
${processedFooter}
`.trim();
}