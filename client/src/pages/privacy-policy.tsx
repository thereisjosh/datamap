import React from 'react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, FileText, Clock, Trash2, Eye, Mail } from 'lucide-react';

const PrivacyPolicy = () => {
  const lastUpdated = "December 27, 2024";

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-blue-600/10 dark:bg-blue-400/10 rounded-full">
              <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            DataMap is committed to protecting your privacy and ensuring transparent data practices.
            This policy explains how we collect, use, and protect your information.
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Last updated: {lastUpdated}
          </p>
        </div>

        <div className="space-y-8">
          {/* Data Collection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                1. What Information We Collect
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Information</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Email address (required for account creation)</li>
                  <li>Name and profile information (optional)</li>
                  <li>Organization membership and role information</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Upload Metadata Only</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li><strong>Filename</strong> of uploaded Excel files</li>
                  <li><strong>Table count</strong> and relationship count from processed files</li>
                  <li><strong>Processing status</strong> (completed, failed, in progress)</li>
                  <li><strong>Error messages</strong> if processing fails</li>
                  <li><strong>Upload timestamp</strong> for session management</li>
                </ul>
              </div>

              <div className="p-4 bg-green-50/50 dark:bg-green-900/20 rounded-lg border border-green-200/50 dark:border-green-800/50">
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                  ✅ <strong>What We DON'T Collect:</strong> We never store your actual Excel file content, 
                  schema data, table structures, column names, or any sensitive database information.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Processing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-600" />
                2. How We Process Your Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Browser-Only Processing</h3>
                <p className="text-muted-foreground">
                  Excel files are processed entirely in your browser's memory (RAM). Files are never saved 
                  to our servers or any persistent storage. Processing happens locally on our servers but 
                  content is immediately discarded after generating your ERD visualization.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Legal Basis for Processing</h3>
                <p className="text-muted-foreground">
                  We process your data based on <strong>legitimate interest</strong> (GDPR Article 6(1)(f)) 
                  to provide our ERD generation service. When you create an account and use DataMap, 
                  this processing is necessary for service functionality and reasonably expected by users.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Retention */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                3. Data Retention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Upload Session Data</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Upload metadata is automatically deleted after <strong>30 days</strong> for privacy compliance</li>
                  <li>Daily automated cleanup removes old session data</li>
                  <li>You can request immediate deletion through account deletion</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Data</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Account information is retained until you delete your account</li>
                  <li>Organization data is retained for active team collaboration</li>
                  <li>Security audit logs are automatically deleted after <strong>3 years</strong> for compliance</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* User Rights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-blue-600" />
                4. Your Rights (GDPR)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Right to Access</h3>
                  <p className="text-sm text-muted-foreground">
                    View your account information and download your data through your profile settings.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Right to Delete</h3>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete your account and all associated data from your profile settings.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Right to Portability</h3>
                  <p className="text-sm text-muted-foreground">
                    Export your ERD projects and metadata in standard formats.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Right to Object</h3>
                  <p className="text-sm text-muted-foreground">
                    Object to processing by deleting your account or contacting us directly.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                5. Security Measures
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Technical Safeguards</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li><strong>Encryption:</strong> All data in transit and at rest is encrypted</li>
                  <li><strong>Authentication:</strong> Secure session management with secure cookies</li>
                  <li><strong>Access Control:</strong> Row-level security and multi-tenant architecture</li>
                  <li><strong>Audit Logging:</strong> Comprehensive security event tracking</li>
                  <li><strong>Rate Limiting:</strong> Protection against abuse and DDoS attacks</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Compliance</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li><strong>GDPR compliant</strong> data processing and user rights</li>
                  <li><strong>SOC2 aligned</strong> security controls and monitoring</li>
                  <li><strong>Regular security audits</strong> and vulnerability assessments</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                6. Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Data Protection Inquiries</h3>
                <p className="text-muted-foreground mb-4">
                  For questions about this privacy policy, to exercise your rights, or to report privacy concerns:
                </p>
                
                <div className="bg-card p-4 rounded-lg border space-y-2">
                  <p className="text-sm">
                    <strong className="text-foreground">Email:</strong> joshua.datamap@gmail.com
                  </p>
                  <p className="text-sm">
                    <strong className="text-foreground">Response Time:</strong> We will respond within 72 hours
                  </p>
                  <p className="text-sm text-muted-foreground">
                    For urgent security matters, please include "URGENT" in your subject line.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Updates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                7. Policy Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                We may update this privacy policy from time to time. When we do:
              </p>
              
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>We will update the "Last updated" date at the top of this policy</li>
                <li>For significant changes, we will notify you via email or in-app notification</li>
                <li>Your continued use of DataMap after changes indicates acceptance</li>
                <li>You can view the change history in our public repository</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t text-center">
          <p className="text-sm text-muted-foreground">
            This privacy policy is effective as of {lastUpdated}.<br/>
            DataMap is committed to transparency and protecting your privacy rights.
          </p>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;