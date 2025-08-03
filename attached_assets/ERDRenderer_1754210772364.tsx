import React, { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Copy,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Moon,
  Sun,
  Code,
  FileSpreadsheet,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import mermaid from "mermaid";
import { toPng, toSvg } from "html-to-image";
import jsPDF from "jspdf";

interface ERDRendererProps {
  mermaidCode?: string;
  onLayoutChange?: (layout: "TB" | "LR") => void;
}

const ERDRenderer = ({
  mermaidCode = "",
  onLayoutChange,
}: ERDRendererProps) => {
  const [activeTab, setActiveTab] = useState<string>("diagram");
  const [layout, setLayout] = useState<"TB" | "LR">("TB");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [includeTimestamp, setIncludeTimestamp] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [isRendering, setIsRendering] = useState<boolean>(false);

  const diagramRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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

  const displayCode = mermaidCode || sampleMermaidCode;

  // Memoize mermaid configuration to avoid unnecessary reinitializations
  const mermaidConfig = useMemo(() => {
    const currentTheme = theme === "dark" ? "dark" : "default";
    return {
      startOnLoad: false,
      theme: currentTheme,
      er: {
        layoutDirection: layout,
      },
    };
  }, [theme, layout]);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!diagramRef.current || !displayCode) return;

      setIsRendering(true);
      try {
        // Initialize Mermaid with memoized config
        mermaid.initialize(mermaidConfig);

        // Clear previous diagram to prevent lingering content
        diagramRef.current.innerHTML = "";

        // Generate unique ID for this render
        const diagramId = `erdDiagram-${Date.now()}`;

        // Render the diagram
        const { svg } = await mermaid.render(diagramId, displayCode);

        // Insert the SVG into the container
        if (diagramRef.current) {
          diagramRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error("Error rendering Mermaid diagram:", error);
        if (diagramRef.current) {
          diagramRef.current.innerHTML = `
            <div class="flex items-center justify-center h-full text-red-500">
              <p>Error rendering diagram: ${error instanceof Error ? error.message : "Unknown error"}</p>
            </div>
          `;
        }
      } finally {
        setIsRendering(false);
      }
    };

    renderDiagram();
  }, [displayCode, mermaidConfig]);

  const handleLayoutChange = (newLayout: "TB" | "LR") => {
    setLayout(newLayout);
    if (onLayoutChange) {
      onLayoutChange(newLayout);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(displayCode);
    toast({
      title: "Copied to clipboard",
      description: "Mermaid code has been copied to your clipboard",
    });
  };

  const handleExport = async (format: "png" | "svg" | "pdf") => {
    const node = diagramRef.current;
    if (!node || !node.innerHTML.trim()) {
      toast({
        title: "Export Failed",
        description: "No diagram available to export",
        variant: "destructive",
      });
      return;
    }

    try {
      const timestamp = includeTimestamp
        ? `_${new Date().toISOString().replace(/[:.]/g, "-")}`
        : "";
      const filename = `erd_diagram${timestamp}.${format}`;

      if (format === "pdf") {
        // Export as PDF using jsPDF
        const canvas = await toPng(node, {
          backgroundColor: theme === "dark" ? "#0f172a" : "#ffffff",
          pixelRatio: 2,
        });

        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [node.offsetWidth, node.offsetHeight],
        });

        pdf.addImage(canvas, "PNG", 0, 0, node.offsetWidth, node.offsetHeight);
        pdf.save(filename);
      } else {
        // Export the diagram as PNG or SVG
        const dataUrl =
          format === "png"
            ? await toPng(node, {
                backgroundColor: theme === "dark" ? "#0f172a" : "#ffffff",
                pixelRatio: 2, // Higher quality
              })
            : await toSvg(node, {
                backgroundColor: theme === "dark" ? "#0f172a" : "#ffffff",
              });

        // Create download link
        const link = document.createElement("a");
        link.download = filename;
        link.href = dataUrl;
        link.click();
      }

      toast({
        title: "Export Successful",
        description: `Diagram exported as ${filename}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "Failed to export diagram. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleZoom = (direction: "in" | "out") => {
    setZoom((prev) => {
      const newZoom = direction === "in" ? prev + 0.1 : prev - 0.1;
      return Math.max(0.5, Math.min(2, newZoom));
    });
  };

  return (
    <Card className="w-full bg-background">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xl font-medium">
          Entity-Relationship Diagram
        </CardTitle>
        <div className="flex items-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                >
                  {theme === "light" ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Sun className="h-4 w-4" />
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
                  onClick={() =>
                    handleLayoutChange(layout === "TB" ? "LR" : "TB")
                  }
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Toggle {layout === "TB" ? "Horizontal" : "Vertical"} Layout
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="diagram">Diagram</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>

          <TabsContent value="diagram" className="w-full">
            <div className="flex justify-end mb-2 space-x-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleZoom("in")}
                    >
                      <ZoomIn className="h-4 w-4" />
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
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Zoom Out</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="relative">
              <div
                ref={diagramRef}
                className="w-full min-h-[400px] border rounded-md p-4 overflow-auto bg-background"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center top",
                }}
                role="img"
                aria-label="Entity Relationship Diagram"
              >
                {!mermaidCode ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                      <FileSpreadsheet
                        className="h-8 w-8 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-medium text-foreground">
                        No Diagram Available
                      </h3>
                      <p className="text-muted-foreground max-w-sm">
                        Upload an Excel file to generate your
                        Entity-Relationship Diagram
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
              {isRendering && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-md">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      Rendering diagram...
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="code">
            <div className="relative">
              <pre className="p-4 rounded-md bg-muted overflow-auto max-h-[400px] text-sm">
                <code>{displayCode}</code>
              </pre>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2"
                onClick={handleCopyCode}
                data-testid="copy-code-button"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 pt-4 border-t">
          <div className="flex items-center space-x-2 mb-4 sm:mb-0">
            <Checkbox
              id="include-timestamp"
              checked={includeTimestamp}
              onCheckedChange={(checked) =>
                setIncludeTimestamp(checked === true)
              }
            />
            <Label htmlFor="include-timestamp">
              Include timestamp in filename
            </Label>
          </div>

          <div className="flex space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => handleExport("png")}
                    disabled={!mermaidCode || isRendering}
                    data-testid="export-png-button"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PNG
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export diagram as PNG image</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => handleExport("svg")}
                    disabled={!mermaidCode || isRendering}
                    data-testid="export-svg-button"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    SVG
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export diagram as SVG vector</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => handleExport("pdf")}
                    disabled={!mermaidCode || isRendering}
                    data-testid="export-pdf-button"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export diagram as PDF document</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ERDRenderer;
