import React, { useState } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '@/components/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Building2, Users } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function Onboarding() {
  const { user, refreshUser } = useAuth()
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  
  // Create Organization Form State
  const [orgName, setOrgName] = useState('')
  const [orgDescription, setOrgDescription] = useState('')
  
  // Join Organization Form State
  const [invitationCode, setInvitationCode] = useState('')
  
  // Auto-detect organization domain from user email
  const getOrganizationDomain = () => {
    if (!user?.email) return 'your-domain.com'
    
    const emailDomain = user.email.split('@')[1]?.toLowerCase()
    const personalProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com']
    
    if (personalProviders.includes(emailDomain)) {
      const baseName = orgName.toLowerCase().replace(/[^\w]/g, '').substring(0, 15)
      return baseName ? `${baseName}-org.local` : 'my-organization.local'
    }
    
    return emailDomain || 'your-domain.com'
  }

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgName.trim()) {
      toast({
        title: "Organization name required",
        description: "Please enter a name for your organization.",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: orgName.trim(),
          description: orgDescription.trim() || undefined
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to create organization')
      }

      const responseData = await response.json()
      console.log('✅ Organization creation response:', responseData)
      
      // Extract organization from response (API returns { organization: {...}, membership: {...} })
      const organization = responseData.organization || responseData
      const organizationName = organization?.name || orgName.trim()
      
      toast({
        title: "Organization created!",
        description: `Welcome to ${organizationName}. You can now start building ERDs.`
      })

      // Refresh user data to get the new organization with timeout
      try {
        console.log('🔄 Refreshing user data...')
        await Promise.race([
          refreshUser(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('RefreshUser timeout')), 5000)
          )
        ])
        console.log('✅ User data refreshed successfully')
      } catch (refreshError) {
        console.warn('⚠️ RefreshUser failed or timed out:', refreshError)
        // Continue with navigation even if refresh fails
      }
      
      // Redirect to projects page  
      console.log('🔀 Navigating to /projects')
      setLocation('/projects')
    } catch (error) {
      console.error('Failed to create organization:', error)
      toast({
        title: "Failed to create organization",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleJoinOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invitationCode.trim()) {
      toast({
        title: "Invitation code required",
        description: "Please enter an invitation code to join an organization.",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/organizations/accept-invitation/${invitationCode.trim()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to join organization')
      }

      const result = await response.json()
      
      toast({
        title: "Successfully joined organization!",
        description: `Welcome to ${result.organization?.name}. You can now collaborate with your team.`
      })

      // Refresh user data to get the new organization membership
      await refreshUser()
      
      // Redirect to projects page  
      setLocation('/projects')
    } catch (error) {
      console.error('Failed to join organization:', error)
      toast({
        title: "Failed to join organization",
        description: error instanceof Error ? error.message : "Please check your invitation code and try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Welcome to ERD Builder!</h1>
          <p className="text-muted-foreground mt-2">
            To get started, create a new organization or join an existing one.
          </p>
        </div>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Create Organization
            </TabsTrigger>
            <TabsTrigger value="join" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Join Organization
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Create New Organization</CardTitle>
                <CardDescription>
                  Start fresh with your own organization. You'll be the owner and can invite team members later.
                  <br /><small className="text-muted-foreground">Domain will be auto-generated from your email: <strong>{user?.email}</strong></small>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateOrganization} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Organization Name</Label>
                    <Input
                      id="orgName"
                      type="text"
                      placeholder="Acme Corp"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orgDescription">Description (Optional)</Label>
                    <Input
                      id="orgDescription"
                      type="text"
                      placeholder="What does your organization do?"
                      value={orgDescription}
                      onChange={(e) => setOrgDescription(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Organization Domain</Label>
                    <div className="bg-muted p-3 rounded-md border">
                      <code className="text-sm font-mono">{getOrganizationDomain()}</code>
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-generated from your email. This will be your organization's domain identifier.
                      </p>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Organization
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="join">
            <Card>
              <CardHeader>
                <CardTitle>Join Existing Organization</CardTitle>
                <CardDescription>
                  Enter an invitation code to join an organization that someone shared with you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleJoinOrganization} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="invitationCode">Invitation Code</Label>
                    <Input
                      id="invitationCode"
                      type="text"
                      placeholder="Enter invitation code"
                      value={invitationCode}
                      onChange={(e) => setInvitationCode(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Join Organization
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}