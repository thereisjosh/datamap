import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Move,
  Info
} from 'lucide-react';

interface DiagramControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  onTogglePan?: () => void;
  currentZoom?: number;
  isPanEnabled?: boolean;
  className?: string;
}

const DiagramControls: React.FC<DiagramControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  onTogglePan,
  currentZoom = 100,
  isPanEnabled = true,
  className = ''
}) => {
  const formatZoom = (zoom: number) => `${Math.round(zoom)}%`;

  return (
    <div className={`diagram-controls ${className}`}>
      {/* Zoom Level Indicator */}
      <div className="zoom-indicator">
        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-background/90 backdrop-blur-sm rounded px-2 py-1 border">
          <Info className="h-3 w-3" />
          <span>{formatZoom(currentZoom)}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="control-buttons">
        <div className="flex flex-col gap-1 bg-background/90 backdrop-blur-sm rounded-lg border p-1 shadow-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomIn}
            className="h-8 w-8 p-0"
            title="Zoom In (+)"
            aria-label="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomOut}
            className="h-8 w-8 p-0"
            title="Zoom Out (-)"
            aria-label="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          
          <div className="w-6 h-px bg-border my-1" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onFit}
            className="h-8 w-8 p-0"
            title="Fit to Screen (F)"
            aria-label="Fit to Screen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 w-8 p-0"
            title="Reset View (0)"
            aria-label="Reset View"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          
          {onTogglePan && (
            <>
              <div className="w-6 h-px bg-border my-1" />
              <Button
                variant={isPanEnabled ? "default" : "ghost"}
                size="sm"
                onClick={onTogglePan}
                className="h-8 w-8 p-0"
                title="Toggle Pan Mode (Space)"
                aria-label="Toggle Pan Mode"
              >
                <Move className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiagramControls;