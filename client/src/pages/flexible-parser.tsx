import React, { useState, useCallback } from 'react';
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
  Sparkles
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

  // Define steps
  const steps: FlexibleParserStep[] = [
    {
      id: 'upload',
      title: 'Upload Excel',
      description: 'Upload your Excel data dictionary file',
      completed: !!excelAnalysis,
      current: currentStepId === 'upload'
    },
    {
      id: 'analyze',
      title: 'Explore Structure',
      description: 'Review your Excel file structure',
      completed: !!excelAnalysis && currentStepId !== 'upload' && currentStepId !== 'analyze',
      current: currentStepId === 'analyze'
    },
    {
      id: 'map',
      title: 'Map Columns',
      description: 'Configure column mappings',
      completed: stepValidation.canProceed && currentStepId !== 'upload' && currentStepId !== 'analyze' && currentStepId !== 'map',
      current: currentStepId === 'map'
    },
    {
      id: 'preview',
      title: 'Preview & Confirm',
      description: 'Review detected tables and relationships',
      completed: !!parseResult && currentStepId === 'result',
      current: currentStepId === 'preview'
    },
    {
      id: 'result',
      title: 'View ERD',
      description: 'Explore your generated ERD',
      completed: false,
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

  // Calculate progress
  const completedSteps = steps.filter(step => step.completed).length;
  const progress = (completedSteps / steps.length) * 100;

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
          
          {/* Step indicators */}
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step.completed ? 'bg-green-600 text-white' :
                  step.current ? 'bg-blue-600 text-white' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {step.completed ? <CheckCircle className="h-4 w-4" /> : index + 1}
                </div>
                <span className={`text-xs mt-1 ${step.current ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {step.title}
                </span>
              </div>
            ))}
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
              
              <div className="flex justify-end">
                <Button onClick={handleProceedToMapping}>
                  <Settings className="h-4 w-4 mr-2" />
                  Configure Mappings
                </Button>
              </div>
            </div>
          )}

          {currentStepId === 'map' && excelAnalysis && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium">Column Mapping</h2>
                <Button variant="outline" onClick={() => setCurrentStepId('analyze')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Analysis
                </Button>
              </div>
              
              <ColumnMapper
                sheets={excelAnalysis.sheets}
                mappings={mappings}
                onMappingsChange={handleMappingsChange}
                onValidationChange={handleValidationChange}
                suggestions={excelAnalysis.analysis}
              />
              
              <div className="flex justify-end">
                <Button 
                  onClick={handleProceedToPreview}
                  disabled={!stepValidation.canProceed || loading.parsing}
                >
                  {loading.parsing ? (
                    "Parsing..."
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Preview Results
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {currentStepId === 'preview' && parseResult && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium">Preview & Confirm</h2>
                <Button variant="outline" onClick={() => setCurrentStepId('map')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Edit Mappings
                </Button>
              </div>
              
              <MappingPreview
                parseResult={parseResult}
                mappings={mappings}
                onEditMappings={handleEditMappings}
                onConfirm={handleGenerateERD}
              />
            </div>
          )}

          {currentStepId === 'result' && parseResult && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium">Your ERD</h2>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCurrentStepId('preview')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Preview
                  </Button>
                  <Button variant="outline" onClick={handleStartOver}>
                    Upload New File
                  </Button>
                </div>
              </div>
              
              {/* Use existing MetadataPreview component to show results */}
              <MetadataPreview 
                tables={parseResult.tables}
                errors={parseResult.errors}
              />
              
              {/* Success message */}
              <Card className="bg-green-50 border-green-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-green-700 font-medium">
                      ERD Generated Successfully!
                    </span>
                  </div>
                  <p className="text-sm text-green-600 mt-1">
                    Your Excel data dictionary has been parsed using custom mappings. 
                    You can now integrate this with the main ERD generation flow.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default FlexibleParser;