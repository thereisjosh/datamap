import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useAuth } from '@/components/auth/AuthProvider';
import { authClient } from '@/lib/auth.client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Mail, Building2, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InvitationData {
  email: string;
  organizationId: string;
  organizationName?: string;
  role: string;
}

interface AcceptInvitationProps {
  isDarkMode?: boolean;
}

const AcceptInvitation = ({ isDarkMode = false }: AcceptInvitationProps) => {
  const [, params] = useRoute('/accept-invitation/:token');
  const { user, signIn, signUp, signOut } = useAuth();
  const { toast } = useToast();
  const token = params?.token;
  
  // State management
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Form state for new user registration
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  
  // Load invitation data using BetterAuth APIs
  useEffect(() => {
    const loadInvitation = async () => {
      if (!token) {
        setError('Invalid invitation link');
        setLoading(false);
        return;
      }

      try {
        // Use custom API to get invitation details
        const response = await fetch(`/api/invitations/${token}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Invalid invitation');
        }

        const data = await response.json();

        setInvitation({
          email: data.email,
          organizationId: data.organizationId,
          organizationName: data.organizationName,
          role: data.role
        });
        setEmail(data.email);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invitation');
      } finally {
        setLoading(false);
      }
    };

    loadInvitation();
  }, [token]);

  // Handle invitation acceptance for existing user using BetterAuth
  const handleAcceptForExistingUser = async () => {
    if (!user || !invitation || !token) return;
    
    setAccepting(true);
    try {
      // Use custom API to accept invitation
      const response = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to accept invitation');
      }

      const data = await response.json();
      
      setSuccess(true);
      toast({
        title: "Invitation Accepted!",
        description: `You've been added to ${invitation.organizationName || 'the organization'}.`,
      });
      
      // Redirect to organization dashboard after a delay
      setTimeout(() => {
        window.location.href = '/projects';
      }, 2000);
      
    } catch (err) {
      toast({
        title: "Failed to accept invitation",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  };

  // Handle new user registration and invitation acceptance using BetterAuth
  const handleRegisterAndAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!invitation || !token) return;
    
    // Validation
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are identical.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setAccepting(true);
    try {
      // Register new user first - custom API handles invitation context
      await signUp(
        email.trim(),
        password,
        name.trim() || email.split('@')[0]
      );
      
      // Accept the invitation using custom API after registration  
      const response = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.warn('Failed to accept invitation after registration:', errorData.error);
        // Still show success for user registration, but log the invitation issue
      }
      
      setSuccess(true);
      toast({
        title: "Account Created!",
        description: `Welcome! You've been added to ${invitation.organizationName || 'the organization'}.`,
      });
      
      // Redirect to organization dashboard
      setTimeout(() => {
        window.location.href = '/projects';
      }, 2000);
      
    } catch (err) {
      toast({
        title: "Registration Failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className={`min-h-screen bg-background flex items-center justify-center ${isDarkMode ? 'dark' : ''}`}>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className={`min-h-screen bg-background flex items-center justify-center ${isDarkMode ? 'dark' : ''}`}>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle className="text-destructive">Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              onClick={() => window.location.href = '/'}
              variant="outline"
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render success state
  if (success) {
    return (
      <div className={`min-h-screen bg-background flex items-center justify-center ${isDarkMode ? 'dark' : ''}`}>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-green-500">Invitation Accepted!</CardTitle>
            <CardDescription>
              You've successfully joined {invitation?.organizationName || 'the organization'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Redirecting to dashboard...
            </p>
            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  return (
    <div className={`min-h-screen bg-background flex items-center justify-center p-4 ${isDarkMode ? 'dark' : ''}`}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle>You're Invited!</CardTitle>
          <CardDescription>
            Join {invitation.organizationName || 'an organization'} on ERDify
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {invitation.organizationName || 'Organization'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Role: <span className="font-medium capitalize">{invitation.role}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{invitation.email}</span>
            </div>
          </div>

          {/* User is already logged in */}
          {user ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  You're currently logged in as <strong>{user.email}</strong>
                  {user.email === invitation.email ? (
                    <span className="text-green-600 block">✓ Email matches invitation</span>
                  ) : (
                    <span className="text-orange-600 block">⚠ Email doesn't match invitation email</span>
                  )}
                </AlertDescription>
              </Alert>
              
              {user.email === invitation.email ? (
                <Button 
                  onClick={handleAcceptForExistingUser}
                  disabled={accepting}
                  className="w-full"
                >
                  {accepting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Accepting...
                    </>
                  ) : (
                    'Accept Invitation'
                  )}
                </Button>
              ) : (
                <div className="space-y-3">
                  <Alert>
                    <AlertDescription>
                      This invitation is for <strong>{invitation.email}</strong>, but you're logged in as <strong>{user.email}</strong>.
                      You need to sign out and create an account with the invited email address.
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={async () => {
                        await signOut();
                        // After sign out, the component will re-render and show the registration form
                      }}
                      className="flex-1"
                    >
                      Sign Out & Register
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => window.history.back()}
                      className="flex-1"
                    >
                      Go Back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* User needs to register/login */
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  To accept this invitation, please create an account with the invited email address.
                </AlertDescription>
              </Alert>
              
              <form onSubmit={handleRegisterAndAccept} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email is pre-filled from invitation
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              
              <Button 
                type="submit" 
                disabled={accepting}
                className="w-full"
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating Account...
                  </>
                ) : (
                  'Create Account & Join'
                )}
              </Button>
            </form>
            </div>
          )}

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              By accepting this invitation, you agree to ERDify's terms of service
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvitation;