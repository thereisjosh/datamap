import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Link, Copy, Trash2, Users, Clock, BarChart3, RefreshCw, Eye, EyeOff } from 'lucide-react';

interface InvitationLink {
  id: string;
  organizationId: string;
  role: 'viewer' | 'editor' | 'admin';
  token: string;
  maxUses: number | null;
  currentUses: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
  description: string;
}

interface InviteLinkGeneratorProps {
  organizationId: string;
  organizationName: string;
  isAdmin: boolean;
  className?: string;
}

const InviteLinkGenerator: React.FC<InviteLinkGeneratorProps> = ({
  organizationId,
  organizationName,
  isAdmin,
  className = ''
}) => {
  const { toast } = useToast();
  
  // Form state
  const [selectedRole, setSelectedRole] = useState<'viewer' | 'editor' | 'admin'>('editor');
  const [maxUses, setMaxUses] = useState<string>('10');
  const [expiryDays, setExpiryDays] = useState<string>('30');
  const [description, setDescription] = useState<string>('');
  const [isUnlimitedUses, setIsUnlimitedUses] = useState<boolean>(false);
  const [neverExpires, setNeverExpires] = useState<boolean>(false);
  
  // Data state
  const [invitationLinks, setInvitationLinks] = useState<InvitationLink[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  
  // UI state
  const [showInactiveLinks, setShowInactiveLinks] = useState<boolean>(false);

  // Load existing invitation links
  useEffect(() => {
    loadInvitationLinks();
  }, [organizationId]);

  const loadInvitationLinks = async () => {
    if (!isAdmin) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitation-links`);
      if (response.ok) {
        const links = await response.json();
        setInvitationLinks(links);
      } else {
        throw new Error('Failed to load invitation links');
      }
    } catch (error) {
      console.error('Error loading invitation links:', error);
      toast({
        title: "Error",
        description: "Failed to load invitation links. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateInvitationLink = async () => {
    setIsGenerating(true);
    try {
      const payload = {
        role: selectedRole,
        maxUses: isUnlimitedUses ? null : parseInt(maxUses),
        expiryDays: neverExpires ? null : parseInt(expiryDays),
        description: description.trim() || `${selectedRole} invitation`
      };

      const response = await fetch(`/api/organizations/${organizationId}/invitation-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const newLink = await response.json();
        setInvitationLinks(prev => [newLink, ...prev]);
        
        // Reset form
        setDescription('');
        setMaxUses('10');
        setExpiryDays('30');
        setIsUnlimitedUses(false);
        setNeverExpires(false);
        
        toast({
          title: "Success",
          description: "Invitation link generated successfully!"
        });
      } else {
        throw new Error('Failed to generate invitation link');
      }
    } catch (error) {
      console.error('Error generating invitation link:', error);
      toast({
        title: "Error",
        description: "Failed to generate invitation link. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: "Copied!",
        description: "Invitation link copied to clipboard."
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: "Error",
        description: "Failed to copy link. Please select and copy manually.",
        variant: "destructive"
      });
    }
  };

  const toggleLinkStatus = async (linkId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitation-links/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });

      if (response.ok) {
        setInvitationLinks(prev =>
          prev.map(link =>
            link.id === linkId ? { ...link, isActive: !currentStatus } : link
          )
        );
        
        toast({
          title: "Updated",
          description: `Invitation link ${!currentStatus ? 'activated' : 'deactivated'}.`
        });
      } else {
        throw new Error('Failed to update link status');
      }
    } catch (error) {
      console.error('Error updating link status:', error);
      toast({
        title: "Error",
        description: "Failed to update link status. Please try again.",
        variant: "destructive"
      });
    }
  };

  const deleteLinkPermanently = async (linkId: string) => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitation-links/${linkId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setInvitationLinks(prev => prev.filter(link => link.id !== linkId));
        toast({
          title: "Deleted",
          description: "Invitation link deleted permanently."
        });
      } else {
        throw new Error('Failed to delete link');
      }
    } catch (error) {
      console.error('Error deleting link:', error);
      toast({
        title: "Error",
        description: "Failed to delete link. Please try again.",
        variant: "destructive"
      });
    }
  };

  const getInvitationUrl = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/join/${token}`;
  };

  const formatExpiryDate = (date: Date | null) => {
    if (!date) return 'Never expires';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isExpired = (expiresAt: Date | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isUsageLimitReached = (link: InvitationLink) => {
    return link.maxUses !== null && link.currentUses >= link.maxUses;
  };

  const filteredLinks = showInactiveLinks 
    ? invitationLinks 
    : invitationLinks.filter(link => link.isActive && !isExpired(link.expiresAt) && !isUsageLimitReached(link));

  if (!isAdmin) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Invitation Links
          </CardTitle>
          <CardDescription>
            You need admin permissions to manage invitation links.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Generation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Generate Invitation Link
          </CardTitle>
          <CardDescription>
            Create shareable links that bypass email filters. Share via Slack, Teams, or any internal channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={selectedRole} onValueChange={(value: 'viewer' | 'editor' | 'admin') => setSelectedRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="e.g., Engineering team invite"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxUses">Maximum Uses</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="maxUses"
                  type="number"
                  min="1"
                  max="1000"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  disabled={isUnlimitedUses}
                  className={isUnlimitedUses ? 'opacity-50' : ''}
                />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={isUnlimitedUses}
                    onChange={(e) => setIsUnlimitedUses(e.target.checked)}
                  />
                  Unlimited
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiryDays">Expires In (Days)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="expiryDays"
                  type="number"
                  min="1"
                  max="365"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  disabled={neverExpires}
                  className={neverExpires ? 'opacity-50' : ''}
                />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={neverExpires}
                    onChange={(e) => setNeverExpires(e.target.checked)}
                  />
                  Never
                </label>
              </div>
            </div>
          </div>

          <Button 
            onClick={generateInvitationLink}
            disabled={isGenerating}
            className="w-full md:w-auto"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Link className="mr-2 h-4 w-4" />
                Generate Invitation Link
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Links */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Invitation Links ({filteredLinks.length})
              </CardTitle>
              <CardDescription>
                Manage and monitor your organization's invitation links.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowInactiveLinks(!showInactiveLinks)}
              >
                {showInactiveLinks ? (
                  <>
                    <EyeOff className="mr-2 h-4 w-4" />
                    Hide Inactive
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Show All
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={loadInvitationLinks} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading invitation links...
            </div>
          ) : filteredLinks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {showInactiveLinks ? 'No invitation links created yet.' : 'No active invitation links.'}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLinks.map((link) => (
                <div key={link.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={link.role === 'admin' ? 'default' : 'secondary'}>
                        {link.role}
                      </Badge>
                      {link.description && (
                        <span className="text-sm text-muted-foreground">{link.description}</span>
                      )}
                      {!link.isActive && <Badge variant="outline">Inactive</Badge>}
                      {isExpired(link.expiresAt) && <Badge variant="destructive">Expired</Badge>}
                      {isUsageLimitReached(link) && <Badge variant="destructive">Limit Reached</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleLinkStatus(link.id, link.isActive)}
                        disabled={isExpired(link.expiresAt) || isUsageLimitReached(link)}
                      >
                        {link.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Invitation Link</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the invitation link. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteLinkPermanently(link.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={getInvitationUrl(link.token)}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(getInvitationUrl(link.token))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <BarChart3 className="h-4 w-4" />
                          {link.currentUses}/{link.maxUses || '∞'} uses
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatExpiryDate(link.expiresAt)}
                        </span>
                      </div>
                      <span>
                        Created {new Date(link.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InviteLinkGenerator;