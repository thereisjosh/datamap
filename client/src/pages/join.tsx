import React, { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTheme } from '@/contexts/ThemeContext';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Link, Users, CheckCircle, AlertCircle, Loader2, Building2 } from 'lucide-react';

interface JoinPageProps {}

interface InvitationDetails {
  organizationId: string;
  organizationName: string;
  role: string;
  description: string;
}

const JoinPage: React.FC<JoinPageProps> = ({}) => {
  const { isDarkMode } = useTheme();
  const [, params] = useRoute('/join/:token');
  const [, navigate] = useLocation();
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  
  const token = params?.token;

  // Load invitation details when component mounts
  useEffect(() => {
    const loadInvitationDetails = async () => {
      if (!token) {
        setError('Invalid invitation link');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/invitation-links/${token}`);
        
        if (response.ok) {
          const invitationData = await response.json();
          setInvitation(invitationData);
          setError('');
        } else {
          const errorData = await response.json();
          setError(errorData.error || 'Invalid invitation link');
        }
      } catch (error) {
        console.error('Error loading invitation:', error);
        setError('Failed to load invitation details');
      } finally {
        setLoading(false);
      }
    };

    loadInvitationDetails();
  }, [token]);

  // Handle accepting the invitation
  const handleAcceptInvitation = async () => {
    if (!user || !invitation || !token) return;
    
    setAccepting(true);
    try {
      const response = await fetch(`/api/invitation-links/${token}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        setSuccess(true);
        
        // Refresh user profile to get updated organizations
        await refreshProfile();
        
        toast({
          title: "Welcome!",
          description: `You've successfully joined ${invitation.organizationName} as ${invitation.role}!`
        });

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to accept invitation');
        toast({
          title: "Error",
          description: errorData.error || 'Failed to accept invitation',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setError('Failed to accept invitation');
      toast({
        title: "Error",
        description: 'Failed to accept invitation. Please try again.',
        variant: "destructive"
      });
    } finally {
      setAccepting(false);
    }
  };

  // Handle creating a new account if needed
  const handleCreateAccount = () => {
    // Store the invitation token in localStorage to redirect back after signup
    localStorage.setItem('pendingInvitationToken', token || '');
    navigate('/auth/signup');
  };

  // Handle signing in if needed
  const handleSignIn = () => {
    // Store the invitation token in localStorage to redirect back after signin
    localStorage.setItem('pendingInvitationToken', token || '');
    navigate('/auth/signin');
  };

  // Check for pending invitation token after authentication
  useEffect(() => {
    const pendingToken = localStorage.getItem('pendingInvitationToken');
    if (pendingToken && user && pendingToken === token) {
      localStorage.removeItem('pendingInvitationToken');
      // User just authenticated with this invitation, no need to reload invitation details
    }
  }, [user, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="text-muted-foreground">Loading invitation details...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Invalid Invitation</CardTitle>
              <CardDescription>
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => navigate('/dashboard')} variant="outline">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Welcome to {invitation?.organizationName}!</CardTitle>
              <CardDescription>
                You've successfully joined the organization as {invitation?.role}.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Redirecting you to the dashboard...
              </p>
              <Button onClick={() => navigate('/dashboard')}>
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Link className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Join {invitation?.organizationName}</CardTitle>
              <CardDescription>
                You've been invited to join this organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold">{invitation?.organizationName}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {invitation?.role} role
                  </Badge>
                  {invitation?.description && (
                    <p className="text-sm text-muted-foreground">{invitation.description}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-center text-sm text-muted-foreground">
                  To join this organization, please sign in or create an account
                </p>
                
                <div className="grid gap-3">
                  <Button onClick={handleSignIn} className="w-full">
                    Sign In to Join
                  </Button>
                  <Button onClick={handleCreateAccount} variant="outline" className="w-full">
                    Create Account & Join
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // User is authenticated, show the invitation acceptance page
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Link className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Join {invitation?.organizationName}</CardTitle>
            <CardDescription>
              You've been invited to join this organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold">{invitation?.organizationName}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  {invitation?.role} role
                </Badge>
                {invitation?.description && (
                  <p className="text-sm text-muted-foreground">{invitation.description}</p>
                )}
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm">What you'll get:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Access to {invitation?.organizationName}'s projects and ERD diagrams</li>
                  <li>• Collaborate on data modeling and database design</li>
                  <li>• Share insights and contribute to team projects</li>
                  {invitation?.role === 'admin' && (
                    <li>• Administrative privileges to manage the organization</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Signed in as {user.email}
              </p>
              
              <Button 
                onClick={handleAcceptInvitation} 
                disabled={accepting}
                className="w-full"
              >
                {accepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Accept Invitation
                  </>
                )}
              </Button>
              
              <div className="text-center">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate('/dashboard')}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default JoinPage;