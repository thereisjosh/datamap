import React from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Building2, Users } from 'lucide-react'
import { Badge } from '../ui/badge'

export function OrganizationSelector() {
  const { organizations, activeOrganization, setActiveOrganization } = useAuth()

  if (organizations.length === 0) {
    return null
  }

  if (organizations.length === 1) {
    // If only one organization, show it as a static display
    const { organization, membership } = organizations[0]
    return (
      <div className="flex items-center space-x-2 px-3 py-2 bg-muted rounded-md">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{organization.name}</p>
          <p className="text-xs text-muted-foreground">{organization.domain}</p>
        </div>
        <Badge variant="outline" className="capitalize">
          {membership.role}
        </Badge>
      </div>
    )
  }

  return (
    <Select
      value={activeOrganization?.id || ''}
      onValueChange={(value) => {
        const selectedOrg = organizations.find(o => o.organization.id === value)
        if (selectedOrg) {
          setActiveOrganization(selectedOrg.organization)
        }
      }}
    >
      <SelectTrigger className="w-full min-w-[200px]">
        <SelectValue placeholder="Select organization">
          {activeOrganization && (
            <div className="flex items-center space-x-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{activeOrganization.name}</p>
                <p className="text-xs text-muted-foreground">{activeOrganization.domain}</p>
              </div>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {organizations.map(({ organization, membership }) => (
          <SelectItem key={organization.id} value={organization.id}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{organization.name}</p>
                  <p className="text-xs text-muted-foreground">{organization.domain}</p>
                </div>
              </div>
              <Badge variant="outline" className="capitalize ml-2">
                {membership.role}
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface OrganizationInfoProps {
  showMemberCount?: boolean
}

export function OrganizationInfo({ showMemberCount = false }: OrganizationInfoProps) {
  const { activeOrganization, organizations } = useAuth()

  if (!activeOrganization) {
    return null
  }

  const membership = organizations.find(o => o.organization.id === activeOrganization.id)?.membership

  return (
    <div className="flex items-center space-x-3 p-4 bg-muted/50 rounded-lg border">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold truncate">{activeOrganization.name}</h3>
          {membership && (
            <Badge variant="outline" className="capitalize">
              {membership.role}
            </Badge>
          )}
        </div>
        <div className="flex items-center space-x-4 mt-1">
          <p className="text-sm text-muted-foreground">{activeOrganization.domain}</p>
          {showMemberCount && (
            <div className="flex items-center space-x-1 text-sm text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>Team</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        <Badge 
          variant={activeOrganization.subscription_tier === 'free' ? 'secondary' : 'default'}
          className="capitalize"
        >
          {activeOrganization.subscription_tier}
        </Badge>
      </div>
    </div>
  )
}