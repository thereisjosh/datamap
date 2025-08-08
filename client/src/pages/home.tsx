import React, { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Github, Moon, Sun, HelpCircle, Eye } from "lucide-react";
import UploadPanel from "@/components/UploadPanel";
import MetadataPreview from "@/components/MetadataPreview";
import ERDRenderer from "@/components/ERDRenderer";
import { api, type ParseExcelResponse, type Table } from "@/lib/api";

interface HomeProps {
  isDarkMode?: boolean;
  setIsDarkMode?: (isDark: boolean) => void;
}

const Home = ({ isDarkMode = false, setIsDarkMode }: HomeProps) => {
  const [, navigate] = useLocation();
  const [tables, setTables] = useState<Table[]>([]);
  const [mermaidCode, setMermaidCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("upload");
  
  // Domain management state
  const [domainResults, setDomainResults] = useState<any>({});
  const [selectedDomain, setSelectedDomain] = useState<string>("overview");

  const handleFileUpload = async (data: ParseExcelResponse) => {
    setTables(data.tables);
    setActiveTab("metadata");
    setError(null);

    try {
      // Generate domain-specific Mermaid diagrams from the parsed data
      const domainResult = await api.generateDomainMermaid(
        data.tables,
        data.relationships || []
      );
      
      // Store all domain results for switching
      setDomainResults(domainResult.domains);
      setSelectedDomain("overview"); // Reset to overview
      
      // Use the overview diagram as the default
      const overviewDiagram = domainResult.domains.overview?.diagram;
      if (overviewDiagram) {
        setMermaidCode(overviewDiagram);
      } else {
        // Fallback to simple diagram if domain generation fails
        const fallbackDiagram = generateSimpleMermaidCode(data.tables);
        setMermaidCode(fallbackDiagram);
      }
      
      console.log('Generated domain diagrams:', Object.keys(domainResult.domains));
      Object.entries(domainResult.domains).forEach(([domain, result]) => {
        console.log(`${domain}: ${result.metadata.tables_count} tables, ${result.metadata.relationships_count} relationships`);
      });
      
    } catch (err) {
      console.error('Failed to generate domain Mermaid code:', err);
      // Don't set error here as the tables still loaded successfully
      // Just use a fallback diagram generation
      const fallbackDiagram = generateSimpleMermaidCode(data.tables);
      setMermaidCode(fallbackDiagram);
    }
  };

  // Fallback function to generate simple Mermaid code on the client side
  const generateSimpleMermaidCode = (tables: Table[]): string => {
    let code = "erDiagram\n";

    for (const table of tables) {
      code += `  ${table.name} {\n`;
      for (const column of table.columns) {
        const keyIndicator = column.isPrimaryKey
          ? " PK"
          : column.isForeignKey
            ? " FK"
            : "";
        code += `    ${column.type} ${column.name}${keyIndicator}\n`;
      }
      code += "  }\n";

      // Add relationships
      for (const column of table.columns) {
        if (column.isForeignKey && column.references) {
          code += `  ${table.name} }o--|| ${column.references.table} : references\n`;
        }
      }
    }

    return code;
  };

  const handleDomainChange = (domain: string) => {
    setSelectedDomain(domain);
    const domainData = domainResults[domain];
    if (domainData && domainData.diagram) {
      setMermaidCode(domainData.diagram);
      console.log(`📊 Switched to ${domain} domain: ${domainData.metadata.tables_count} tables, ${domainData.metadata.relationships_count} relationships`);
    }
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setTables([]);
    setMermaidCode("");
    setDomainResults({});
  };

  const toggleDarkMode = () => {
    if (setIsDarkMode) {
      setIsDarkMode(!isDarkMode);
    }
  };

  const handlePreviewERD = () => {
    navigate("/erd-preview", {
      state: {
        tables,
        mermaidCode,
      },
    });
  };

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      {/* Navigation Bar */}
      <header className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors">
              ERDgen
            </h1>
          </div>
          <nav className="hidden md:flex items-center space-x-6">
            <a
              href="#"
              className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-1"
            >
              <HelpCircle size={16} />
              How It Works
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-1"
            >
              <Github size={16} />
              GitHub Repo
            </a>
            <a
              href="mailto:contact@erdgen.app"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Contact
            </a>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDarkMode}
              className="ml-2"
              aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
            >
              {isDarkMode ? (
                <Sun size={20} aria-hidden="true" />
              ) : (
                <Moon size={20} aria-hidden="true" />
              )}
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left Column - Upload and Metadata */}
          <div className="w-full lg:w-1/2 space-y-4">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="metadata" disabled={tables.length === 0}>
                  Metadata
                </TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <UploadPanel
                      onFileUpload={handleFileUpload}
                      isLoading={isLoading}
                      error={error}
                      onError={handleError}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="metadata" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <MetadataPreview tables={tables} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - ERD Renderer */}
          <div className="w-full lg:w-1/2">
            <Card className="h-full">
              <CardContent className="pt-6 h-full">
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">ERD Preview</h3>
                    {(tables.length > 0 || mermaidCode) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviewERD}
                        className="flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Full Preview
                      </Button>
                    )}
                  </div>
                  
                  {/* Domain Selector */}
                  {Object.keys(domainResults).length > 0 && (
                    <div className="mb-4">
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        Select Domain View:
                      </label>
                      <Select
                        value={selectedDomain}
                        onValueChange={handleDomainChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a domain" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(domainResults).map(([domain, result]: [string, any]) => (
                            <SelectItem key={domain} value={domain}>
                              <div className="flex flex-col">
                                <span className="font-medium capitalize">
                                  {domain.replace('-', ' ')}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {result.metadata.tables_count} tables, {result.metadata.relationships_count} relationships
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <ERDRenderer
                  mermaidCode={mermaidCode}
                  isDarkMode={isDarkMode}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-muted mt-12 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} ERDgen. All rights reserved.
              </p>
            </div>
            <div className="flex space-x-6">
              <a
                href="#"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy
              </a>
              <a
                href="#"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Terms
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                LinkedIn
              </a>
            </div>
          </div>
          <div className="mt-4 text-center md:text-left">
            <a
              href="mailto:contact@erdgen.app"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              contact@erdgen.app
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
