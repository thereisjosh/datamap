import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { AppHeader } from '@/components/layout/AppHeader';
import UploadPanel from '@/components/UploadPanel';
import MetadataPreview from '@/components/MetadataPreview';
import ERDRenderer from '@/components/ERDRenderer';
import { api, type ParseExcelResponse, type Table } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Eye, Loader2 } from 'lucide-react';
import { useLocation, useRoute } from 'wouter';

interface ProjectUploadProps {
  isDarkMode?: boolean;
  setIsDarkMode?: (isDark: boolean) => void;
}

const ProjectUpload = ({ isDarkMode = false, setIsDarkMode }: ProjectUploadProps) => {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/projects/:projectId/upload');
  const { toast } = useToast();

  // State management
  const [activeTab, setActiveTab] = useState<'upload' | 'metadata' | 'preview'>('upload');
  const [tables, setTables] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [mermaidCode, setMermaidCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedFilename, setUploadedFilename] = useState<string>('uploaded_data.xlsx');
  const [project, setProject] = useState<any>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  const projectId = params?.projectId;

  // Load or create project on mount
  useEffect(() => {
    const loadOrCreateProject = async () => {
      if (!projectId) {
        navigate('/projects');
        return;
      }

      setIsLoadingProject(true);
      try {
        // Try to load existing project
        const { project: existingProject } = await api.getProject(projectId);
        setProject(existingProject);
      } catch (error) {
        // Project doesn't exist, navigate back to projects page
        console.error('Project not found:', error);
        toast({
          title: "Project Not Found",
          description: "The project you're looking for doesn't exist.",
          variant: "destructive",
        });
        navigate('/projects');
      } finally {
        setIsLoadingProject(false);
      }
    };

    loadOrCreateProject();
  }, [projectId, navigate, toast]);

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

  const handleFileUpload = async (data: ParseExcelResponse) => {
    setTables(data.tables);
    setRelationships(data.relationships || []);
    setUploadedFilename(data.filename || 'uploaded_data.xlsx');
    setActiveTab('metadata');
    setError(null);

    try {
      // Generate domain-specific Mermaid diagrams from the parsed data
      const domainResult = await api.generateDomainMermaid(
        data.tables,
        data.relationships || []
      );
      
      // Use the overview diagram as the default
      const overviewDiagram = domainResult.domains.overview?.diagram;
      if (overviewDiagram) {
        setMermaidCode(overviewDiagram);
      } else {
        // Fallback to simple diagram if domain generation fails
        const fallbackDiagram = generateSimpleMermaidCode(data.tables);
        setMermaidCode(fallbackDiagram);
      }
      
      console.log('Generated domain diagrams for project:', Object.keys(domainResult.domains));
      
    } catch (err) {
      console.error('Failed to generate Mermaid code for project:', err);
      // Don't set error here as the tables still loaded successfully
      // Just use a fallback diagram generation
      const fallbackDiagram = generateSimpleMermaidCode(data.tables);
      setMermaidCode(fallbackDiagram);
    }
    
    toast({
      title: "File Processed Successfully",
      description: `Found ${data.tables.length} tables and ${data.relationships?.length || 0} relationships.`,
    });
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    toast({
      title: "Upload Error",
      description: errorMessage,
      variant: "destructive",
    });
  };

  const handleSaveProject = async () => {
    setIsSaving(true);
    
    try {
      await api.saveProject(projectId, {
        tables,
        relationships,
        mermaidCode,
        filename: uploadedFilename
      });
      
      toast({
        title: "Project Saved",
        description: "Your ERD project has been saved successfully.",
      });
      
      navigate('/projects');
    } catch (error) {
      console.error('Project save error:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save project. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewERD = () => {
    // Navigate to full preview with project context
    navigate(`/projects/${projectId}/preview`);
  };

  const canSave = tables.length > 0 && mermaidCode;

  // Show loading state while project is being loaded
  if (isLoadingProject) {
    return (
      <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
        <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  // If no project loaded, don't render the main content
  if (!project) {
    return (
      <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
        <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-muted-foreground">Project not found</p>
            <Button onClick={() => navigate('/projects')} className="mt-4">
              Back to Projects
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/projects')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <p className="text-muted-foreground">{project.description}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {canSave && (
              <>
                <Button 
                  variant="outline"
                  onClick={handlePreviewERD}
                  className="flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Full Preview
                </Button>
                <Button 
                  onClick={handleSaveProject}
                  disabled={isSaving}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Saving...' : 'Save Project'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <Card>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="h-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="upload">Upload Data</TabsTrigger>
                <TabsTrigger value="metadata" disabled={tables.length === 0}>
                  Review Data ({tables.length})
                </TabsTrigger>
                <TabsTrigger value="preview" disabled={!mermaidCode}>
                  ERD Preview
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="upload" className="space-y-4">
                <UploadPanel
                  onFileUpload={handleFileUpload}
                  isLoading={isLoading}
                  error={error}
                  onError={handleError}
                  projectId={projectId}
                />
              </TabsContent>
              
              <TabsContent value="metadata" className="space-y-4">
                <MetadataPreview tables={tables} />
                {tables.length > 0 && (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setActiveTab('upload')}>
                      Upload Different File
                    </Button>
                    <Button onClick={() => setActiveTab('preview')}>
                      View ERD Preview
                    </Button>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="preview" className="space-y-4">
                <div className="min-h-[600px]">
                  <ERDRenderer
                    mermaidCode={mermaidCode}
                    isDarkMode={isDarkMode}
                    isLoading={isLoading}
                    domain="all"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setActiveTab('metadata')}>
                    Back to Data Review
                  </Button>
                  <Button 
                    onClick={handleSaveProject}
                    disabled={isSaving}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Project'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ProjectUpload;