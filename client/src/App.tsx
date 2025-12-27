import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthGuard } from "@/components/auth/AuthGuard";
import NotFound from "@/pages/not-found";
import Welcome from "@/pages/welcome";
import Home from "@/pages/home";
import ERDPreview from "@/pages/erd-preview";
import ProfileSettings from "@/pages/settings/profile";
import OrganizationSettings from "@/pages/settings/organization";
import Projects from "@/pages/projects";
import ProjectUpload from "@/pages/project-upload";
import ProjectERD from "@/pages/project-erd";
import ProjectPreview from "@/pages/project-preview";
import AcceptInvitation from "@/pages/accept-invitation";
import JoinPage from "@/pages/join";
import SignupPage from "@/pages/auth/signup";
import SigninPage from "@/pages/auth/signin";
import Onboarding from "@/pages/onboarding";
import { ThemeProvider } from "@/contexts/ThemeContext";
function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Welcome} />
      <Route path="/welcome" component={Welcome} />
      <Route path="/accept-invitation/:token" component={AcceptInvitation} />
      <Route path="/join/:token" component={JoinPage} />
      <Route path="/auth/signup" component={SignupPage} />
      <Route path="/auth/signin" component={SigninPage} />
      <Route path="/onboarding" component={Onboarding} />
      
      {/* Protected routes */}
      <Route path="/projects">
        <AuthGuard>
          <Projects />
        </AuthGuard>
      </Route>
      <Route path="/projects/:projectId/upload">
        <AuthGuard>
          <ProjectUpload />
        </AuthGuard>
      </Route>
      <Route path="/projects/:projectId/erd">
        <AuthGuard>
          <ProjectERD />
        </AuthGuard>
      </Route>
      <Route path="/projects/:projectId/preview">
        <AuthGuard>
          <ProjectPreview />
        </AuthGuard>
      </Route>
      <Route path="/dashboard">
        <AuthGuard>
          <Home />
        </AuthGuard>
      </Route>
      <Route path="/erd-preview">
        <AuthGuard>
          <ERDPreview />
        </AuthGuard>
      </Route>
      <Route path="/settings/profile">
        <AuthGuard>
          <ProfileSettings />
        </AuthGuard>
      </Route>
      <Route path="/settings/organization">
        <AuthGuard>
          <OrganizationSettings />
        </AuthGuard>
      </Route>
      
      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
