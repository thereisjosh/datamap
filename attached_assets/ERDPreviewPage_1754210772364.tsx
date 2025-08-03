import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Copy,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Moon,
  Sun,
  FileText,
  Image,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import mermaid from "mermaid";

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

interface ERDPreviewPageProps {
  tables?: TableData[];
  mermaidCode?: string;
}

const ERDPreviewPage = ({
  tables = [],
  mermaidCode = "",
}: ERDPreviewPageProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Get data from navigation state or use props
  const stateData = location.state as {
    tables?: TableData[];
    mermaidCode?: string;
  } | null;
  const finalTables = stateData?.tables || tables;
  const finalMermaidCode = stateData?.mermaidCode || mermaidCode;

  const [layout, setLayout] = useState<"TB" | "LR">("TB");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [includeTimestamp, setIncludeTimestamp] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [isRendering, setIsRendering] = useState<boolean>(false);

  const diagramRef = useRef<HTMLDivElement>(null);
  const mermaidContainerRef = useRef<HTMLDivElement>(null);

  // Sample Mermaid code for preview when no actual code is provided
  const sampleMermaidCode = `erDiagram
    CUSTOMER {
      string id PK
      string name
      string email
    }
    ORDER {
      string id PK
      string customer_id FK
      date order_date
      decimal total_amount
    }
    CUSTOMER ||--o{ ORDER : places`;

  const displayCode = finalMermaidCode || sampleMermaidCode;

  // Initialize Mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: theme === "dark" ? "dark" : "default",
      er: {
        layoutDirection: layout,
      },
    });
  }, [theme, layout]);

  // Render the diagram
  useEffect(() => {
    const renderDiagram = async () => {
      if (!mermaidContainerRef.current || !displayCode) return;

      setIsRendering(true);
      try {
        const { svg } = await mermaid.render("mermaid-diagram", displayCode);
        mermaidContainerRef.current.innerHTML = svg;
      } catch (error) {
        console.error("Error rendering Mermaid diagram:", error);
        mermaidContainerRef.current.innerHTML = `
          <div class="flex items-center justify-center h-64 text-red-500">
            <p>Error rendering diagram. Please check the Mermaid syntax.</p>
          </div>
        `;
      } finally {
        setIsRendering(false);
      }
    };

    renderDiagram();
  }, [displayCode, theme, layout]);

  const handleLayoutChange = () => {
    setLayout(layout === "TB" ? "LR" : "TB");
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(displayCode);
    toast({
      title: "Copied to clipboard",
      description: "Mermaid code has been copied to your clipboard",
    });
  };

  const handleExportMermaid = () => {
    const timestamp = includeTimestamp
      ? `_${new Date().toISOString().replace(/[:.]/g, "-")}`
      : "";
    const filename = `erd_diagram${timestamp}.mmd`;

    const blob = new Blob([displayCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Mermaid file exported",
      description: `Diagram exported as ${filename}`,
    });
  };

  const handleExportPDF = async () => {
    const timestamp = includeTimestamp
      ? `_${new Date().toISOString().replace(/[:.]/g, "-")}`
      : "";
    const filename = `erd_diagram${timestamp}.pdf`;

    // For now, show a toast indicating PDF export would happen
    // In a real implementation, you would use a library like jsPDF or html2canvas
    toast({
      title: "PDF Export",
      description: `PDF export functionality would save as ${filename}`,
    });
  };

  const handleZoom = (direction: "in" | "out") => {
    setZoom((prev) => {
      const newZoom = direction === "in" ? prev + 0.1 : prev - 0.1;
      return Math.max(0.5, Math.min(2, newZoom));
    });
  };

  const goBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Apply theme to this component's context */}
      <div className={theme === "dark" ? "dark" : ""}>
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goBack}
                  aria-label="Go back to main page"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-primary">
                    ERD Preview
                  </h1>
                  {finalTables.length > 0 && (
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="outline">
                        {finalTables.length} Tables
                      </Badge>
                      <Badge variant="outline">
                        {finalTables.reduce(
                          (acc, table) => acc + table.attributes.length,
                          0,
                        )}{" "}
                        Attributes
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setTheme(theme === "light" ? "dark" : "light")
                        }
                        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                      >
                        {theme === "light" ? (
                          <Moon className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Sun className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Toggle {theme === "light" ? "Dark" : "Light"} Mode</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleLayoutChange}
                        aria-label={`Switch to ${layout === "TB" ? "horizontal" : "vertical"} layout`}
                      >
                        <RotateCw className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Switch to {layout === "TB" ? "Horizontal" : "Vertical"}{" "}
                        Layout
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Main Diagram Area */}
            <div className="lg:col-span-3">
              <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg font-medium">
                    Entity-Relationship Diagram
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleZoom("in")}
                            disabled={zoom >= 2}
                            aria-label="Zoom in"
                          >
                            <ZoomIn className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Zoom In</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleZoom("out")}
                            disabled={zoom <= 0.5}
                            aria-label="Zoom out"
                          >
                            <ZoomOut className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Zoom Out</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <Badge variant="secondary">{Math.round(zoom * 100)}%</Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <div
                    ref={diagramRef}
                    className="w-full min-h-[500px] border rounded-md p-5 overflow-auto bg-background"
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "center top",
                    }}
                    role="img"
                    aria-label="Entity Relationship Diagram"
                  >
                    {isRendering ? (
                      <div
                        className="flex items-center justify-center h-64"
                        role="status"
                        aria-live="polite"
                      >
                        <p className="text-muted-foreground">
                          Rendering diagram...
                        </p>
                      </div>
                    ) : (
                      <div
                        ref={mermaidContainerRef}
                        className="w-full h-full"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar - Code and Export Options */}
            <div className="lg:col-span-1 space-y-4">
              {/* Mermaid Code */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-medium flex items-center">
                    <FileText className="h-4 w-4 mr-2" />
                    Mermaid Code
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre className="p-3 rounded-md bg-muted overflow-auto max-h-[200px] text-xs">
                      <code>{displayCode}</code>
                    </pre>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={handleCopyCode}
                      aria-label="Copy Mermaid code to clipboard"
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Export Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-medium flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Export Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-timestamp"
                      checked={includeTimestamp}
                      onCheckedChange={(checked) =>
                        setIncludeTimestamp(checked === true)
                      }
                    />
                    <Label htmlFor="include-timestamp" className="text-sm">
                      Include timestamp in filename
                    </Label>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleExportMermaid}
                      aria-label="Export diagram as Mermaid file"
                    >
                      <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                      Export as Mermaid (.mmd)
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleExportPDF}
                      aria-label="Export diagram as PDF file"
                    >
                      <Image className="h-4 w-4 mr-2" aria-hidden="true" />
                      Export as PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Diagram Info */}
              {finalTables.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-medium">
                      Diagram Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tables:</span>
                      <span className="font-medium">{finalTables.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Total Attributes:
                      </span>
                      <span className="font-medium">
                        {finalTables.reduce(
                          (acc, table) => acc + table.attributes.length,
                          0,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Layout:</span>
                      <span className="font-medium">
                        {layout === "TB" ? "Top-Bottom" : "Left-Right"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Theme:</span>
                      <span className="font-medium capitalize">{theme}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ERDPreviewPage;
