import React, { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { useAuth } from '@/components/auth/AuthProvider'
import { AuthModal } from '@/components/auth/AuthModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Database, 
  Users, 
  Shield, 
  Zap, 
  Building2, 
  ArrowRight,
  FileSpreadsheet,
  Share2,
  Eye,
  Github,
  Moon,
  Sun
} from 'lucide-react'

const Welcome = () => {
  const { user, loading } = useAuth()
  const [, setLocation] = useLocation()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

  // Redirect authenticated users to dashboard
  useEffect(() => {
    console.log('Welcome page - auth state:', { loading, user: user?.email || 'none' })
    if (!loading && user) {
      console.log('✅ User authenticated, redirecting to dashboard')
      setLocation('/projects')
    }
  }, [loading, user, setLocation])

  // Don't render if user is authenticated (redirect will happen)
  if (!loading && user) {
    return null
  }

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
  }

  const features = [
    {
      icon: FileSpreadsheet,
      title: 'Excel to ERD',
      description: 'Upload your data dictionary and get professional ERD diagrams instantly'
    },
    {
      icon: Building2,
      title: 'Domain Organization',
      description: 'Automatically organize tables into business domains for better understanding'
    },
    {
      icon: Share2,
      title: 'Team Collaboration',
      description: 'Share ERDs with your team based on email domains with role-based access'
    },
    {
      icon: Eye,
      title: 'Interactive Preview',
      description: 'Pan, zoom, and explore your ERDs with advanced search and filtering'
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Multi-tenant architecture with row-level security and audit logs'
    },
    {
      icon: Zap,
      title: 'Instant Generation',
      description: 'Transform complex data dictionaries into clear diagrams in seconds'
    }
  ]

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Database className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-primary">ERDBuilder</h1>
            <Badge variant="secondary" className="ml-2">Beta</Badge>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDarkMode}
              aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            
            <Button
              variant="ghost"
              onClick={() => setShowAuthModal(true)}
            >
              Sign In
            </Button>
            
            <Button onClick={() => setShowAuthModal(true)}>
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold text-foreground mb-6">
            Transform Data Dictionaries into
            <span className="text-primary"> Beautiful ERDs</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Upload your Excel data dictionary and instantly generate professional entity relationship diagrams. 
            Organize by business domains and collaborate with your team.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              onClick={() => setShowAuthModal(true)}
              className="flex items-center space-x-2"
            >
              <span>Start Building ERDs</span>
              <ArrowRight className="h-5 w-5" />
            </Button>
            
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => setShowAuthModal(true)}
            >
              View Demo
            </Button>
          </div>
          
          <div className="flex items-center justify-center space-x-4 mt-8 text-sm text-muted-foreground">
            <div className="flex items-center space-x-1">
              <Shield className="h-4 w-4 text-green-600" />
              <span>Enterprise Security</span>
            </div>
            <div className="flex items-center space-x-1">
              <Users className="h-4 w-4 text-blue-600" />
              <span>Team Collaboration</span>
            </div>
            <div className="flex items-center space-x-1">
              <Zap className="h-4 w-4 text-yellow-600" />
              <span>Instant Results</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Everything you need for professional ERDs
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Built for teams that need to understand complex database structures quickly and collaborate effectively.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-muted/30">
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Ready to visualize your database?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join teams using ERDBuilder to understand their data better. 
              Start with your email domain and invite your colleagues.
            </p>
            
            <Button 
              size="lg" 
              onClick={() => setShowAuthModal(true)}
              className="flex items-center space-x-2 mx-auto"
            >
              <span>Create Your First ERD</span>
              <ArrowRight className="h-5 w-5" />
            </Button>
            
            <p className="text-sm text-muted-foreground mt-4">
              No credit card required • Free to start • Enterprise-ready security
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted mt-16 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <Database className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold">ERDBuilder</span>
            </div>
            
            <div className="flex items-center space-x-6">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="h-5 w-5" />
              </a>
              <span className="text-sm text-muted-foreground">
                &copy; 2024 ERDBuilder. All rights reserved.
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  )
}

export default Welcome