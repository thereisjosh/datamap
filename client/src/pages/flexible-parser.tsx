import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { 
  Upload, 
  FileSpreadsheet, 
  Settings, 
  Eye, 
  CheckCircle,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  Clock
} from 'lucide-react';

// Import our custom components
import SheetExplorer from '@/components/excel/SheetExplorer';
import ColumnMapper from '@/components/excel/ColumnMapper';
import MappingPreview from '@/components/excel/MappingPreview';
import MetadataPreview from '@/components/MetadataPreview';

// Import types
import type { 
  ExcelAnalysis, 
  MappingFormState, 
  ParseResult, 
  FlexibleParserStep,
  StepValidation,
  FileUploadState,
  LoadingStates
} from '@/components/excel/types';

interface FlexibleParserProps {
  isDarkMode?: boolean;
  setIsDarkMode?: (isDark: boolean) => void;
}

const FlexibleParser: React.FC<FlexibleParserProps> = ({ 
  isDarkMode = false, 
  setIsDarkMode 
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Step management
  const [currentStepId, setCurrentStepId] = useState<FlexibleParserStep['id']>('upload');
  
  // File upload state
  const [fileUpload, setFileUpload] = useState<FileUploadState>({
    file: null,
    uploading: false,
    error: null
  });

  // Excel analysis state
  const [excelAnalysis, setExcelAnalysis] = useState<ExcelAnalysis | null>(null);

  // Mapping state
  const [mappings, setMappings] = useState<MappingFormState>({
    tableSheet: '',
    tableNameColumn: '',
    tableTypeColumn: '',
    columnSheet: '',
    columnTableNameColumn: '',
    columnNameColumn: '',
    columnTypeColumn: '',
    primaryKeyColumn: '',
    foreignKeyTableColumn: '',
    foreignKeyColumnColumn: ''
  });

  // Validation state
  const [stepValidation, setStepValidation] = useState<StepValidation>({
    canProceed: false,
    errors: [],
    warnings: []
  });

  // Parse result state
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // Loading states
  const [loading, setLoading] = useState<LoadingStates>({
    analyzing: false,
    parsing: false,
    uploading: false
  });

  // Helper function to determine if a step is completed
  const isStepCompleted = (stepId: FlexibleParserStep['id']): boolean => {
    switch (stepId) {
      case 'upload':
        return !!excelAnalysis;
      case 'analyze':
        return !!excelAnalysis && ['map', 'preview', 'result'].includes(currentStepId);
      case 'map':
        return stepValidation.canProceed && ['preview', 'result'].includes(currentStepId);
      case 'preview':
        return !!parseResult && currentStepId === 'result';
      case 'result':
        return !!parseResult && currentStepId === 'result';
      default:
        return false;
    }
  };

  // Define steps
  const steps: FlexibleParserStep[] = [
    {
      id: 'upload',
      title: 'Upload Excel',
      description: 'Upload your Excel data dictionary file',
      completed: isStepCompleted('upload'),
      current: currentStepId === 'upload'
    },
    {
      id: 'analyze',
      title: 'Explore Structure',
      description: 'Review your Excel file structure',
      completed: isStepCompleted('analyze'),
      current: currentStepId === 'analyze'
    },
    {
      id: 'map',
      title: 'Map Columns',
      description: 'Configure column mappings',
      completed: isStepCompleted('map'),
      current: currentStepId === 'map'
    },
    {
      id: 'preview',
      title: 'Preview & Confirm',
      description: 'Review detected tables and relationships',
      completed: isStepCompleted('preview'),
      current: currentStepId === 'preview'
    },
    {
      id: 'result',
      title: 'View ERD',
      description: 'Explore your generated ERD',
      completed: isStepCompleted('result'),
      current: currentStepId === 'result'
    }
  ];

  // API functions - using the centralized api module

  // Event handlers
  const handleFileUpload = useCallback(async (file: File) => {
    setFileUpload({ file, uploading: true, error: null });
    setLoading({ ...loading, analyzing: true });

    try {
      const analysis = await api.analyzeExcelStructure(file);
      setExcelAnalysis(analysis);
      setCurrentStepId('analyze');
      
      toast({
        title: "Excel Analyzed",
        description: `Found ${analysis.sheets.length} sheets. ${analysis.analysis.confidence > 0.5 ? 'Smart suggestions applied!' : ''}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze Excel file';
      setFileUpload({ file, uploading: false, error: errorMessage });
      
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading({ ...loading, analyzing: false });
      setFileUpload(prev => ({ ...prev, uploading: false }));
    }
  }, [loading, toast]);

  const handleMappingsChange = useCallback((newMappings: MappingFormState) => {
    setMappings(newMappings);
  }, []);

  const handleValidationChange = useCallback((validation: StepValidation) => {
    setStepValidation(validation);
  }, []);

  const handleProceedToMapping = useCallback(() => {
    setCurrentStepId('map');
  }, []);

  const handleProceedToPreview = useCallback(async () => {
    if (!fileUpload.file || !stepValidation.canProceed) return;

    setLoading({ ...loading, parsing: true });
    
    try {
      const result = await api.parseExcelWithMappings(fileUpload.file, mappings);
      setParseResult(result);
      setCurrentStepId('preview');
      
      toast({
        title: "Excel Parsed Successfully",
        description: `Found ${result.summary.tablesFound} tables and ${result.summary.relationshipsFound} relationships`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to parse Excel file';
      toast({
        title: "Parsing Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading({ ...loading, parsing: false });
    }
  }, [fileUpload.file, stepValidation.canProceed, mappings, loading, toast]);

  const handleGenerateERD = useCallback(() => {
    setCurrentStepId('result');
  }, []);

  const handleEditMappings = useCallback(() => {
    setCurrentStepId('map');
  }, []);

  const handleStartOver = useCallback(() => {
    setCurrentStepId('upload');
    setFileUpload({ file: null, uploading: false, error: null });
    setExcelAnalysis(null);
    setParseResult(null);
    setMappings({
      tableSheet: '',
      tableNameColumn: '',
      tableTypeColumn: '',
      columnSheet: '',
      columnTableNameColumn: '',
      columnNameColumn: '',
      columnTypeColumn: '',
      primaryKeyColumn: '',
      foreignKeyTableColumn: '',
      foreignKeyColumnColumn: ''
    });
  }, []);

  // Action button handlers
  const handleViewFullERD = useCallback(() => {
    if (!parseResult) return;
    
    // Generate Mermaid code from parse result
    const tables = parseResult.tables;
    const relationships = parseResult.relationships || [];
    
    // Create a simple Mermaid ERD
    let mermaidCode = 'erDiagram\n';
    
    // Add tables with their columns
    tables.forEach(table => {
      mermaidCode += `    ${table.name} {\n`;
      if (table.columns && Array.isArray(table.columns)) {
        table.columns.forEach(column => {
          const columnType = column.type || 'string';
          const keyInfo = column.isPrimaryKey ? ' PK' : column.isForeignKey ? ' FK' : '';
          mermaidCode += `        ${columnType} ${column.name}${keyInfo}\n`;
        });
      }
      mermaidCode += '    }\n';
    });
    
    // Add relationships
    relationships.forEach(rel => {
      mermaidCode += `    ${rel.sourceTable} ||--o{ ${rel.targetTable} : "${rel.sourceColumn} -> ${rel.targetColumn}"\n`;
    });
    
    // Navigate to ERD viewer with the generated code
    // For now, we'll copy to clipboard and show a message
    navigator.clipboard.writeText(mermaidCode).then(() => {
      toast({
        title: "Mermaid Code Copied",
        description: "The ERD code has been copied to your clipboard. You can paste it into a Mermaid viewer.",
      });
    }).catch(() => {
      // Fallback: show code in a modal or alert
      alert(`Mermaid ERD Code:\n\n${mermaidCode}`);
    });
  }, [parseResult, toast]);

  const handleSaveToProject = useCallback(async () => {
    if (!parseResult) return;
    
    try {
      // For now, create a new project with the parsed data
      const projectData = {
        name: `Parsed ERD - ${fileUpload.file?.name || 'Unknown'}`,
        description: `Generated from Excel file using flexible parser`,
        tables: parseResult.tables,
        relationships: parseResult.relationships || []
      };
      
      // Save as a new project (this would need to integrate with the project creation API)
      toast({
        title: "Save Feature",
        description: "Project saving functionality will be implemented to integrate with the main project system.",
        variant: "default",
      });
      
      // TODO: Implement actual project creation/saving
      // const newProject = await api.createProject(projectData);
      // Navigate to the project or show success message
      
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save project. Please try again.",
        variant: "destructive",
      });
    }
  }, [parseResult, fileUpload.file, toast]);

  // Unified navigation system
  const stepOrder: FlexibleParserStep['id'][] = ['upload', 'analyze', 'map', 'preview', 'result'];
  
  const canGoToPrevious = (): boolean => {
    const currentIndex = stepOrder.indexOf(currentStepId);
    return currentIndex > 0;
  };
  
  const canGoToNext = (): boolean => {
    switch (currentStepId) {
      case 'upload':
        return !!excelAnalysis;
      case 'analyze':
        return !!excelAnalysis;
      case 'map':
        return stepValidation.canProceed;
      case 'preview':
        return !!parseResult;
      case 'result':
        return false; // Final step
      default:
        return false;
    }
  };
  
  const handlePrevious = useCallback(() => {
    const currentIndex = stepOrder.indexOf(currentStepId);
    if (currentIndex > 0) {
      setCurrentStepId(stepOrder[currentIndex - 1]);
    }
  }, [currentStepId]);
  
  const handleNext = useCallback(() => {
    const currentIndex = stepOrder.indexOf(currentStepId);
    if (currentIndex < stepOrder.length - 1) {
      const nextStep = stepOrder[currentIndex + 1];
      
      // Handle special navigation logic
      if (currentStepId === 'map' && nextStep === 'preview') {
        handleProceedToPreview();
      } else if (currentStepId === 'preview' && nextStep === 'result') {
        handleGenerateERD();
      } else {
        setCurrentStepId(nextStep);
      }
    }
  }, [currentStepId, handleProceedToPreview, handleGenerateERD]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keyboard navigation if not typing in input fields
      if (event.target instanceof HTMLInputElement || 
          event.target instanceof HTMLTextAreaElement || 
          event.target instanceof HTMLSelectElement) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          if (canGoToPrevious()) {
            event.preventDefault();
            handlePrevious();
          }
          break;
        case 'ArrowRight':
        case 'Enter':
          if (canGoToNext() && !loading.parsing) {
            event.preventDefault();
            handleNext();
          }
          break;
        case 'Escape':
          if (currentStepId !== 'upload') {
            event.preventDefault();
            handleStartOver();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoToPrevious, canGoToNext, handlePrevious, handleNext, handleStartOver, currentStepId, loading.parsing]);

  // Calculate progress based on current step and completion status
  const calculateProgress = (): number => {
    const stepOrder = ['upload', 'analyze', 'map', 'preview', 'result'];
    const currentStepIndex = stepOrder.indexOf(currentStepId);
    const completedSteps = steps.filter(step => step.completed).length;
    
    // Base progress on current step position (even if not completed)
    const baseProgress = ((currentStepIndex + 1) / stepOrder.length) * 100;
    
    // Bonus for completing steps beyond current position
    const completionBonus = (completedSteps / stepOrder.length) * 10;
    
    return Math.min(100, baseProgress + completionBonus);
  };
  
  const completedSteps = steps.filter(step => step.completed).length;
  const progress = calculateProgress();

  // Unified navigation component
  const renderNavigationButtons = () => {
    if (currentStepId === 'upload') return null; // No navigation needed on upload step
    
    return (
      <div className="flex justify-between mt-6 pt-4 border-t">
        <Button 
          variant="outline" 
          onClick={handlePrevious}
          disabled={!canGoToPrevious()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>
        
        <div className="flex gap-2">
          {currentStepId !== 'result' && (
            <Button 
              onClick={handleNext}
              disabled={!canGoToNext() || loading.parsing}
            >
              {currentStepId === 'map' && loading.parsing ? (
                "Parsing..."
              ) : currentStepId === 'map' ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Results
                </>
              ) : currentStepId === 'preview' ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate ERD
                </>
              ) : (
                "Next"
              )}
            </Button>
          )}
          
          {currentStepId === 'result' && (
            <Button variant="outline" onClick={handleStartOver}>
              Upload New File
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Render file upload component
  const renderFileUpload = () => (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-blue-600" />
          Upload Excel File
        </CardTitle>
        <CardDescription>
          Upload your Excel data dictionary to get started
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">
              Excel files (.xlsx, .xls) up to 10MB
            </p>
          </div>
          
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            disabled={loading.analyzing}
          />

          {fileUpload.error && (
            <Alert variant="destructive">
              <AlertDescription>{fileUpload.error}</AlertDescription>
            </Alert>
          )}

          {loading.analyzing && (
            <div className="space-y-2">
              <Progress value={undefined} className="w-full" />
              <p className="text-sm text-center text-muted-foreground">
                Analyzing Excel structure...
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-6 w-6 text-purple-600" />
            <h1 className="text-3xl font-bold">Flexible Excel Parser</h1>
            <span className="text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
              MVP
            </span>
          </div>
          <p className="text-muted-foreground">
            Parse any Excel data dictionary format with our intelligent column mapping system
          </p>
          
          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-muted-foreground mt-2">
            💡 <strong>Keyboard shortcuts:</strong> ← → to navigate steps, Enter to proceed, Esc to start over
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Progress</h2>
            <span className="text-sm text-muted-foreground">
              {completedSteps} of {steps.length} steps
            </span>
          </div>
          <Progress value={progress} className="w-full mb-4" />
          
          {/* Step indicators with validation status */}
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const getStepStatus = () => {
                if (step.completed) return 'completed';
                if (step.current) {
                  // Check validation for current step
                  if (step.id === 'map' && stepValidation.errors.length > 0) return 'error';
                  if (step.id === 'map' && stepValidation.warnings.length > 0) return 'warning';
                  if (loading.analyzing || loading.parsing) return 'loading';
                  return 'current';
                }
                return 'pending';
              };

              const status = getStepStatus();
              
              return (
                <div key={step.id} className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    status === 'completed' ? 'bg-green-600 text-white' :
                    status === 'current' ? 'bg-blue-600 text-white' :
                    status === 'error' ? 'bg-red-600 text-white' :
                    status === 'warning' ? 'bg-yellow-600 text-white' :
                    status === 'loading' ? 'bg-blue-600 text-white animate-pulse' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {status === 'completed' ? <CheckCircle className="h-4 w-4" /> :
                     status === 'error' ? <AlertCircle className="h-4 w-4" /> :
                     status === 'warning' ? <AlertCircle className="h-4 w-4" /> :
                     status === 'loading' ? <Clock className="h-4 w-4" /> :
                     index + 1}
                  </div>
                  <span className={`text-xs mt-1 transition-colors ${
                    step.current ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}>
                    {step.title}
                  </span>
                  {/* Validation indicator */}
                  {step.current && step.id === 'map' && stepValidation.errors.length > 0 && (
                    <span className="text-xs text-red-600 mt-1">
                      {stepValidation.errors.length} error{stepValidation.errors.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {step.current && step.id === 'map' && stepValidation.warnings.length > 0 && stepValidation.errors.length === 0 && (
                    <span className="text-xs text-yellow-600 mt-1">
                      {stepValidation.warnings.length} warning{stepValidation.warnings.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {currentStepId === 'upload' && renderFileUpload()}

          {currentStepId === 'analyze' && excelAnalysis && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium">Excel Structure Analysis</h2>
                <Button variant="outline" onClick={handleStartOver}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Upload Different File
                </Button>
              </div>
              
              <SheetExplorer sheets={excelAnalysis.sheets} />
              
              {renderNavigationButtons()}
            </div>
          )}

          {currentStepId === 'map' && excelAnalysis && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium">Column Mapping</h2>
              </div>
              
              <ColumnMapper
                sheets={excelAnalysis.sheets}
                mappings={mappings}
                onMappingsChange={handleMappingsChange}
                onValidationChange={handleValidationChange}
                suggestions={excelAnalysis.analysis}
              />
              
              {renderNavigationButtons()}
            </div>
          )}

          {currentStepId === 'preview' && parseResult && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium">Preview & Confirm</h2>
              </div>
              
              <MappingPreview
                parseResult={parseResult}
                mappings={mappings}
                onEditMappings={handleEditMappings}
                onConfirm={handleGenerateERD}
              />
              
              {renderNavigationButtons()}
            </div>
          )}

          {currentStepId === 'result' && parseResult && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium">Your ERD</h2>
              </div>
              
              {/* Success message with action buttons - moved to top */}
              <Card className="bg-green-50 border-green-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-green-700 font-medium">
                      ERD Generated Successfully!
                    </span>
                  </div>
                  <p className="text-sm text-green-600 mb-4">
                    Your Excel data dictionary has been parsed using custom mappings. 
                    You can now view the full ERD visualization or integrate this with your project.
                  </p>
                  
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleViewFullERD}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Full ERD
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSaveToProject}>
                      Save to Project
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              {/* Use existing MetadataPreview component to show results */}
              <MetadataPreview 
                tables={parseResult.tables}
                errors={parseResult.errors}
              />
              
              {renderNavigationButtons()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default FlexibleParser;