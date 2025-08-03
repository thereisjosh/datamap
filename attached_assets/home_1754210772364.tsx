import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Github, Moon, Sun, HelpCircle, Eye } from "lucide-react";
import UploadPanel from "./UploadPanel";
import MetadataPreview from "./MetadataPreview";
import ERDRenderer from "./ERDRenderer";

interface TableData {
  name: string;
  attributes: {
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    references?: {
      table: string;
      column: string;
    };
  }[];
}

interface HomeProps {
  isDarkMode?: boolean;
  setIsDarkMode?: (isDark: boolean) => void;
}

const Home = ({ isDarkMode = false, setIsDarkMode }: HomeProps) => {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableData[]>([]);
  const [mermaidCode, setMermaidCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>("upload");

  const handleFileUpload = (data: TableData[]) => {
    setTables(data);
    setActiveTab("metadata");

    // Generate Mermaid code from the table data
    const code = generateMermaidCode(data);
    setMermaidCode(code);
  };

  const generateMermaidCode = (tables: TableData[]): string => {
    // This is a simplified version - actual implementation would be more complex
    let code = "erDiagram\n";

    tables.forEach((table) => {
      // Add entity definitions
      code += `  ${table.name} {\n`;
      table.attributes.forEach((attr) => {
        const keyIndicator = attr.isPrimaryKey
          ? "PK"
          : attr.isForeignKey
            ? "FK"
            : "";
        code += `    ${attr.type} ${attr.name} ${keyIndicator}\n`;
      });
      code += "  }\n";

      // Add relationships
      table.attributes.forEach((attr) => {
        if (attr.isForeignKey && attr.references) {
          code += `  ${table.name} }|--|| ${attr.references.table} : references\n`;
        }
      });
    });

    return code;
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
    <div className="min-h-screen bg-background">
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
          {/* Mobile menu button - hidden until post-MVP */}
          <div className="md:hidden" style={{ display: "none" }}>
            <Button variant="ghost" size="icon" aria-label="Open mobile menu">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="4" x2="20" y1="12" y2="12"></line>
                <line x1="4" x2="20" y1="6" y2="6"></line>
                <line x1="4" x2="20" y1="18" y2="18"></line>
              </svg>
            </Button>
          </div>
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
