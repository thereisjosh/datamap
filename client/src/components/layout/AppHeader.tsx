import React, { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { OrganizationSelector } from '../organizations/OrganizationSelector'
import { Button } from '../ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '../ui/dropdown-menu'
import { Badge } from '../ui/badge'
import { Database, User, Settings, LogOut, Moon, Sun, HelpCircle } from 'lucide-react'
import { useLocation } from 'wouter'

interface AppHeaderProps {
  isDarkMode?: boolean
  setIsDarkMode?: (isDark: boolean) => void
}

export function AppHeader({ isDarkMode = false, setIsDarkMode }: AppHeaderProps) {
  const { user, profile, signOut, activeOrganization } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [, navigate] = useLocation()

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const toggleDarkMode = () => {
    if (setIsDarkMode) {
      setIsDarkMode(!isDarkMode)
    }
  }

  const getUserInitials = () => {
    if (profile?.name) {
      return profile.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return user?.email?.slice(0, 2).toUpperCase() || '??'
  }

  const getUserRole = () => {
    // This would come from organization membership
    return 'Member' // Placeholder
  }

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <button 
            onClick={() => navigate('/projects')}
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
          >
            <Database className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-primary">ERDify</h1>
            </div>
          </button>

          {/* Organization Selector - Center */}
          <div className="hidden md:flex flex-1 justify-center max-w-md mx-8">
            <OrganizationSelector />
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-3">
            {/* Dark Mode Toggle */}
            {setIsDarkMode && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDarkMode}
                aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
            )}

            {/* Help */}
            <Button variant="ghost" size="icon" aria-label="Help">
              <HelpCircle className="h-5 w-5" />
            </Button>

            {/* User Dropdown */}
            <DropdownMenu open={showUserMenu} onOpenChange={setShowUserMenu}>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center space-x-2 hover:bg-muted px-3"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium leading-none">
                      {profile?.name || user?.email?.split('@')[0]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activeOrganization?.domain}
                    </p>
                  </div>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64">
                {/* User Info */}
                <div className="px-3 py-2">
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback>{getUserInitials()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {profile?.name || 'Unknown User'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email}
                      </p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {getUserRole()}
                      </Badge>
                    </div>
                  </div>
                </div>

                <DropdownMenuSeparator />

                {/* Organization Info */}
                {activeOrganization && (
                  <>
                    <div className="px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-1">Organization</p>
                      <p className="text-sm font-medium">{activeOrganization.name}</p>
                      <p className="text-xs text-muted-foreground">{activeOrganization.domain}</p>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}

                {/* Mobile Organization Selector */}
                <div className="md:hidden px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-2">Switch Organization</p>
                  <OrganizationSelector />
                </div>
                <DropdownMenuSeparator className="md:hidden" />

                {/* Menu Items */}
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onClick={() => {
                    setShowUserMenu(false)
                    navigate('/settings/profile')
                  }}
                >
                  <User className="mr-2 h-4 w-4" />
                  Profile Settings
                </DropdownMenuItem>

                <DropdownMenuItem 
                  className="cursor-pointer"
                  onClick={() => {
                    setShowUserMenu(false)
                    navigate('/settings/organization')
                  }}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Organization Settings
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem 
                  className="cursor-pointer text-red-600 focus:text-red-600"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}