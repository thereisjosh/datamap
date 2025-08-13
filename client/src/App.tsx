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
import { useState } from "react";

function Router() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Welcome} />
      <Route path="/welcome" component={Welcome} />
      
      {/* Protected routes */}
      <Route path="/dashboard">
        <AuthGuard>
          <Home isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        </AuthGuard>
      </Route>
      <Route path="/erd-preview">
        <AuthGuard>
          <ERDPreview />
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
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
