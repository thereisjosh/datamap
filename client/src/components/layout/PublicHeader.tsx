import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Moon, Sun, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

interface PublicHeaderProps {
  showBackButton?: boolean;
  backButtonText?: string;
  backButtonPath?: string;
  showAuthButtons?: boolean;
  onSignInClick?: () => void;
}

export function PublicHeader({ 
  showBackButton = true, 
  backButtonText = "Back to Home",
  backButtonPath = "/welcome",
  showAuthButtons = false,
  onSignInClick
}: PublicHeaderProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();

  const handleBackClick = () => {
    setLocation(backButtonPath);
  };

  const handleSignInClick = () => {
    if (onSignInClick) {
      onSignInClick();
    } else {
      setLocation('/auth/signin');
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <button 
            onClick={handleBackClick}
            className="hover:opacity-80 transition-opacity"
          >
            <img 
              src={isDarkMode ? "/2.svg" : "/1.svg"} 
              alt="DataMap" 
              className="h-12 w-auto"
            />
          </button>
          <Badge variant="secondary" className="ml-2">Beta</Badge>
        </div>
        
        <div className="flex items-center space-x-4">
          {showBackButton && (
            <Button
              variant="ghost"
              onClick={handleBackClick}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {backButtonText}
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
          >
            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          
          {showAuthButtons && (
            <>
              <Button
                variant="ghost"
                onClick={handleSignInClick}
              >
                Sign In
              </Button>
              
              <Button onClick={handleSignInClick}>
                Get Started
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}