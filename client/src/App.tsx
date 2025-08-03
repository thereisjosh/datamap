import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import ERDPreview from "@/pages/erd-preview";
import { useState } from "react";

function Router() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  return (
    <Switch>
      <Route path="/" component={() => <Home isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />} />
      <Route path="/erd-preview" component={ERDPreview} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
