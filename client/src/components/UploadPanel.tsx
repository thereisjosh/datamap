import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileSpreadsheet, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { api, type ParseExcelResponse } from "@/lib/api";

interface UploadPanelProps {
  onFileUpload: (data: ParseExcelResponse) => void;
  isLoading?: boolean;
  error?: string | null;
  onError: (error: string) => void;
}

const UploadPanel = ({
  onFileUpload,
  isLoading = false,
  error = null,
  onError,
}: UploadPanelProps) => {
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setIsProcessing(true);
        setUploadProgress(0);

        try {
          // Simulate upload progress
          const progressInterval = setInterval(() => {
            setUploadProgress(prev => {
              if (prev >= 90) {
                clearInterval(progressInterval);
                return 90;
              }
              return prev + 10;
            });
          }, 200);

          const result = await api.parseExcelFile(file);
          
          clearInterval(progressInterval);
          setUploadProgress(100);
          
          setTimeout(() => {
            onFileUpload(result);
            setIsProcessing(false);
            setUploadProgress(0);
          }, 500);

        } catch (error) {
          setIsProcessing(false);
          setUploadProgress(0);
          onError(error instanceof Error ? error.message : 'Failed to process file');
        }
      }
    },
    [onFileUpload, onError],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
          ".xlsx",
        ],
      },
      maxSize: 5 * 1024 * 1024, // 5MB
      multiple: false,
    });

  React.useEffect(() => {
    setIsDragging(isDragActive);
  }, [isDragActive]);

  const downloadSampleFile = () => {
    // Create a sample Excel file structure description
    const sampleContent = `Sample Excel Data Dictionary Structure:

Sheet 1: TableMetadata
- Physical Table Name: User, Order, Product
- Data Kind: Entity

Sheet 2: AttributeMetadata  
- Physical Table Name: User, User, Order, Order, Product
- Attribute Name: Id, Email, Id, UserId, Id
- Type: int, varchar, int, int, int
- Is Autonumber: true, false, true, false, true
- Reference Table: , , , User, 
- Column Table: , , , Id, `;

    const blob = new Blob([sampleContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-data-dictionary-structure.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentlyLoading = isLoading || isProcessing;

  return (
    <div className="w-full max-w-2xl mx-auto p-5 bg-background rounded-md shadow-sm border border-border">
      <h2 className="text-xl font-medium mb-4 text-center text-foreground">
        Upload Excel Data Dictionary
      </h2>

      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors
          ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
          ${isDragReject ? "border-destructive bg-destructive/5" : ""}
          ${currentlyLoading ? "opacity-50 pointer-events-none" : ""}
        `}
        role="button"
        tabIndex={0}
        aria-label="Upload Excel file area"
      >
        <input {...getInputProps()} aria-describedby="file-requirements" />

        <div className="flex flex-col items-center justify-center space-y-4">
          {currentlyLoading ? (
            <>
              <Upload
                className="h-12 w-12 text-primary animate-pulse"
                aria-hidden="true"
              />
              <p
                className="text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {isProcessing ? "Processing file..." : "Uploading file..."}
              </p>
              <Progress
                value={uploadProgress}
                className="w-64"
                aria-label="Upload progress"
              />
            </>
          ) : (
            <>
              {isDragReject ? (
                <>
                  <AlertCircle
                    className="h-12 w-12 text-destructive"
                    aria-hidden="true"
                  />
                  <p
                    className="text-lg font-medium text-destructive"
                    role="alert"
                  >
                    Invalid file type or size
                  </p>
                  <p
                    className="text-sm text-muted-foreground"
                    id="file-requirements"
                  >
                    Please select a .xlsx file under 5MB
                  </p>
                </>
              ) : (
                <>
                  <FileSpreadsheet
                    className="h-12 w-12 text-primary"
                    aria-hidden="true"
                  />
                  <p className="text-lg font-medium text-foreground">
                    {isDragActive
                      ? "Drop the Excel file here"
                      : "Drag & drop your Excel file here"}
                  </p>
                  <p
                    className="text-sm text-muted-foreground"
                    id="file-requirements"
                  >
                    .xlsx files only, max 5MB
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2"
                    aria-label="Browse for Excel file"
                  >
                    Select Excel File
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 text-center">
        <Button
          variant="link"
          className="text-primary flex items-center gap-1"
          onClick={downloadSampleFile}
          aria-label="Download sample Excel dictionary file"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download Sample Structure
        </Button>
      </div>

      <div className="mt-4 text-sm text-muted-foreground">
        <p>
          Upload an Excel file containing your database tables and columns. The
          file should include TableMetadata and AttributeMetadata sheets with
          table names, column names, data types, and primary/foreign key indicators.
        </p>
      </div>
    </div>
  );
};

export default UploadPanel;
