import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTheme } from '@/contexts/ThemeContext';
import { authClient } from '@/lib/auth.client';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Mail, Crown, Shield, Trash2, UserPlus, ArrowLeft, CreditCard, Clock, RefreshCw, X, UserCog } from 'lucide-react';
import { useLocation } from 'wouter';
import InviteLinkGenerator from '@/components/InviteLinkGenerator';

interface OrganizationSettingsProps {}

const OrganizationSettings = ({}: OrganizationSettingsProps) => {
  const { isDarkMode } = useTheme();
  const [, navigate] = useLocation();
  const { user, activeOrganization, organizations, refreshProfile } = useAuth();
  const { toast } = useToast();
  
  // Form states
  const [orgName, setOrgName] = useState(activeOrganization?.name || '');
  const [orgDomain, setOrgDomain] = useState(activeOrganization?.domain || '');
  const [orgDescription, setOrgDescription] = useState(activeOrganization?.description || '');
  const [inviteEmail, setInviteEmail] = useState('');
  
  // Loading states
  const [isUpdatingOrg, setIsUpdatingOrg] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isDeletingOrg, setIsDeletingOrg] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  
  // Change detection states
  const [originalOrgValues, setOriginalOrgValues] = useState({
    name: activeOrganization?.name || '',
    domain: activeOrganization?.domain || '',
    description: activeOrganization?.description || ''
  });
  const [hasOrgChanges, setHasOrgChanges] = useState(false);

  // Team members state (replacing mock data)
  const [teamMembers, setTeamMembers] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);

  // Get current user's membership in active organization
  const currentMembership = organizations.find(o => o.organization.id === activeOrganization?.id)?.membership;
  const isOwner = currentMembership?.role === 'owner';
  const isAdmin = currentMembership?.role === 'admin' || isOwner;
  
  // Find current user's member entry in the team members list
  const currentUserMember = teamMembers.find(member => member.email === user?.email);

  // Debug: Log role detection for troubleshooting
  if (activeOrganization) {
    console.log('👤 User role in', activeOrganization.name + ':', currentMembership?.role, 
      '(isAdmin:', isAdmin, ', isOwner:', isOwner + ')');
  }

  // Update form state and original values when activeOrganization changes
  useEffect(() => {
    if (activeOrganization) {
      const name = activeOrganization.name || '';
      const domain = activeOrganization.domain || '';
      const description = activeOrganization.description || '';
      
      setOrgName(name);
      setOrgDomain(domain);
      setOrgDescription(description);
      setOriginalOrgValues({
        name,
        domain,
        description
      });
    }
  }, [activeOrganization?.id, activeOrganization?.name, activeOrganization?.domain, activeOrganization?.description]);

  // Detect changes in organization form values
  useEffect(() => {
    const nameChanged = orgName.trim() !== originalOrgValues.name.trim();
    const domainChanged = orgDomain.trim() !== originalOrgValues.domain.trim();
    const descriptionChanged = orgDescription.trim() !== originalOrgValues.description.trim();
    setHasOrgChanges(nameChanged || domainChanged || descriptionChanged);
  }, [orgName, orgDomain, orgDescription, originalOrgValues]);

  // Load team members when component mounts or organization changes
  useEffect(() => {
    const loadTeamMembers = async () => {
      if (!activeOrganization) return;
      
      setIsLoadingMembers(true);
      try {
        console.log('Loading team members for organization:', activeOrganization.id);
        
        // Use custom organization API for member management
        let members = null;
        
        console.log('Loading members using custom API...');
        const response = await fetch(`/api/organizations/${activeOrganization.id}/members`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include session cookies
        });
        
        if (response.ok) {
          const customApiData = await response.json();
          members = customApiData.members || customApiData;
          console.log('Custom API members response:', members);
        } else {
          throw new Error(`Failed to load members: ${response.status}`);
        }
        
        
        // Transform response to match expected format
        const transformedMembers = members?.map(member => ({
          id: member.id,
          name: member.user?.name || member.user?.email || member.name || 'Unknown User',
          email: member.user?.email || member.email || '',
          role: member.role,
          avatar_url: member.user?.image || member.avatar_url || undefined,
          joined_at: member.createdAt || member.joined_at || new Date().toISOString()
        })) || [];
        
        console.log('Transformed members:', transformedMembers);
        setTeamMembers(transformedMembers);
        
      } catch (error) {
        console.error('Failed to load team members:', error);
        toast({
          title: "Failed to load team members",
          description: "Please try refreshing the page.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingMembers(false);
      }
    };

    loadTeamMembers();
  }, [activeOrganization?.id, toast]);

  // Function to load pending invitations
  const loadPendingInvitations = async () => {
    if (!activeOrganization) return;
    
    setIsLoadingInvitations(true);
    try {
      console.log('Loading invitations for organization:', activeOrganization.id);
      
      const response = await fetch(`/api/organizations/${activeOrganization.id}/invitations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        const invitations = data.invitations || data;
        console.log('Custom API invitations response:', invitations);
        
        // Transform response to match expected format
        const transformedInvitations = invitations?.map((invitation: any) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          created_at: invitation.createdAt || invitation.created_at || new Date().toISOString(),
          expires_at: invitation.expiresAt || invitation.expires_at,
          expiresAt: invitation.expiresAt || invitation.expires_at // Keep both formats for compatibility
        })) || [];
        
        console.log('Transformed invitations:', transformedInvitations);
        setPendingInvitations(transformedInvitations);
      } else {
        throw new Error(`Failed to load invitations: ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to load invitations:', error);
      toast({
        title: "Failed to load invitations",
        description: "Please try refreshing the page.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  // Load pending invitations when component mounts or organization changes
  useEffect(() => {
    loadPendingInvitations();
  }, [activeOrganization?.id, toast]);

  const handleUpdateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingOrg(true);
    
    try {
      if (!activeOrganization) {
        throw new Error('No active organization');
      }

      // Call the custom API to update organization
      const response = await fetch(`/api/organizations/${activeOrganization.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: orgName.trim(),
          domain: orgDomain.trim(),
          description: orgDescription.trim()
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update organization');
      }

      const data = await response.json();
      
      // Optimistic update: immediately update original values to match current form values
      setOriginalOrgValues({
        name: orgName.trim(),
        domain: orgDomain.trim(),
        description: orgDescription.trim()
      });
      
      toast({
        title: "Organization Updated",
        description: "Organization details have been updated successfully.",
      });
      
      // Background refresh to ensure data consistency
      await refreshProfile();
      
      // Update local form state with the response data to ensure UI reflects changes
      if (data.organization) {
        setOrgName(data.organization.name);
        setOrgDomain(data.organization.domain || '');
        setOrgDescription(data.organization.description || '');
      }
    } catch (error) {
      console.error('Organization update error:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update organization. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingOrg(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    
    try {
      if (!activeOrganization) {
        throw new Error('No active organization');
      }

      if (!inviteEmail.trim()) {
        toast({
          title: "Email Required",
          description: "Please enter an email address to invite.",
          variant: "destructive",
        });
        return;
      }

      // Send invitation through custom API
      console.log('Sending invitation via custom API:', inviteEmail.trim(), 'member');
      const response = await fetch(`/api/organizations/${activeOrganization.id}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: 'editor'
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invitation');
      }
      
      const data = await response.json();
      console.log('Custom API invitation response:', data);
      
      toast({
        title: "Invitation Sent",
        description: `Invitation sent to ${inviteEmail}`,
      });
      
      setInviteEmail('');
      
      // Refresh pending invitations list
      await loadPendingInvitations();
      
    } catch (error) {
      console.error('Invitation error:', error);
      toast({
        title: "Invitation Failed", 
        description: error instanceof Error ? error.message : "Failed to send invitation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateMemberRole = async (memberId: string, newRole: string, memberName: string) => {
    try {
      if (!activeOrganization) return;

      const response = await fetch(`/api/organizations/${activeOrganization.id}/members/${memberId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update member role');
      }

      const data = await response.json();
      
      toast({
        title: "Role Updated",
        description: `${memberName}'s role has been updated to ${newRole}.`,
      });
      
      // Refresh members list
      const membersResponse = await fetch(`/api/organizations/${activeOrganization.id}/members`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (membersResponse.ok) {
        const membersData = await membersResponse.json();
        const transformedMembers = membersData.members?.map(member => ({
          id: member.id,
          name: member.user?.name || member.user?.email || member.name || 'Unknown User',
          email: member.user?.email || member.email || '',
          role: member.role,
          avatar_url: member.user?.image || member.avatar_url || undefined,
          joined_at: member.createdAt || member.joined_at || new Date().toISOString()
        })) || [];
        setTeamMembers(transformedMembers);
      }
    } catch (error) {
      console.error('Role update error:', error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update member role. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    try {
      if (!activeOrganization) return;

      const response = await fetch(`/api/organizations/${activeOrganization.id}/members/${memberId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove member');
      }
      
      toast({
        title: "Member Removed",
        description: `${memberName} has been removed from the organization.`,
      });
      
      // Remove member from local state
      setTeamMembers(teamMembers.filter(m => m.id !== memberId));
    } catch (error) {
      console.error('Member removal error:', error);
      toast({
        title: "Removal Failed",
        description: error instanceof Error ? error.message : "Failed to remove member. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelInvitation = async (invitationId: string, email: string) => {
    try {
      console.log('Cancelling invitation via custom API:', invitationId);
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel invitation');
      }
      
      const data = await response.json();
      console.log('Custom API cancel invitation response:', data);
      
      toast({
        title: "Invitation Cancelled",
        description: `Invitation to ${email} has been cancelled.`,
      });
      
      // Refresh invitations list
      await loadPendingInvitations();
      
    } catch (error) {
      console.error('Cancel invitation error:', error);
      toast({
        title: "Failed to cancel invitation",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResendInvitation = async (email: string, role: string) => {
    try {
      if (!activeOrganization) return;

      console.log('Resending invitation via custom API:', email, role);
      const response = await fetch(`/api/organizations/${activeOrganization.id}/invitations/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: email,
          role: role
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resend invitation');
      }
      
      const data = await response.json();
      console.log('Custom API resend invitation response:', data);
      
      toast({
        title: "Invitation Resent",
        description: `Invitation resent to ${email}`,
      });
      
      // Refresh invitations list
      await loadPendingInvitations();
      
    } catch (error) {
      console.error('Resend invitation error:', error);
      toast({
        title: "Failed to resend invitation",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteOrganization = async () => {
    setIsDeletingOrg(true);
    
    try {
      if (!activeOrganization) {
        throw new Error('No active organization');
      }

      const response = await fetch(`/api/organizations/${activeOrganization.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete organization');
      }

      const data = await response.json();
      
      toast({
        title: "Organization Deleted",
        description: `${activeOrganization.name} has been deleted successfully.`,
      });
      
      // Refresh profile to update organization list
      await refreshProfile();
      
      // Navigate to projects page
      navigate('/projects');
    } catch (error) {
      console.error('Organization deletion error:', error);
      toast({
        title: "Deletion Failed",
        description: error instanceof Error ? error.message : "Failed to delete organization. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingOrg(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-3 w-3" />;
      case 'admin': return <Shield className="h-3 w-3" />;
      case 'editor': return <UserCog className="h-3 w-3" />;
      case 'viewer': return <Users className="h-3 w-3" />;
      default: return <Users className="h-3 w-3" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'default';
      case 'admin': return 'secondary';
      case 'editor': return 'secondary';
      case 'viewer': return 'outline';
      default: return 'outline';
    }
  };

  if (!activeOrganization) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No active organization selected.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/projects')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Organization Settings</h1>
            <p className="text-muted-foreground">
              Manage {activeOrganization.name} settings and team members
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Organization Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organization Details
              </CardTitle>
              <CardDescription>
                Update your organization information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateOrganization} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input
                      id="org-name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Enter organization name"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-domain">Domain</Label>
                    <Input
                      id="org-domain"
                      value={orgDomain}
                      onChange={(e) => setOrgDomain(e.target.value)}
                      placeholder="Enter domain"
                      disabled={!isOwner}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="org-description">Description</Label>
                  <Textarea
                    id="org-description"
                    value={orgDescription}
                    onChange={(e) => setOrgDescription(e.target.value)}
                    placeholder="Enter organization description"
                    disabled={!isAdmin}
                    rows={3}
                  />
                </div>
                
                {isAdmin && (
                  <div className="flex justify-end">
                    <Button type="submit" disabled={!hasOrgChanges || isUpdatingOrg}>
                      {isUpdatingOrg ? 'Updating...' : 'Update Organization'}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Subscription Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Subscription & Billing
              </CardTitle>
              <CardDescription>
                Manage your subscription and billing information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <h4 className="font-medium">Current Plan</h4>
                  <p className="text-sm text-muted-foreground">
                    You are currently on the {activeOrganization.subscription_tier || 'free'} plan
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">
                  {activeOrganization.subscription_tier || 'free'}
                </Badge>
              </div>
              
              {isOwner && (
                <div className="flex gap-2">
                  <Button variant="outline">Manage Billing</Button>
                  <Button>Upgrade Plan</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                Manage your organization team members and permissions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Invite Member */}
              {isAdmin && (
                <div>
                  <h4 className="text-sm font-medium mb-3">Invite New Member</h4>
                  <form onSubmit={handleInviteMember} className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Enter email address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="submit" disabled={isInviting} className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      {isInviting ? 'Inviting...' : 'Invite'}
                    </Button>
                  </form>
                </div>
              )}

              <Separator />

              {/* Pending Invitations */}
              {isAdmin && (
                <div>
                  <h4 className="text-sm font-medium mb-3">
                    Pending Invitations ({isLoadingInvitations ? '...' : pendingInvitations.length})
                  </h4>
                  
                  {isLoadingInvitations ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg animate-pulse">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-muted rounded-full"></div>
                            <div>
                              <div className="h-4 w-32 bg-muted rounded mb-1"></div>
                              <div className="h-3 w-24 bg-muted rounded"></div>
                            </div>
                          </div>
                          <div className="h-6 w-20 bg-muted rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : pendingInvitations.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {pendingInvitations.map((invitation) => (
                        <div key={invitation.id} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="bg-orange-100 dark:bg-orange-900 p-2 rounded-full">
                              <Clock className="h-4 w-4 text-orange-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{invitation.email}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Role: {invitation.role}</span>
                                <span>•</span>
                                <span>Expires: {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-orange-600 border-orange-300">
                              Pending
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResendInvitation(invitation.email, invitation.role)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Resend invitation"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Cancel invitation"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to cancel the invitation to {invitation.email}?
                                    They will no longer be able to accept this invitation.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Keep Invitation</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Cancel Invitation
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 mb-4">
                      <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No pending invitations</p>
                    </div>
                  )}
                  
                  {pendingInvitations.length > 0 && <Separator />}
                </div>
              )}

              {/* Members List */}
              <div>
                <h4 className="text-sm font-medium mb-3">
                  Current Members ({isLoadingMembers ? '...' : teamMembers.length})
                </h4>
                <div className="space-y-3">
                  {isLoadingMembers ? (
                    // Loading skeleton
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg animate-pulse">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-muted rounded-full"></div>
                            <div>
                              <div className="h-4 w-24 bg-muted rounded mb-1"></div>
                              <div className="h-3 w-32 bg-muted rounded"></div>
                            </div>
                          </div>
                          <div className="h-6 w-16 bg-muted rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : teamMembers.length > 0 ? (
                    teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback>
                            {member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Joined {new Date(member.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdmin && member.role !== 'owner' && member.id !== currentUserMember?.id ? (
                          <Select
                            value={member.role}
                            onValueChange={(newRole) => handleUpdateMemberRole(member.id, newRole, member.name)}
                          >
                            <SelectTrigger className="w-[120px] h-8">
                              <SelectValue>
                                <div className="flex items-center gap-1">
                                  {getRoleIcon(member.role)}
                                  <span className="capitalize">{member.role}</span>
                                </div>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">
                                <div className="flex items-center gap-2">
                                  {getRoleIcon('viewer')}
                                  <span>Viewer</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="editor">
                                <div className="flex items-center gap-2">
                                  {getRoleIcon('editor')}
                                  <span>Editor</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="admin">
                                <div className="flex items-center gap-2">
                                  {getRoleIcon('admin')}
                                  <span>Admin</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge 
                            variant={getRoleBadgeVariant(member.role)}
                            className="flex items-center gap-1 capitalize"
                          >
                            {getRoleIcon(member.role)}
                            {member.role}
                          </Badge>
                        )}
                        {isAdmin && member.role !== 'owner' && member.id !== currentUserMember?.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove {member.name} from the organization?
                                  They will lose access to all projects and data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveMember(member.id, member.name)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove Member
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))
                  ) : (
                    // Empty state
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No team members found.</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          {isAdmin && (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible and destructive actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Delete Organization</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Permanently delete this organization and all associated projects, data, and team members.
                      This action cannot be undone.
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          Delete Organization
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the organization
                            "{activeOrganization.name}", all projects, and remove all team members.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteOrganization}
                            disabled={isDeletingOrg}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isDeletingOrg ? 'Deleting...' : 'Delete Organization'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invitation Links Management */}
          <InviteLinkGenerator
            organizationId={activeOrganization.id}
            organizationName={activeOrganization.name}
            isAdmin={isAdmin}
          />
        </div>
      </main>
    </div>
  );
};

export default OrganizationSettings;