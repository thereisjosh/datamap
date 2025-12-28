import React from 'react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Users, Shield, AlertTriangle, Mail, Scale } from 'lucide-react';

const TermsOfService = () => {
  const lastUpdated = "December 28, 2024";

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-blue-600/10 dark:bg-blue-400/10 rounded-full">
              <Scale className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-4xl font-bold text-foreground">Terms of Service</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            These Terms of Service govern your use of DataMap and the services we provide.
            By creating an account or using our service, you agree to these terms.
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Last updated: {lastUpdated}
          </p>
        </div>

        <div className="space-y-8">
          {/* Acceptance of Terms */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                1. Acceptance of Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                By accessing or using DataMap ("the Service"), creating an account, or uploading files, 
                you agree to be bound by these Terms of Service and our Privacy Policy. If you disagree 
                with any part of these terms, you may not use our Service.
              </p>
              <p className="text-muted-foreground">
                These terms apply to all users of the Service, including visitors, registered users, 
                and premium subscribers.
              </p>
            </CardContent>
          </Card>

          {/* Service Description */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                2. Description of Service
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">What DataMap Provides</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Excel data dictionary to Entity Relationship Diagram (ERD) conversion</li>
                  <li>Domain-based table organization and visualization</li>
                  <li>Team collaboration features</li>
                  <li>Project management and file organization</li>
                  <li>Export capabilities for ERD diagrams</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Service Availability</h3>
                <p className="text-muted-foreground">
                  We strive to provide reliable service but do not guarantee 100% uptime. 
                  We may perform maintenance, updates, or improvements that temporarily affect service availability.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* User Accounts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                3. User Accounts and Responsibilities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Creation</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>You must provide accurate and complete information when creating an account</li>
                  <li>You are responsible for maintaining the security of your account credentials</li>
                  <li>You must notify us immediately of any unauthorized use of your account</li>
                  <li>One account per person; shared accounts are not permitted</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Acceptable Use</h3>
                <p className="text-muted-foreground mb-2">You agree not to:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Upload malicious files or attempt to compromise our systems</li>
                  <li>Use the service for illegal activities or violate applicable laws</li>
                  <li>Attempt to reverse engineer or extract our proprietary algorithms</li>
                  <li>Share account credentials or allow unauthorized access</li>
                  <li>Overwhelm our systems with excessive requests or automated tools</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Data and Privacy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                4. Data Processing and Privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Data Processing Agreement</h3>
                <p className="text-muted-foreground">
                  By using our service, you acknowledge and agree that:
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 mt-2">
                  <li>Excel files are processed in browser memory and server RAM only</li>
                  <li>File content is never permanently stored on our systems</li>
                  <li>Only basic metadata (filename, table counts, processing status) is retained</li>
                  <li>Upload metadata is automatically deleted after 30 days</li>
                  <li>Security logs are retained for 3 years for compliance purposes</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Your Data Rights</h3>
                <p className="text-muted-foreground">
                  You retain ownership of your data and can delete your account at any time. 
                  Our detailed Privacy Policy explains your rights under GDPR and other privacy laws.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Intellectual Property */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                5. Intellectual Property
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Your Content</h3>
                <p className="text-muted-foreground">
                  You retain all rights to the data and content you upload. You grant us a limited 
                  license to process your files solely for the purpose of providing the ERD generation service.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Our Service</h3>
                <p className="text-muted-foreground">
                  DataMap, including our algorithms, user interface, and generated ERD outputs, 
                  are protected by intellectual property laws. You may not copy, modify, or 
                  distribute our proprietary technology.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Limitations and Liability */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-blue-600" />
                6. Disclaimers and Limitation of Liability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-yellow-50/50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50">
                <h3 className="font-semibold text-foreground mb-2">Service "As Is"</h3>
                <p className="text-sm text-muted-foreground">
                  DataMap is provided "as is" without warranties of any kind. While we strive for accuracy, 
                  we do not guarantee that generated ERDs are error-free or suitable for all purposes.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Limitation of Liability</h3>
                <p className="text-muted-foreground">
                  To the maximum extent permitted by law, DataMap shall not be liable for any 
                  indirect, incidental, or consequential damages arising from use of our service. 
                  Our total liability is limited to the amount you paid for the service in the 
                  12 months preceding the claim.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Termination */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-blue-600" />
                7. Termination
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Termination by You</h3>
                <p className="text-muted-foreground">
                  You may terminate your account at any time through your account settings. 
                  Upon termination, your data will be deleted in accordance with our Privacy Policy.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Termination by Us</h3>
                <p className="text-muted-foreground">
                  We may suspend or terminate your account if you violate these terms or engage 
                  in harmful activities. We will provide reasonable notice except in cases of 
                  severe violations or legal requirements.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Changes to Terms */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                8. Changes to Terms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                We may update these Terms of Service from time to time. When we make significant changes:
              </p>
              
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>We will update the "Last updated" date at the top of this document</li>
                <li>We will notify active users via email or in-app notification</li>
                <li>Continued use of the service constitutes acceptance of the updated terms</li>
                <li>If you disagree with changes, you may terminate your account</li>
              </ul>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                9. Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                If you have questions about these Terms of Service or need to report violations:
              </p>
              
              <div className="bg-card p-4 rounded-lg border space-y-2">
                <p className="text-sm">
                  <strong className="text-foreground">Email:</strong> joshua.datamap@gmail.com
                </p>
                <p className="text-sm">
                  <strong className="text-foreground">Legal Inquiries:</strong> joshua.datamap@gmail.com
                </p>
                <p className="text-sm text-muted-foreground">
                  We typically respond within 48 hours during business days.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t text-center">
          <p className="text-sm text-muted-foreground">
            These Terms of Service are effective as of {lastUpdated}.<br/>
            By using DataMap, you acknowledge that you have read, understood, and agree to be bound by these terms.
          </p>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;