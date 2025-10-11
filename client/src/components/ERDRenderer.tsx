import React, { useEffect, useState, memo, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Download, Copy, AlertCircle, ZoomIn, ZoomOut, RotateCcw, Move, Database } from 'lucide-react';
import CodemasterPanel from './erd/CodemasterPanel';
import type { CodemasterMapping } from '@/components/excel/types';
import './ERDRenderer.css';

interface ERDRendererProps {
  mermaidCode?: string;
  isDarkMode?: boolean;
  isLoading?: boolean;
  domain?: string;
  domainResults?: Record<string, any>;
  onExternalTableClick?: (tableName: string, targetDomain: string) => void;
  onTableSelectionComplete?: (tableName: string) => void;
  selectedTableFromSearch?: string | null;
  codemasterMappings?: CodemasterMapping[];
  onFieldClick?: (tableName: string, fieldName: string) => void;
}


const ERDRenderer: React.FC<ERDRendererProps> = ({
  mermaidCode = '',
  isDarkMode = false,
  isLoading = false,
  domain,
  domainResults = {},
  onExternalTableClick,
  onTableSelectionComplete,
  selectedTableFromSearch = null,
  codemasterMappings = [],
  onFieldClick
}) => {
  
  // Track last processed selectedTableFromSearch to prevent duplicate processing
  const lastProcessedSearchTable = useRef<string | null>(null);
  
  // State for Direct SVG Rendering pattern
  const [svgContent, setSvgContent] = useState<string>('');
  const [originalSvgContent, setOriginalSvgContent] = useState<string>(''); // Store original content separately
  const [baseSvgContent, setBaseSvgContent] = useState<string>(''); // Store clean content
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [needsCenteringAfterStyling, setNeedsCenteringAfterStyling] = useState<{ tableName: string; } | null>(null);
  const [isInitialStylingComplete, setIsInitialStylingComplete] = useState<boolean>(false);
  
  // Search-specific state for immediate centering
  const [searchTargetTable, setSearchTargetTable] = useState<string | null>(null);
  const [isSearchTriggered, setIsSearchTriggered] = useState<boolean>(false);
  
  // Tooltip state for codemaster values
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
    tableName: string;
    columnName: string;
    calculatedWidth?: number;
    calculatedHeight?: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    content: '',
    tableName: '',
    columnName: ''
  });

  // Drag state for tooltip
  const [isDraggingTooltip, setIsDraggingTooltip] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  
  // Transform-based Pan-Zoom state and refs
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const transformGroupRef = useRef<SVGGElement | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(1.0);
  const [currentPan, setCurrentPan] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [lastClickPosition, setLastClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [isPanEnabled, setIsPanEnabled] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [svgBounds, setSvgBounds] = useState<{x: number, y: number, width: number, height: number}>({x: 0, y: 0, width: 800, height: 600});
  
  // Enhanced zoom and focus state
  const [viewMode, setViewMode] = useState<'overview' | 'detail' | 'focus'>('overview');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [highlightedTables, setHighlightedTables] = useState<Set<string>>(new Set());
  const [highlightedRelationships, setHighlightedRelationships] = useState<Set<string>>(new Set());
  
  // Layout and display options
  const [isCompactView, setIsCompactView] = useState<boolean>(false);
  const [showRelationshipLabels, setShowRelationshipLabels] = useState<boolean>(true);
  const [showAttributeDetails, setShowAttributeDetails] = useState<boolean>(true);
  
  // Codemaster panel state
  const [isCodemasterPanelVisible, setIsCodemasterPanelVisible] = useState<boolean>(false);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  
  // Debugging state
  const [clickableTablesCount, setClickableTablesCount] = useState<number>(0);
  const [detectedTables, setDetectedTables] = useState<string[]>([]);
  
  // Pan sensitivity configuration for responsive trackpad/mouse dragging
  const PAN_BASE_SENSITIVITY = 2.5; // Base multiplier for all platforms
  const PAN_TRACKPAD_MULTIPLIER = 1.5; // Additional multiplier for trackpads
  const PAN_ZOOM_SENSITIVITY_FACTOR = 0.3; // How much zoom affects sensitivity
  
  // Zoom sensitivity configuration for responsive trackpad/mouse zooming
  const ZOOM_BASE_SENSITIVITY = 0.002; // Base zoom sensitivity (2.5x more responsive than 0.0008)
  const ZOOM_TRACKPAD_MULTIPLIER = 2.8; // Additional multiplier for trackpads (increased for better responsiveness)
  const ZOOM_MAX_SENSITIVITY = 0.006; // Maximum sensitivity increased to accommodate higher trackpad multiplier
  
  // Clean rendering - no domain styling

  // Initialize Mermaid with industry standard responsive configuration
  useEffect(() => {
    try {
      mermaid.initialize({
        startOnLoad: false, // Critical for React integration
        theme: isDarkMode ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'Arial, sans-serif',
        // Ghost table styling via themeCSS (valid hex colors for Mermaid compatibility)
        themeCSS: `
          /* Ghost table styling using verified entity ID selectors */
          .ghostTable .er.entityBox { 
            fill: #e5e7eb !important; 
            stroke: #9ca3af !important;
            stroke-width: 2px !important;
          }
          .ghostTable .er.entityBox text,
          .ghostTable text { 
            fill: #6b7280 !important;
            font-style: italic !important;
          }
          /* Environment-specific entity ID targeting */
          [id^="entity-"] .ghostTable .er.entityBox { 
            fill: #e5e7eb !important; 
            stroke: #9ca3af !important;
            stroke-width: 2px !important;
          }
          /* Hover effects for ghost tables */
          .ghostTable .er.entityBox:hover {
            stroke: #3b82f6 !important;
            fill: #dbeafe !important;
            cursor: pointer !important;
          }
          
          /* ERD Relationship Line Highlighting Styles - Updated for real Mermaid ERD structure */
          g.is-highlighted rect, 
          g.is-highlighted foreignObject { 
            stroke: #22c55e !important; 
            stroke-width: 3px !important; 
            fill: #f0fdf4 !important; 
            filter: drop-shadow(0 0 6px rgba(34, 197, 94, 0.4)) !important;
          }
          
          path.is-highlighted { 
            stroke: #22c55e !important; 
            stroke-width: 3px !important; 
            opacity: 1 !important;
            filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.6)) !important;
          }
          
          text.is-highlighted { 
            fill: #22c55e !important; 
            font-weight: 600 !important; 
          }
          
          /* Dim non-highlighted elements when ERD selection is active */
          .has-erd-selection g[id*="entity"]:not(.is-highlighted) { 
            opacity: 0.4 !important; 
            transition: opacity 0.3s ease !important;
          }
          .has-erd-selection g[data-table-name]:not(.is-highlighted) { 
            opacity: 0.4 !important; 
            transition: opacity 0.3s ease !important;
          }
          .has-erd-selection g.table-entity:not(.is-highlighted) { 
            opacity: 0.4 !important; 
            transition: opacity 0.3s ease !important;
          }
          .has-erd-selection path:not(.is-highlighted) { 
            opacity: 0.2 !important; 
            transition: opacity 0.3s ease !important;
          }
          .has-erd-selection text:not(.is-highlighted) { 
            opacity: 0.3 !important; 
            transition: opacity 0.3s ease !important;
          }
        `,
        // Industry standard responsive configuration
        er: {
          layoutDirection: 'TB',
        },
      });
    } catch (err) {
    }
  }, [isDarkMode]);

  // SVG-native transform-based pan-zoom functions (NO CSS transforms)
  const zoomToScale = useCallback((scale: number, centerX?: number, centerY?: number) => {
    
    if (!svgContainerRef.current) {
      return;
    }
    
    const container = svgContainerRef.current;
    
    // ALWAYS search for live element instead of using potentially stale refs
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    
    if (!transformGroup) {
      const elementsWithIds = container.querySelectorAll('[id]');
      elementsWithIds.forEach((el, i) => {
      });
      return;
    }
    
    // Verify element is connected to the document
    const isConnected = document.contains(transformGroup);
    
    if (!isConnected) {
      return;
    }
    
    
    // Validate input parameters
    if (!isFinite(scale) || scale <= 0) {
      return;
    }
    
    // Get container dimensions for viewport center calculation
    const containerRect = container.getBoundingClientRect();
    
    // Get SVG element and its viewBox (SVG coordinate space)
    const svg = container.querySelector('svg') as SVGSVGElement;
    const viewBoxAttr = svg.getAttribute('viewBox');
    
    // Parse viewBox to understand SVG coordinate system
    let viewBoxX = 0, viewBoxY = 0, viewBoxWidth = 800, viewBoxHeight = 600; // defaults
    if (viewBoxAttr) {
      const viewBoxParts = viewBoxAttr.split(' ').map(Number);
      if (viewBoxParts.length === 4) {
        [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = viewBoxParts;
      }
    }
    
    // Calculate viewport center in SVG coordinate space
    const viewportCenterX = viewBoxX + viewBoxWidth / 2;
    const viewportCenterY = viewBoxY + viewBoxHeight / 2;
    
    // Determine the point to center on
    let targetCenterX, targetCenterY;
    
    if (centerX !== undefined && centerY !== undefined) {
      // Use provided SVG coordinates (already in SVG coordinate space)
      targetCenterX = centerX;
      targetCenterY = centerY;
    } else {
      // No specific target - zoom on current viewport center
      targetCenterX = viewportCenterX;
      targetCenterY = viewportCenterY; 
    }
    
    // SVG transform calculation for centering:
    // 1. First translate to move target point to origin (0,0)
    // 2. Then scale around origin
    // 3. Then translate to move origin to viewport center
    const translateToOriginX = -targetCenterX;
    const translateToOriginY = -targetCenterY;
    const translateToCenterX = viewportCenterX;
    const translateToCenterY = viewportCenterY;
    
    // Combine transforms: final = translate(center) * scale * translate(-target)
    // In SVG attribute format: "translate(centerX, centerY) scale(scale) translate(-targetX, -targetY)"
    // But SVG applies transforms right-to-left, so we write: "translate(finalX, finalY) scale(scale)"
    
    // Calculate final translation that incorporates both the centering and scaling
    const finalTranslateX = translateToCenterX + translateToOriginX * scale;
    const finalTranslateY = translateToCenterY + translateToOriginY * scale;
    
    // Validate calculations before applying
    if (!isFinite(finalTranslateX) || !isFinite(finalTranslateY) || !isFinite(scale)) {
      return;
    }
    
    // Create the SVG transform string (ONLY SVG, no CSS)
    const svgTransformString = `translate(${finalTranslateX}, ${finalTranslateY}) scale(${scale})`;
    
    
    // Clear any CSS transforms that might interfere
    (transformGroup as any).style.transform = '';
    
    // Apply ONLY SVG transform attribute (no CSS)
    transformGroup.setAttribute('transform', svgTransformString);
    
    // Update state for consistency
    setCurrentZoom(scale);
    setCurrentPan({ x: finalTranslateX, y: finalTranslateY });
    
    // Verify transform was applied
    setTimeout(() => {
      const actualTransform = transformGroup.getAttribute('transform');
      
      // Check that no CSS transforms are applied
      const computedStyles = window.getComputedStyle(transformGroup);
      
      // Check SVG dimensions (should remain stable)
      const svgRect = svg.getBoundingClientRect();
      
      if (svgRect?.width === 0 || svgRect?.height === 0) {
      } else {
      }
    }, 10);
  }, [currentZoom, currentPan]);

  
  const panToPosition = useCallback((deltaX: number, deltaY: number) => {
    if (!svgContainerRef.current) return;
    
    // Always search for live element
    const container = svgContainerRef.current;
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    
    if (!transformGroup || !document.contains(transformGroup)) {
      return;
    }
    
    // Update pan position
    const newPanX = currentPan.x + deltaX;
    const newPanY = currentPan.y + deltaY;
    
    // Validate pan values
    if (!isFinite(newPanX) || !isFinite(newPanY)) {
      return;
    }
    
    
    // Apply ONLY SVG transform (no CSS)
    const svgTransformString = `translate(${newPanX}, ${newPanY}) scale(${currentZoom})`;
    
    // Clear CSS transforms to prevent conflicts
    (transformGroup as any).style.transform = '';
    
    // Apply SVG transform
    transformGroup.setAttribute('transform', svgTransformString);
    
    // Update state
    setCurrentPan({ x: newPanX, y: newPanY });
  }, [currentPan, currentZoom]);

  // Utility function to convert client coordinates to current transformed SVG coordinate space
  const getTransformedCursorPosition = useCallback((clientX: number, clientY: number, container: HTMLDivElement) => {
    const svg = container.querySelector('svg') as SVGSVGElement;
    if (!svg) return { x: clientX, y: clientY };

    // Get container rect for relative positioning
    const rect = container.getBoundingClientRect();
    const containerX = clientX - rect.left;
    const containerY = clientY - rect.top;

    // Create SVG point for proper coordinate transformation
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = containerX;
    svgPoint.y = containerY;

    // Get the transform group and its current transformation matrix
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    if (!transformGroup) return { x: containerX, y: containerY };

    try {
      // Get the inverse of the current transformation matrix
      const ctm = transformGroup.getCTM();
      if (ctm) {
        // Transform the point using the inverse matrix to get coordinates in transformed space
        const transformedPoint = svgPoint.matrixTransform(ctm.inverse());
        return { x: transformedPoint.x, y: transformedPoint.y };
      }
    } catch (error) {
    }

    // Fallback: basic coordinate conversion using current zoom and pan
    const adjustedX = (containerX - currentPan.x) / currentZoom;
    const adjustedY = (containerY - currentPan.y) / currentZoom;
    
    return { x: adjustedX, y: adjustedY };
  }, [currentZoom, currentPan]);

  // Industry standard cursor-centered zoom using proper transformation matrix composition
  const zoomAtCursor = useCallback((newZoom: number, cursorX: number, cursorY: number) => {
    if (!svgContainerRef.current) return;
    
    const container = svgContainerRef.current;
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    
    if (!transformGroup || !document.contains(transformGroup)) {
      return;
    }

    // Validate inputs
    if (!isFinite(newZoom) || newZoom <= 0) {
      return;
    }

    // Get cursor position in current transformed coordinate space
    const cursorPos = getTransformedCursorPosition(cursorX, cursorY, container);
    

    // Calculate zoom factor
    const zoomFactor = newZoom / currentZoom;
    
    // Industry standard transformation sequence: translate(cursor) * scale(factor) * translate(-cursor)
    // This ensures the point under the cursor stays fixed during zoom
    
    // Current transform: translate(currentPan.x, currentPan.y) scale(currentZoom)
    // We need to compose this with our cursor-centered zoom transform
    
    // Calculate new pan position using the cursor as the fixed point
    // Formula: newPan = cursor + (oldPan - cursor) * zoomFactor
    const newPanX = cursorPos.x + (currentPan.x - cursorPos.x) * zoomFactor;
    const newPanY = cursorPos.y + (currentPan.y - cursorPos.y) * zoomFactor;

    // Validate calculations
    if (!isFinite(newPanX) || !isFinite(newPanY)) {
      return;
    }

    // Apply the new transform
    const svgTransformString = `translate(${newPanX}, ${newPanY}) scale(${newZoom})`;
    
    
    // Clear CSS transforms to prevent conflicts
    (transformGroup as any).style.transform = '';
    
    // Apply SVG transform
    transformGroup.setAttribute('transform', svgTransformString);
    
    // Update state
    setCurrentZoom(newZoom);
    setCurrentPan({ x: newPanX, y: newPanY });
    
  }, [currentZoom, currentPan, getTransformedCursorPosition]);

  // Note: Removed visual debugging markers to prevent inconsistent red dots

  // Add professional selection corner handles aligned with actual content dimensions
  const addSelectionHandles = useCallback((tableName: string) => {
    if (!svgContainerRef.current) return;
    
    const container = svgContainerRef.current;
    const svg = container.querySelector('svg') as SVGSVGElement;
    if (!svg) return;
    
    // Remove any existing handles
    const existingHandles = svg.querySelectorAll('.selection-handle');
    existingHandles.forEach(handle => handle.remove());
    
    // Find the selected table element
    const tableElement = svg.querySelector(`g[data-table-name="${tableName}"]`);
    if (!tableElement) return;
    
    // Get the HTML div inside foreignObject - this is what users actually see
    const foreignObject = tableElement.querySelector('foreignObject');
    const div = tableElement.querySelector('div') as HTMLDivElement;
    
    if (!foreignObject || !div) {
      return;
    }
    
    // Get position from foreignObject
    const foreignX = parseFloat(foreignObject.getAttribute('x') || '0');
    const foreignY = parseFloat(foreignObject.getAttribute('y') || '0');
    
    // Use simple original dimensions for selection handles
    // This matches the div width constraint we apply for selected tables
    const storedOriginalWidth = foreignObject.getAttribute('data-original-width');
    const originalWidth = storedOriginalWidth ? parseFloat(storedOriginalWidth) : 120;
    const originalHeight = parseFloat(foreignObject.getAttribute('height') || '50');
    
    
    // Simple positioning - use foreignObject coordinates
    const divX = foreignX;
    const divY = foreignY;
    const divWidth = Math.max(originalWidth, 120); // Match the constraint we apply to selected div
    const divHeight = Math.max(originalHeight, 40);
    
    
    // Create corner handles aligned with actual visible table content
    const handleSize = 6;
    const handleColor = '#007AFF';
    const positions = [
      { x: divX - handleSize/2, y: divY - handleSize/2 }, // Top-left
      { x: divX + divWidth - handleSize/2, y: divY - handleSize/2 }, // Top-right
      { x: divX - handleSize/2, y: divY + divHeight - handleSize/2 }, // Bottom-left
      { x: divX + divWidth - handleSize/2, y: divY + divHeight - handleSize/2 }, // Bottom-right
    ];
    
    positions.forEach((pos, index) => {
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      handle.setAttribute('x', pos.x.toString());
      handle.setAttribute('y', pos.y.toString());
      handle.setAttribute('width', handleSize.toString());
      handle.setAttribute('height', handleSize.toString());
      handle.setAttribute('fill', handleColor);
      handle.setAttribute('stroke', 'white');
      handle.setAttribute('stroke-width', '1');
      handle.setAttribute('class', 'selection-handle');
      handle.setAttribute('rx', '1');
      handle.setAttribute('pointer-events', 'none');
      
      // Add to SVG (outside transform group for fixed size)
      svg.appendChild(handle);
    });
    
  }, []);

  // Remove selection handles
  const removeSelectionHandles = useCallback(() => {
    if (!svgContainerRef.current) return;
    
    const container = svgContainerRef.current;
    const svg = container.querySelector('svg') as SVGSVGElement;
    if (!svg) return;
    
    const existingHandles = svg.querySelectorAll('.selection-handle');
    existingHandles.forEach(handle => handle.remove());
  }, []);

  // Helper function to get table center coordinates
  const getTableCenterCoordinates = useCallback((tableName: string): { x: number; y: number } | null => {
    if (!svgContainerRef.current) {
      return null;
    }

    const svgContainer = svgContainerRef.current;
    const svg = svgContainer.querySelector('svg') as SVGSVGElement;
    if (!svg) {
      return null;
    }

    // Try multiple strategies to find the table entity (same logic as centerOnTable)
    let tableEntity: Element | null = null;
    
    // Strategy 1: Use data-table-name attribute
    tableEntity = svg.querySelector(`g[class*="node"][data-table-name="${tableName}"]`) || 
                  svg.querySelector(`g[data-table-name="${tableName}"]`);
    
    // Strategy 2: Use Mermaid-generated ID
    if (!tableEntity) {
      tableEntity = svg.querySelector(`g[id*="entity-${tableName}-"]`);
    }
    
    // Strategy 3: Search by text content in nodeLabel spans
    if (!tableEntity) {
      const nodeLabels = Array.from(svg.querySelectorAll('span.nodeLabel'));
      for (const label of nodeLabels) {
        if (label.textContent?.trim() === tableName) {
          tableEntity = label.closest('g[class*="node"]');
          if (tableEntity) break;
        }
      }
    }

    if (!tableEntity) {
      return null;
    }

    // Calculate center coordinates using the same logic as centerOnTable
    let elementCenterX = 0;
    let elementCenterY = 0;
    let coordinatesFound = false;
    
    // Strategy 1: getBBox() - Most reliable for SVG elements
    try {
      if (tableEntity.ownerDocument && typeof tableEntity.getBoundingClientRect === 'function') {
        const bbox = (tableEntity as SVGGraphicsElement).getBBox();
        
        if (bbox && bbox.width > 0 && bbox.height > 0 && 
            isFinite(bbox.x) && isFinite(bbox.y) &&
            bbox.x > -10000 && bbox.x < 10000 &&
            bbox.y > -10000 && bbox.y < 10000) {
          
          // Get transform coordinates
          let transformX = 0;
          let transformY = 0;
          
          const transform = tableEntity.getAttribute('transform');
          if (transform) {
            const translateMatch = transform.match(/translate\(([^,\)]+)(?:,\s*([^,\)]+))?\)/);
            if (translateMatch) {
              transformX = parseFloat(translateMatch[1]) || 0;
              transformY = parseFloat(translateMatch[2]) || 0;
            }
          }
          
          // Calculate center in SVG coordinate space
          elementCenterX = transformX + (bbox.x + bbox.width / 2);
          elementCenterY = transformY + (bbox.y + bbox.height / 2);
          coordinatesFound = true;
        }
      }
    } catch (bboxError) {
      // Fall through to strategy 2
    }
    
    // Strategy 2: Transform attributes fallback
    if (!coordinatesFound) {
      const transform = tableEntity.getAttribute('transform');
      if (transform) {
        const translateMatch = transform.match(/translate\(([^,\)]+)(?:,\s*([^,\)]+))?\)/);
        if (translateMatch) {
          const transformX = parseFloat(translateMatch[1]) || 0;
          const transformY = parseFloat(translateMatch[2]) || 0;
          
          if (isFinite(transformX) && isFinite(transformY) &&
              transformX > -10000 && transformX < 10000 &&
              transformY > -10000 && transformY < 10000) {
            elementCenterX = transformX;
            elementCenterY = transformY;
            coordinatesFound = true;
          }
        }
      }
    }
    
    // Strategy 3: ForeignObject fallback
    if (!coordinatesFound) {
      const foreignObjects = Array.from(tableEntity.querySelectorAll('foreignObject'));
      if (foreignObjects.length > 0) {
        const foreignObject = foreignObjects[0];
        const foreignX = parseFloat(foreignObject.getAttribute('x') || '0');
        const foreignY = parseFloat(foreignObject.getAttribute('y') || '0');
        const foreignWidth = parseFloat(foreignObject.getAttribute('width') || '0');
        const foreignHeight = parseFloat(foreignObject.getAttribute('height') || '0');
        
        if (foreignWidth > 0 && foreignHeight > 0) {
          elementCenterX = foreignX + foreignWidth / 2;
          elementCenterY = foreignY + foreignHeight / 2;
          coordinatesFound = true;
        }
      }
    }

    return coordinatesFound ? { x: elementCenterX, y: elementCenterY } : null;
  }, []);

  // Parse relationships from Mermaid diagram code with enhanced pattern matching
  const parseRelationships = useCallback((diagramCode: string): Map<string, string[]> => {
    const relationships = new Map<string, string[]>();
    const lines = diagramCode.split('\n');
    
    
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      
      // Skip empty lines and table definitions (but NOT relationship lines)
      if (!trimmedLine || 
          trimmedLine.endsWith('{') || trimmedLine === '}' ||
          trimmedLine.startsWith('erDiagram') || trimmedLine.startsWith('classDiagram') ||
          trimmedLine.startsWith('%%') || trimmedLine.startsWith('classDef')) {
        if (trimmedLine.includes('PaymentTransaction')) {
        }
        continue;
      }
      
      let matched = false;
      
      // Enhanced ERD relationship patterns - covers all Mermaid ERD syntax
      const patterns = [
        // EXACT pattern from logs: BankStatementAllocation }o--|| PaymentTransaction : "FK PaymentTransactionId"
        /(\w+)\s*\}o--\|\|\s*(\w+)\s*:\s*"[^"]*"/,
        // Standard ERD patterns: TableA ||--o{ TableB : relationship
        /(\w+)\s*\|\|--o\{\s*(\w+)\s*:\s*"[^"]*"/,
        // Without quotes: TableA }o--|| TableB : relationship
        /(\w+)\s*\}o--\|\|\s*(\w+)\s*:\s*[^\n]*/,
        // One-to-one: TableA ||--|| TableB
        /(\w+)\s*\|\|--\|\|\s*(\w+)/,
        // Many-to-many: TableA }o--o{ TableB
        /(\w+)\s*\}o--o\{\s*(\w+)/,
        // Simple patterns without labels
        /(\w+)\s*\}o--\|\|\s*(\w+)/,
        /(\w+)\s*\|\|--o\{\s*(\w+)/,
        // Flowchart style: TableA --> TableB
        /(\w+)\s*-->\s*(\w+)/,
        // Simple connection: TableA -- TableB
        /(\w+)\s*--\s*(\w+)/,
      ];
      
      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        
        // Debug: Show successful matches only (suppress excessive REGEX FAIL logs)
        if (match && (trimmedLine.includes('PaymentTransaction') || trimmedLine.includes('BankStatementAllocation'))) {
        }
        
        if (match) {
          const [, sourceTable, targetTable] = match;
          
          if (sourceTable && targetTable && sourceTable !== targetTable) {
            // Add bidirectional relationships
            if (!relationships.has(sourceTable)) {
              relationships.set(sourceTable, []);
            }
            if (!relationships.has(targetTable)) {
              relationships.set(targetTable, []);
            }
            
            relationships.get(sourceTable)?.push(targetTable);
            relationships.get(targetTable)?.push(sourceTable);
            
            // Found relationship: ${sourceTable} <-> ${targetTable}
            matched = true;
            break;
          }
        }
      }
      
      if (!matched && (trimmedLine.includes('|') || trimmedLine.includes('-'))) {
      }
    }
    
    
    return relationships;
  }, []);

  // Bind ERD-specific event handlers after SVG is rendered (Mermaid best practice)
  // Get codemaster metadata for the current domain
  const getCurrentCodemasterMetadata = useCallback(() => {
    if (!domain || !domainResults[domain]) {
      return {};
    }
    const metadata = domainResults[domain].codemasterMetadata || {};
    return metadata;
  }, [domain, domainResults]);

  // Format codemaster values for tooltip display with ascending sort by code
  const formatCodemasterTooltip = useCallback((values: any[]) => {
    if (!values || values.length === 0) return '';
    
    // Sort by code in ascending order before formatting
    return values
      .sort((a, b) => {
        const codeA = (a.code || '').toString();
        const codeB = (b.code || '').toString();
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      })
      .map(value => {
        const code = value.code || '';
        const description = value.description || '';
        return `${code}: ${description}`;
      })
      .join('\n');
  }, []);

  // Generate comprehensive codemaster tooltip for a table
  const generateTableCodemasterTooltip = useCallback((tableName: string) => {
    const codemasterMetadata = getCurrentCodemasterMetadata();
    const tableCodemasterData = codemasterMetadata[tableName];
    
    if (!tableCodemasterData || Object.keys(tableCodemasterData).length === 0) {
      return '';
    }
    
    const tooltipLines: string[] = [];
    
    Object.keys(tableCodemasterData).forEach(columnName => {
      const values = tableCodemasterData[columnName];
      const formattedValues = formatCodemasterTooltip(values);
      if (formattedValues) {
        // Clean format: just the codemaster values, no column name header
        tooltipLines.push(formattedValues);
      }
    });
    
    return tooltipLines.join('\n\n');
  }, [getCurrentCodemasterMetadata, formatCodemasterTooltip]);

  // Smart positioning to avoid covering the source table and stay within ERD container
  const calculateSmartTooltipPosition = useCallback((tableElement: Element, svgContainer: HTMLDivElement) => {
    const tableRect = tableElement.getBoundingClientRect();
    const containerRect = svgContainer.getBoundingClientRect();
    
    // Get dynamic tooltip dimensions based on container size
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Calculate responsive tooltip dimensions with container size-based scaling
    const isSmallContainer = containerWidth < 800 || containerHeight < 600;
    
    const tooltipWidth = isSmallContainer 
      ? Math.min(Math.max(240, containerWidth * 0.35), containerWidth * 0.6) // Smaller for normal preview
      : Math.min(Math.max(280, containerWidth * 0.3), Math.min(400, containerWidth * 0.8)); // Original for full preview
      
    const tooltipHeight = isSmallContainer
      ? Math.min(Math.max(150, containerHeight * 0.3), containerHeight * 0.5) // Smaller for normal preview  
      : Math.min(Math.max(180, containerHeight * 0.25), Math.min(300, containerHeight * 0.6)); // Original for full preview
      
    const margin = isSmallContainer ? 10 : 20; // Smaller margins for constrained spaces
    
    // Check if container has valid dimensions
    if (containerWidth === 0 || containerHeight === 0) {
      return { 
        x: 50, 
        y: 50, 
        calculatedWidth: 350, 
        calculatedHeight: 250 
      };
    }
    
    // Check if table has valid dimensions
    if (tableRect.width === 0 || tableRect.height === 0) {
      return { 
        x: margin, 
        y: margin, 
        calculatedWidth: tooltipWidth, 
        calculatedHeight: tooltipHeight 
      };
    }
    
    // Convert to relative coordinates within the SVG container - FIXED conversion
    const relativeTableRect = {
      left: tableRect.left - containerRect.left,
      right: tableRect.right - containerRect.left,
      top: tableRect.top - containerRect.top,
      bottom: tableRect.bottom - containerRect.top,
      width: tableRect.width,
      height: tableRect.height
    };
    
    // Validate that table position makes sense
    const isTableLeftValid = relativeTableRect.left >= 0;
    const isTableTopValid = relativeTableRect.top >= 0;
    const isTableRightValid = relativeTableRect.right <= containerWidth;
    const isTableBottomValid = relativeTableRect.bottom <= containerHeight;
    
    if (!isTableLeftValid || !isTableTopValid || !isTableRightValid || !isTableBottomValid) {
      
      // Emergency fallback: position tooltip in top-left with small offset
      const emergencyX = Math.min(margin, containerWidth * 0.1);
      const emergencyY = Math.min(margin, containerHeight * 0.1);
      
      // Convert to document-absolute coordinates
      const absoluteEmergencyX = containerRect.left + emergencyX;
      const absoluteEmergencyY = containerRect.top + emergencyY;
      
      return { 
        x: absoluteEmergencyX, 
        y: absoluteEmergencyY, 
        calculatedWidth: tooltipWidth, 
        calculatedHeight: tooltipHeight 
      };
    }
    
    // Available space in the container (accounting for margins)
    const availableWidth = containerWidth - (margin * 2);
    const availableHeight = containerHeight - (margin * 2);
    
    // Try different positions in order of preference with better spacing
    const positions = [
      // Right side
      {
        x: relativeTableRect.right + margin,
        y: Math.max(margin, relativeTableRect.top),
        preference: 1,
        name: 'right'
      },
      // Left side  
      {
        x: relativeTableRect.left - tooltipWidth - margin,
        y: Math.max(margin, relativeTableRect.top),
        preference: 2,
        name: 'left'
      },
      // Bottom
      {
        x: Math.max(margin, relativeTableRect.left),
        y: relativeTableRect.bottom + margin,
        preference: 3,
        name: 'bottom'
      },
      // Top
      {
        x: Math.max(margin, relativeTableRect.left),
        y: relativeTableRect.top - tooltipHeight - margin,
        preference: 4,
        name: 'top'
      }
    ];
    
    // Find the best position that fits within ERD container
    for (const pos of positions) {
      const fitsHorizontally = pos.x >= margin && (pos.x + tooltipWidth) <= (containerWidth - margin);
      const fitsVertically = pos.y >= margin && (pos.y + tooltipHeight) <= (containerHeight - margin);
      
      if (fitsHorizontally && fitsVertically) {
        // Convert container-relative to document-absolute coordinates
        const absoluteX = containerRect.left + pos.x;
        const absoluteY = containerRect.top + pos.y;
        
        return { 
          x: absoluteX, 
          y: absoluteY, 
          calculatedWidth: tooltipWidth, 
          calculatedHeight: tooltipHeight 
        };
      }
    }
    
    // Fallback: find best fit within container bounds
    const fallbackX = Math.max(margin, Math.min(relativeTableRect.left, containerWidth - tooltipWidth - margin));
    const fallbackY = Math.max(margin, Math.min(relativeTableRect.top + relativeTableRect.height + margin, containerHeight - tooltipHeight - margin));
    
    // Convert container-relative to document-absolute coordinates
    const absoluteFallbackX = containerRect.left + fallbackX;
    const absoluteFallbackY = containerRect.top + fallbackY;
    
    return { 
      x: absoluteFallbackX, 
      y: absoluteFallbackY, 
      calculatedWidth: tooltipWidth, 
      calculatedHeight: tooltipHeight 
    };
  }, []);

  // Separated tooltip binding logic for better organization and timing control
  const bindTooltipHandlers = useCallback((svgContainer: HTMLDivElement, svgRoot: SVGSVGElement) => {

    // Remove existing event listeners to prevent duplicates
    const existingHandlers = svgRoot.querySelectorAll('[data-erd-handler]');
    existingHandlers.forEach(box => {
      box.removeAttribute('data-erd-handler');
    });

    // Find entity boxes - try .er.entityBox first, fallback to g[id*="entity"]
    let entityBoxes = svgRoot.querySelectorAll('.er.entityBox');
    if (entityBoxes.length === 0) {
      entityBoxes = svgRoot.querySelectorAll('g[id*="entity"]');
      
      if (entityBoxes.length === 0) {
        // Try any g elements with classes
        entityBoxes = svgRoot.querySelectorAll('g[class]');
      }
    }

    entityBoxes.forEach(box => {
      // Mark this box as having a handler to prevent duplicates
      box.setAttribute('data-erd-handler', 'true');
      
      box.addEventListener('click', (event) => {
        event.stopPropagation();
        
        // Try to determine entity ID from the box element
        const entityId = getEntityIdFromBox(box as Element);
        if (entityId) {
          highlightERDRelationships(entityId, svgRoot);
        }
      });
    });

    // Add tooltip functionality for codemaster values
    const codemasterMetadata = getCurrentCodemasterMetadata();
    
    // Mermaid uses foreignObject + span elements for text, not SVG text elements
    const columnElements = svgRoot.querySelectorAll('span, text, tspan');
    const foreignObjects = svgRoot.querySelectorAll('foreignObject');
    const spanElements = svgRoot.querySelectorAll('span');
    
    
    // Clean approach: No icons needed - use table click events instead
    // Just log which tables have codemaster data for debugging
    const tablesWithCodemaster = new Set<string>();
    
    Object.keys(codemasterMetadata).forEach(tableName => {
      if (Object.keys(codemasterMetadata[tableName]).length > 0) {
        tablesWithCodemaster.add(tableName);
      }
    });
    
    
    // Remove any existing tooltip icons from previous implementations
    const existingIcons = svgRoot.querySelectorAll('.codemaster-tooltip-icon');
    existingIcons.forEach(icon => icon.remove());
  }, [getCurrentCodemasterMetadata, formatCodemasterTooltip, setTooltip]);

  const bindERDEventHandlers = useCallback(() => {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer) {
      return;
    }

    const svgRoot = svgContainer.querySelector('svg');
    if (!svgRoot) {
      return;
    }
    
    
    // Add small delay to ensure all DOM manipulations are complete
    // This helps with timing issues when switching domains or initial load
    setTimeout(() => {
      bindTooltipHandlers(svgContainer, svgRoot);
    }, 50);
  }, [bindTooltipHandlers]);

  // Reset tooltip when domain changes
  useEffect(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, [domain]);

  // Drag event handlers for tooltip
  useEffect(() => {
    if (!isDraggingTooltip) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Keep tooltip within viewport bounds
      const maxX = window.innerWidth - 400; // tooltip width
      const maxY = window.innerHeight - 300; // tooltip height
      
      const constrainedX = Math.max(0, Math.min(newX, maxX));
      const constrainedY = Math.max(0, Math.min(newY, maxY));
      
      setTooltip(prev => ({
        ...prev,
        x: constrainedX,
        y: constrainedY
      }));
    };

    const handleMouseUp = () => {
      setIsDraggingTooltip(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTooltip, dragOffset]);

  // Handle tooltip drag start
  const handleTooltipDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDraggingTooltip(true);
    setDragOffset({
      x: e.clientX - tooltip.x,
      y: e.clientY - tooltip.y
    });
  }, [tooltip.x, tooltip.y]);

  // Handle tooltip close
  const handleTooltipClose = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // Get entity ID from an entity box element
  const getEntityIdFromBox = useCallback((box: Element): string | null => {
    // Try various methods to get the entity ID
    
    // Method 1: Check data attributes
    const dataId = box.getAttribute('data-id') || box.getAttribute('data-entity-id');
    if (dataId) return dataId;
    
    // Method 2: Check parent group ID
    const parent = box.closest('g[id]');
    if (parent) {
      const id = parent.getAttribute('id') || '';
      // Extract entity name from Mermaid's ID format (e.g., "entity-CUSTOMER-123")
      const match = id.match(/entity-([^-]+)/);
      if (match) return match[1];
    }
    
    // Method 3: Look for text content within the box
    const textElement = box.querySelector('text');
    if (textElement) {
      const text = textElement.textContent?.trim();
      if (text) return text;
    }
    
    return null;
  }, []);

  // Simple relationship line highlighting using CSS classes
  const highlightRelationshipLines = useCallback((tableName: string, svgRoot: Element) => {
    
    // Parse relationships to find connected tables
    const relationships = parseRelationships(mermaidCode);
    const connectedTables = relationships.get(tableName) || [];
    
    
    if (connectedTables.length === 0) {
      return;
    }
    
    // Find the entity using real Mermaid selectors - entities have IDs like "entity-PaymentStatus-7"
    let clickedEntityBox: Element | null = null;
    
    // Try to find by entity ID pattern
    const entityById = svgRoot.querySelector(`g[id*="entity-${entityId}"]`);
    if (entityById) {
      entityById.classList.add('is-highlighted');
      clickedEntityBox = entityById;
    } else {
      // Fallback: try data-table-name attribute
      const entityByDataAttr = svgRoot.querySelector(`g[data-table-name="${entityId}"]`);
      if (entityByDataAttr) {
        entityByDataAttr.classList.add('is-highlighted');
        clickedEntityBox = entityByDataAttr;
      }
    }
    
    if (!clickedEntityBox) {
      return;
    }
    
    // Parse relationships from the original Mermaid ERD code (not rendered SVG)
    if (mermaidCode) {
      const relationshipMap = parseRelationships(mermaidCode);
      const connectedTables = relationshipMap.get(entityId) || [];
      
      
      // Debug: Show all relationships found in the diagram
      
      // Debug: Check if entity appears in any relationships with different case/format
      const entityVariations = [entityId, entityId.toLowerCase(), entityId.toUpperCase()];
      entityVariations.forEach(variation => {
        const found = relationshipMap.get(variation);
        if (found && found.length > 0) {
        }
      });
      
      // Debug: Show a sample of the ERD code to understand the format
      const erdLines = mermaidCode.split('\n').filter(line => 
        line.includes('||') || line.includes('}|') || line.includes('--')
      ).slice(0, 5);
      
      // Highlight connected entities
      connectedTables.forEach(connectedEntity => {
        const connectedElement = svgRoot.querySelector(`g[id*="entity-${connectedEntity}"]`) || 
                                svgRoot.querySelector(`g[data-table-name="${connectedEntity}"]`);
        if (connectedElement) {
          connectedElement.classList.add('is-highlighted');
        }
      });
      
      // Only highlight relationship paths if we actually found connected tables
      let highlightedCount = 0;
      
      if (connectedTables.length > 0) {
        
        // Find and highlight relationship paths
        const allPaths = svgRoot.querySelectorAll('path');
        const entityCenter = getTableCenterCoordinates(entityId);
        
        if (entityCenter) {
          // Get centers of all connected entities
          const connectedCenters = connectedTables.map(connectedEntity => {
            const center = getTableCenterCoordinates(connectedEntity);
            return { entity: connectedEntity, center };
          }).filter(item => item.center !== null);
          
          
          allPaths.forEach((path, index) => {
            try {
              const pathBBox = (path as SVGGraphicsElement).getBBox();
              const pathCenterX = pathBBox.x + pathBBox.width / 2;
              const pathCenterY = pathBBox.y + pathBBox.height / 2;
              
              // Check if this path connects the selected entity to any connected entity
              let connectsEntities = false;
              
              for (const { entity: connectedEntity, center: connectedCenter } of connectedCenters) {
                if (!connectedCenter) continue;
                
                // Calculate distance from path to both entities
                const distanceToSelected = Math.sqrt(
                  Math.pow(pathCenterX - entityCenter.x, 2) + 
                  Math.pow(pathCenterY - entityCenter.y, 2)
                );
                
                const distanceToConnected = Math.sqrt(
                  Math.pow(pathCenterX - connectedCenter.x, 2) + 
                  Math.pow(pathCenterY - connectedCenter.y, 2)
                );
                
                // If path is close to both entities, it's likely the connecting path
                if (distanceToSelected < 200 && distanceToConnected < 200) {
                  connectsEntities = true;
                  break;
                }
              }
              
              if (connectsEntities) {
                path.classList.add('is-highlighted');
                highlightedCount++;
              }
            } catch (error) {
              // Skip paths that can't be measured
            }
          });
        }
      } else {
      }
      
      // Always add container class to enable dimming when any table is selected
      svgRoot.classList.add('has-erd-selection');
      
      // Debug: Check what elements should be dimmed
      const allEntities = svgRoot.querySelectorAll('g[id*="entity"], g[data-table-name], g.table-entity');
      const highlightedEntities = svgRoot.querySelectorAll('g.is-highlighted');
      
      // Debug: Check CSS classes and selectors
      
      // Test CSS selector matching
      const shouldBeDimmed = svgRoot.querySelectorAll('.has-erd-selection g[id*="entity"]:not(.is-highlighted)');
      const shouldBeDimmed2 = svgRoot.querySelectorAll('.has-erd-selection g[data-table-name]:not(.is-highlighted)');
      const shouldBeDimmed3 = svgRoot.querySelectorAll('.has-erd-selection g.table-entity:not(.is-highlighted)');
      
    }
    
    // Update React state for compatibility with existing system
    setHighlightedRelationships(new Set([entityId]));
  }, [getEntityIdFromBox, mermaidCode, parseRelationships, getTableCenterCoordinates]);

  // Clear ERD relationship highlighting
  const clearERDRelationshipHighlighting = useCallback(() => {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer) return;

    const svgRoot = svgContainer.querySelector('svg');
    if (!svgRoot) return;

    // Remove ERD-specific highlighting classes
    const highlighted = svgRoot.querySelectorAll('.is-highlighted');
    highlighted.forEach(element => {
      element.classList.remove('is-highlighted');
    });
    
    // Remove container selection class
    svgRoot.classList.remove('has-erd-selection');
    
    setHighlightedRelationships(new Set());
  }, []);

  // Enhanced table centering function with improved handling for complex tables
  const centerOnTable = useCallback((tableName: string, retryCount: number = 0) => {
    
    // Enhanced error checking and validation
    if (!tableName || typeof tableName !== 'string') {
      return;
    }
    
    if (!svgContainerRef.current) {
      if (retryCount < 2) {
        setTimeout(() => centerOnTable(tableName, retryCount + 1), 100);
      }
      return;
    }
    
    // Special debugging for problematic tables
    if (tableName.toLowerCase().includes('opportunity')) {
    }
    
    const svgContainer = svgContainerRef.current;
    
    // Always search for live SVG element
    const svg = svgContainer.querySelector('svg') as SVGSVGElement;
    if (!svg) {
      
      // Retry logic for race conditions
      if (retryCount < 2) {
        setTimeout(() => centerOnTable(tableName, retryCount + 1), 50);
      }
      return;
    }
    

    // Try multiple strategies to find the table entity
    let tableEntity: Element | null = null;
    
    
    // Strategy 1: Use data-table-name attribute (set during styling)
    tableEntity = svg.querySelector(`g[class*="node"][data-table-name="${tableName}"]`) || 
                  svg.querySelector(`g[data-table-name="${tableName}"]`);
    
    if (tableEntity) {
    } else {
      
      // Debug: Show all elements with data-table-name
      const allDataElements = Array.from(svg.querySelectorAll('g[data-table-name]'));
      allDataElements.slice(0, 5).forEach((el, i) => {
      });
    }
    
    // Strategy 2: Use Mermaid-generated ID (more reliable)
    if (!tableEntity) {
      tableEntity = svg.querySelector(`g[id*="entity-${tableName}-"]`);
      
      if (tableEntity) {
      } else {
        
        // Debug: Show all elements with entity IDs
        const allEntityIds = Array.from(svg.querySelectorAll('g[id*="entity-"]'));
        allEntityIds.slice(0, 5).forEach((el, i) => {
        });
      }
    }
    
    // Strategy 3: Search by text content in nodeLabel spans
    if (!tableEntity) {
      const nodeLabels = Array.from(svg.querySelectorAll('span.nodeLabel'));
      
      // Show first few nodeLabel contents for debugging
      nodeLabels.slice(0, 5).forEach((label, i) => {
      });
      
      for (const label of nodeLabels) {
        if (label.textContent?.trim() === tableName) {
          tableEntity = label.closest('g[class*="node"]');
          if (tableEntity) {
            break;
          }
        }
      }
      
      if (!tableEntity) {
      }
    }

    if (tableEntity) {
      try {
        
        // Industry-standard coordinate detection: getBBox() first, then transforms
        let elementCenterX = 0;
        let elementCenterY = 0;
        let coordinatesFound = false;
        
        // Strategy 1: getBBox() - Most reliable for SVG elements (industry standard)
        try {
          // Ensure element is properly attached before calling getBBox
          if (tableEntity.ownerDocument && typeof tableEntity.getBoundingClientRect === 'function') {
            const bbox = (tableEntity as SVGGraphicsElement).getBBox();
            
            // Enhanced validation with bounds checking
            if (bbox && bbox.width > 0 && bbox.height > 0 && 
                isFinite(bbox.x) && isFinite(bbox.y) &&
                bbox.x > -10000 && bbox.x < 10000 &&
                bbox.y > -10000 && bbox.y < 10000) {
              
              // CRITICAL FIX: getBBox() returns relative coordinates, need to add transform translate
              let transformX = 0;
              let transformY = 0;
              
              const transform = tableEntity.getAttribute('transform');
              if (transform) {
                const translateMatch = transform.match(/translate\(([^,\)]+)(?:,\s*([^,\)]+))?\)/);
                if (translateMatch) {
                  transformX = parseFloat(translateMatch[1]) || 0;
                  transformY = parseFloat(translateMatch[2]) || 0;
                }
              }
              
              // Calculate actual center in SVG coordinate space
              elementCenterX = transformX + (bbox.x + bbox.width / 2);
              elementCenterY = transformY + (bbox.y + bbox.height / 2);
              coordinatesFound = true;
              
            } else {
            }
          }
        } catch (bboxError) {
        }
        
        // Strategy 2: Transform attributes - Reliable fallback for positioned elements  
        if (!coordinatesFound) {
          const transform = tableEntity.getAttribute('transform');
          if (transform) {
            
            const translateMatch = transform.match(/translate\(([^,\)]+)(?:,\s*([^,\)]+))?\)/);
            if (translateMatch) {
              const transformX = parseFloat(translateMatch[1]) || 0;
              const transformY = parseFloat(translateMatch[2]) || 0;
              
              // Enhanced validation with bounds checking
              if (isFinite(transformX) && isFinite(transformY) &&
                  transformX > -10000 && transformX < 10000 &&
                  transformY > -10000 && transformY < 10000) {
                elementCenterX = transformX;
                elementCenterY = transformY;
                coordinatesFound = true;
              } else {
              }
            } else {
            }
          } else {
          }
        }
        
        // For debugging: if neither method worked, log element structure
        if (!coordinatesFound && tableName.toLowerCase().includes('opportunity')) {
            tagName: tableEntity.tagName,
            className: tableEntity.getAttribute('class'),
            id: tableEntity.getAttribute('id'),
            hasTransform: !!tableEntity.getAttribute('transform'),
            childElementCount: tableEntity.children.length
          });
        }
        
        // Strategy 3: Simple fallback using foreignObject coordinates
        if (!coordinatesFound) {
          
          const foreignObjects = Array.from(tableEntity.querySelectorAll('foreignObject'));
          if (foreignObjects.length > 0) {
            const foreignObject = foreignObjects[0];
            const foreignX = parseFloat(foreignObject.getAttribute('x') || '0');
            const foreignY = parseFloat(foreignObject.getAttribute('y') || '0');
            const foreignWidth = parseFloat(foreignObject.getAttribute('width') || '0');
            const foreignHeight = parseFloat(foreignObject.getAttribute('height') || '0');
            
            if (foreignWidth > 0 && foreignHeight > 0) {
              elementCenterX = foreignX + foreignWidth / 2;
              elementCenterY = foreignY + foreignHeight / 2;
              coordinatesFound = true;
            }
          }
        }
        
        if (coordinatesFound) {
          // Get SVG viewBox for accurate bounds checking
          const svgElement = svgContainerRef.current?.querySelector('svg');
          let maxX = 20000, maxY = 20000; // Default fallback bounds
          
          if (svgElement) {
            const viewBox = svgElement.getAttribute('viewBox');
            if (viewBox) {
              const [, , width, height] = viewBox.split(' ').map(Number);
              maxX = width + 1000; // Add buffer for transforms
              maxY = height + 1000; // Add buffer for transforms
            }
          }
          
          // Enhanced validation with dynamic bounds based on SVG viewBox
          const isValidX = isFinite(elementCenterX) && elementCenterX > -1000 && elementCenterX < maxX;
          const isValidY = isFinite(elementCenterY) && elementCenterY > -1000 && elementCenterY < maxY;
          
          if (isValidX && isValidY) {
            
            // For problematic tables like Opportunity, use more conservative zoom
            const isComplexTable = tableName.toLowerCase().includes('opportunity');
            const targetZoom = isComplexTable ? 2.5 : 3.0; // Slightly less aggressive zoom for complex tables
            
            zoomToScale(targetZoom, elementCenterX, elementCenterY);
            
            // Update lastClickPosition to ensure zoom controls center on this table
            setLastClickPosition({ x: elementCenterX, y: elementCenterY });
          } else {
            zoomToScale(2.0); // More conservative fallback zoom
          }
        } else {
          // For tables that fail centering, try a gentle zoom to at least improve visibility
          zoomToScale(2.0); // More conservative fallback zoom
        }
        
      } catch (error) {
        zoomToScale(2.5); // Slightly less aggressive fallback
      }
    } else {
      
      if (retryCount < 2) {
        setTimeout(() => centerOnTable(tableName, retryCount + 1), 200);
      } else {
        zoomToScale(2.5);
      }
    }
  }, [zoomToScale]);

  // Define handleTableClick before it's used in event delegation
  const handleTableClick = useCallback((tableName: string, event?: MouseEvent, isFromSearch: boolean = false, isAfterDomainSwitch: boolean = false) => {
    
    // Domain detection: Check if table exists in current domain (skip for search calls and after domain switches)
    const svgContainer = svgContainerRef.current;
    if (svgContainer && !isFromSearch && !isAfterDomainSwitch) {
      const tableElement = svgContainer.querySelector(`g[data-table-name="${tableName}"]`);
      
      if (!tableElement) {
        
        // Use real domainResults to find which domain contains this table
        let targetDomain = null;
        
        if (Object.keys(domainResults).length > 0) {
          for (const [domainName, domainData] of Object.entries(domainResults)) {
            if (domainData?.diagram) {
              // Parse the mermaid diagram to check if it contains the table
              const diagram = domainData.diagram;
              const lines = diagram.split('\n');
              
              for (const line of lines) {
                const trimmedLine = line.trim();
                // Check for table definition: "TableName {" or relationship references
                if (trimmedLine.startsWith(tableName + ' {') || 
                    trimmedLine.includes(tableName + ' ||') ||
                    trimmedLine.includes('|| ' + tableName) ||
                    trimmedLine.includes(tableName + ' }')) {
                  targetDomain = domainName;
                  break;
                }
              }
              
              if (targetDomain) break;
            }
          }
          
          // Fallback to overview if not found in specific domains
          if (!targetDomain && domainResults.overview) {
            targetDomain = 'overview';
          }
        }
        
        if (targetDomain && targetDomain !== domain) {
          if (onExternalTableClick) {
            onExternalTableClick(tableName, targetDomain);
          } else {
          }
          return; // Don't proceed with centering since table is in different domain
        } else {
        }
      }
      
      // DEBUG: Check SVG dimensions BEFORE any state changes
      const svg = svgContainer.querySelector('svg');
      if (svg) {
        const beforeRect = svg.getBoundingClientRect();
      }
    }
    
    // Update accessibility attributes
    if (svgContainer) {
      // Reset previous selection
      const allTables = svgContainer.querySelectorAll('g[data-table-name]');
      allTables.forEach(table => {
        table.setAttribute('aria-pressed', 'false');
      });
      
      // Set new selection
      const selectedTableElement = svgContainer.querySelector(`g[data-table-name="${tableName}"]`);
      if (selectedTableElement) {
        selectedTableElement.setAttribute('aria-pressed', 'true');
      }
    }
    
    
    // Remove previous selection handles
    removeSelectionHandles();
    
    // Update selection state
    setSelectedTable(tableName);
    
    // Find related tables using the relationship parser on original Mermaid code
    const relatedTables = new Set<string>();
    relatedTables.add(tableName);
    
    if (mermaidCode) {
      const relationshipMap = parseRelationships(mermaidCode);
      const connectedTables = relationshipMap.get(tableName) || [];
      connectedTables.forEach(table => relatedTables.add(table));
      
      // Note: ERD relationship highlighting is now handled by ERD-specific event handlers
    }
    
    setHighlightedTables(relatedTables);
    
    // Switch to focus mode
    setViewMode('focus');
    
    // Add selection handles after a short delay to ensure styling is applied
    setTimeout(() => {
      addSelectionHandles(tableName);
    }, 100);
    
    
    // Check dimensions after state updates
    setTimeout(() => {
      if (svgContainer) {
        const svg = svgContainer.querySelector('svg');
        if (svg) {
          const afterRect = svg.getBoundingClientRect();
          
          if (afterRect.width === 0 || afterRect.height === 0) {
            
            // Check CSS that might be causing this
            const computedStyles = window.getComputedStyle(svg);
            
            // Check container styles too
            const containerStyles = window.getComputedStyle(svgContainer);
          }
        }
      }
    }, 10);
    
    // Update lastClickPosition to table center for better zoom experience
    // This ensures that zoom controls focus on the table center rather than click coordinates
    const tableCenter = getTableCenterCoordinates(tableName);
    if (tableCenter) {
      setLastClickPosition({ x: tableCenter.x, y: tableCenter.y });
    }
    
    // Schedule centering to happen after styling completes
    setNeedsCenteringAfterStyling({ tableName });
  }, [selectedTable, domain, getTableCenterCoordinates, parseRelationships, mermaidCode]);

  // Add event delegation for table clicks - handles clicks on any child element
  useEffect(() => {
    const delegatedClickHandler = (event: MouseEvent) => {
      const target = event.target as Element;
      const svgContainer = svgContainerRef.current;
      
      // Only handle clicks within our SVG container
      if (svgContainer && svgContainer.contains(target)) {
        
        // Capture click coordinates in SVG space for zoom-to-cursor functionality
        const svgElement = svgContainer.querySelector('svg');
        if (svgElement) {
          try {
            // Convert screen coordinates to SVG coordinates, accounting for pan-zoom transforms
            const svgPoint = svgElement.createSVGPoint();
            svgPoint.x = event.clientX;
            svgPoint.y = event.clientY;
            
            // Step 1: Transform screen coordinates to base SVG coordinates
            const svgMatrix = svgElement.getScreenCTM();
            if (!svgMatrix) {
              return;
            }
            
            const baseSvgPoint = svgPoint.matrixTransform(svgMatrix.inverse());
            
            // Step 2: Account for pan-zoom-group transform if it exists
            const panZoomGroup = svgContainer.querySelector('#pan-zoom-group') as SVGGElement;
            if (panZoomGroup) {
              // Get the current transform of the pan-zoom group
              const panZoomTransform = panZoomGroup.transform.baseVal;
              if (panZoomTransform.numberOfItems > 0) {
                // Get the consolidated matrix from all transforms in the pan-zoom group
                const panZoomMatrix = panZoomTransform.consolidate()?.matrix;
                if (panZoomMatrix) {
                  // Create SVG point in base SVG coordinates
                  const panZoomPoint = svgElement.createSVGPoint();
                  panZoomPoint.x = baseSvgPoint.x;
                  panZoomPoint.y = baseSvgPoint.y;
                  
                  // Transform through inverse of pan-zoom matrix to get coordinates in pan-zoom space
                  const finalPoint = panZoomPoint.matrixTransform(panZoomMatrix.inverse());
                  
                  setLastClickPosition({ x: finalPoint.x, y: finalPoint.y });
                } else {
                  // No pan-zoom matrix, use base SVG coordinates
                  setLastClickPosition({ x: baseSvgPoint.x, y: baseSvgPoint.y });
                }
              } else {
                // No transforms in pan-zoom group, use base SVG coordinates
                setLastClickPosition({ x: baseSvgPoint.x, y: baseSvgPoint.y });
              }
            } else {
              // No pan-zoom group found, use base SVG coordinates
              setLastClickPosition({ x: baseSvgPoint.x, y: baseSvgPoint.y });
            }
            
            // Clear the position after 30 seconds to give users time to use zoom controls
            setTimeout(() => setLastClickPosition(null), 30000);
            
          } catch (error) {
          }
        }
        
        // Try multiple strategies to find the table entity
        let entityParent: Element | null = null;
        let tableName: string | null = null;
        
        // Strategy 1: Try the closest g[class*="node"] approach
        entityParent = target.closest('g[class*="node"]');
        if (entityParent) {
          tableName = entityParent.getAttribute('data-table-name');
        }
        
        // Strategy 2: Try direct data-table-name search  
        if (!tableName) {
          entityParent = target.closest('g[data-table-name]');
          if (entityParent) {
            tableName = entityParent.getAttribute('data-table-name');
          }
        }
        
        // Strategy 3: Manual traversal up the DOM tree
        if (!tableName) {
          let currentElement = target;
          let depth = 0;
          while (currentElement && depth < 10) {
            const currentTableName = currentElement.getAttribute?.('data-table-name');
            if (currentTableName) {
              tableName = currentTableName;
              entityParent = currentElement;
              break;
            }
            currentElement = currentElement.parentElement as Element;
            depth++;
          }
        }
        
        if (tableName && entityParent) {
          // Prevent event from propagating further and handle the table click
          event.preventDefault();
          event.stopPropagation();
          
          // Check if this is a ghost table
          const isGhostTable = entityParent.getAttribute('data-ghost-table') === 'true';
          const targetDomain = entityParent.getAttribute('data-target-domain');
          
          if (isGhostTable && targetDomain) {
            // Directly navigate to target domain (we already know it from metadata)
            if (onExternalTableClick) {
              onExternalTableClick(tableName, targetDomain);
            } else {
            }
            return; // Prevent further processing
          } else {
            // Two-click system: First click selects, second click shows tooltip
            const codemasterTooltipContent = generateTableCodemasterTooltip(tableName);
            
            if (selectedTable === tableName && codemasterTooltipContent) {
              // Second click on already-selected table with codemaster data: show tooltip
              
              // Use smart positioning to avoid covering the table
              const smartPosition = calculateSmartTooltipPosition(entityParent, svgContainer);
              
              setTooltip({
                visible: true,
                x: smartPosition.x,
                y: smartPosition.y,
                content: codemasterTooltipContent,
                tableName,
                columnName: 'All Columns',
                calculatedWidth: smartPosition.calculatedWidth,
                calculatedHeight: smartPosition.calculatedHeight
              });
              
              // No auto-hide - user will close manually
              
              return; // Prevent further processing
            } else {
              // First click or table without codemaster data: select/pan-zoom (existing behavior)
                type: event.type,
                target: target.tagName,
                entityElement: entityParent.tagName,
                detectionStrategy: entityParent.closest('g[class*="node"]') ? 'closest(g[class*="node"])' : 'manual traversal',
                isAlreadySelected: selectedTable === tableName,
                hasCodemaster: !!codemasterTooltipContent
              });
              
              // Call the table click handler directly (selects table and triggers pan/zoom)
              handleTableClick(tableName);
            }
          }
        } else {
          
          // Show parent chain for debugging
          let el = target;
          for (let i = 0; i < 5 && el; i++) {
            const elementClass = (el as any).className?.baseVal || el.className || '';
            el = el.parentElement as Element;
          }
        }
      }
    };
    
    document.addEventListener('click', delegatedClickHandler, true);
    return () => document.removeEventListener('click', delegatedClickHandler, true);
  }, [handleTableClick, generateTableCodemasterTooltip, setTooltip, onExternalTableClick, calculateSmartTooltipPosition, selectedTable]); // Add dependencies

  // Clean rendering - no domain styling

  // Note: Removed CSS injection useEffect to prevent styling conflicts
  // All styling now handled directly via DOM manipulation

  // Industry-standard Direct SVG Rendering with proper async handling
  useEffect(() => {
    let cancelled = false;

    if (!mermaidCode) {
      setSvgContent('');
      setOriginalSvgContent('');
      setBaseSvgContent('');
      setIsInitialStylingComplete(false);
      setError(null);
      return;
    }

    async function renderDiagram() {
      if (cancelled) return;
      
      setIsRendering(true);
      setError(null);
      
      try {
        // Generate unique ID for this render operation
        const uniqueId = `erd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Starting Mermaid Direct SVG Rendering
        
        const hasGhostTables = mermaidCode.includes('GHOST-META:');
        const hasGhostClass = mermaidCode.includes('classDef ghostTable') || mermaidCode.includes('class ') && mermaidCode.includes('ghostTable');
        
        
        if (hasGhostTables) {
          // Extract ghost table metadata for debugging (new format)
          const ghostMetaMatches = mermaidCode.match(/%% GHOST-META: (\w+) -> (domain_\d+)/g);
          if (ghostMetaMatches) {
          }
        }

        // Use proper Mermaid render API - returns SVG string directly
        const { svg } = await mermaid.render(uniqueId, mermaidCode);
        
        if (!cancelled) {
          // Mermaid render completed successfully
          
          // Reset styling completion flag to ensure proper regeneration for new domain
          setIsInitialStylingComplete(false);
          
          // Store both original and current SVG content
          setOriginalSvgContent(svg);
          
          // Analyze SVG structure to understand Mermaid's generated elements
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
          const svgElement = svgDoc.querySelector('svg');
          
          if (svgElement) {
            const allElements = Array.from(svgElement.querySelectorAll('*'));
            
            // Look for entity-related elements specifically
            const entityElements = allElements.filter(el => {
              const id = el.getAttribute('id') || '';
              const className = el.getAttribute('class') || '';
              return id.includes('entity') || className.includes('entity') || 
                     id.includes('Entity') || className.includes('Entity');
            });
            
            entityElements.forEach((el, i) => {
              if (i < 5) { // Log first 5 for debugging
              }
            });
            
            // Look for text elements that might contain ghost table content
            const textElements = Array.from(svgElement.querySelectorAll('text, tspan'));
            const ghostTextElements = textElements.filter(el => {
              const content = el.textContent || '';
              return content.includes('Ghost-Table') || content.includes('Click-to-navigate-to');
            });
            
            ghostTextElements.forEach((el, i) => {
            });
            
            // Analyze g elements (groups) which typically contain table structures
            const groupElements = Array.from(svgElement.querySelectorAll('g'));
            
            const elementsWithIds = groupElements.filter(el => el.getAttribute('id'));
            elementsWithIds.forEach((el, i) => {
              if (i < 10) { // Log first 10 for debugging
                const id = el.getAttribute('id');
                const hasGhostContent = Array.from(el.querySelectorAll('text, tspan'))
                  .some(textEl => (textEl.textContent || '').includes('Ghost-Table'));
              }
            });
            
            const elementAnalysis = new Map();
            
            allElements.forEach((el: Element, i: number) => {
              const tagName = el.tagName.toLowerCase();
              // Handle both SVG and HTML className properties
              const className = (el as any).className?.baseVal || (el as any).className || el.getAttribute('class') || 'no-class';
              const id = el.getAttribute('id') || 'no-id';
              const key = `${tagName}.${className}`;
              
              if (!elementAnalysis.has(key)) {
                elementAnalysis.set(key, { count: 0, elements: [] });
              }
              
              const entry = elementAnalysis.get(key);
              entry.count++;
              entry.elements.push({
                id,
                attributes: Object.fromEntries(Array.from(el.attributes).map(attr => [attr.name, attr.value]))
              });
            });
            
            // Element breakdown analysis (details suppressed)
            
            // Look specifically for rectangles (entity boxes)
            const rects = Array.from(svgElement.querySelectorAll('rect'));
            // Rectangle analysis: ${rects.length} total rectangles
            
            // Look for paths (relationships)
            const paths = Array.from(svgElement.querySelectorAll('path'));
            // Path analysis: ${paths.length} total paths
            
            // Look for text elements
            const texts = Array.from(svgElement.querySelectorAll('text'));
            // Text analysis: ${texts.length} total text elements
          }
          
          // Let the styling useEffect chain handle the processing
          // This prevents race conditions with domain switching
        }
        
      } catch (error) {
        
        if (!cancelled) {
          // Try simplified ERD fallback
          const simplifiedERD = createSimplifiedERD(mermaidCode);
          if (simplifiedERD) {
            try {
              const { svg } = await mermaid.render(`erd-simplified-${Date.now()}`, simplifiedERD);
              if (!cancelled) {
                // Simplified ERD rendered successfully
                
                // Reset styling completion flag for simplified SVG too
                setIsInitialStylingComplete(false);
                setOriginalSvgContent(svg);
                
                // Let the styling useEffect chain handle the processing
                // This prevents race conditions with domain switching
              }
            } catch (simplifiedError) {
              console.error('Simplified ERD also failed:', simplifiedError);
              if (!cancelled) {
                setError('Failed to render ERD diagram');
              }
            }
          } else {
            setError('Failed to render ERD diagram');
          }
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    renderDiagram();

    // Cleanup function to prevent race conditions
    return () => {
      cancelled = true;
    };
  }, [mermaidCode, isDarkMode]);

  // Old initialization code removed - using transform-based approach now
  
  // Mouse event handlers for custom pan-zoom
  useEffect(() => {
    if (!svgContainerRef.current) return;
    
    const container = svgContainerRef.current;
    const svg = container.querySelector('svg') as SVGSVGElement;
    
    if (!svg) {
      return;
    }
    
    // Industry-standard cursor-based zoom handler (Google Maps/Figma pattern)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      // Hide tooltip during zoom operations
      setTooltip(prev => ({ ...prev, visible: false }));
      
      // Get mouse position relative to container
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      
      
      // Normalize deltaY across different browsers and devices
      // Standard sensitivity: 0.0008 per deltaY unit (industry standard)
      let deltaY = e.deltaY;
      
      // Handle different wheel delta modes
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaY *= 16; // Convert lines to pixels (rough approximation)
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaY *= 400; // Convert pages to pixels (rough approximation)
      }
      
      // Responsive zoom sensitivity - significantly improved for trackpad/mouse
      // Detect potential trackpad usage (smaller, more frequent deltaY values)
      const isPotentialTrackpad = Math.abs(deltaY) < 10;
      const trackpadMultiplier = isPotentialTrackpad ? ZOOM_TRACKPAD_MULTIPLIER : 1.0;
      
      const effectiveZoomSensitivity = Math.min(
        ZOOM_BASE_SENSITIVITY * trackpadMultiplier,
        ZOOM_MAX_SENSITIVITY
      );
      
      const scaleDelta = -deltaY * effectiveZoomSensitivity;
      const zoomFactor = Math.exp(scaleDelta); // Smooth exponential scaling
      
      
      // Calculate new zoom with limits
      const newZoom = Math.max(0.1, Math.min(10, currentZoom * zoomFactor));
      
      if (newZoom === currentZoom) {
        // No zoom change needed
        return;
      }
      
      // Use industry standard cursor-centered zoom
      zoomAtCursor(newZoom, e.clientX, e.clientY);
    };
    
    // Mouse drag handlers for panning
    const handleMouseDown = (e: MouseEvent) => {
      if (!isPanEnabled) return;
      if (e.button !== 0) return; // Only left mouse button
      
      // Hide tooltip during pan operations
      setTooltip(prev => ({ ...prev, visible: false }));
      
      // Don't start panning if clicking on a table or tooltip-enhanced element
      const target = e.target as Element;
      const isTable = target.closest('g[data-table-name]');
      const isTooltipElement = target.style?.color === 'rgb(99, 102, 241)' || target.style?.fill === 'rgb(99, 102, 241)';
      
      if (isTable || isTooltipElement) {
        return;
      }
      
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      
      // Add dragging class to disable CSS transitions during drag
      container.classList.add('dragging');
      container.style.cursor = 'grabbing';
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      // Apply pan sensitivity with zoom adjustment for responsive dragging
      const zoomSensitivity = 1 + (currentZoom - 1) * PAN_ZOOM_SENSITIVITY_FACTOR;
      const effectiveSensitivity = PAN_BASE_SENSITIVITY * zoomSensitivity;
      
      const adjustedDeltaX = deltaX * effectiveSensitivity;
      const adjustedDeltaY = deltaY * effectiveSensitivity;
      
      
      panToPosition(adjustedDeltaX, adjustedDeltaY);
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        // Remove dragging class to re-enable smooth transitions
        container.classList.remove('dragging');
        container.style.cursor = isPanEnabled ? 'grab' : 'default';
      }
    };
    
    const handleMouseLeave = () => {
      if (isDragging) {
        setIsDragging(false);
        // Remove dragging class to re-enable smooth transitions
        container.classList.remove('dragging');
        container.style.cursor = isPanEnabled ? 'grab' : 'default';
      }
    };
    
    // Set initial cursor
    container.style.cursor = isPanEnabled ? 'grab' : 'default';
    
    // Add event listeners
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.style.cursor = 'default';
    };
  }, [svgContainerRef.current, currentZoom, isDragging, dragStart, isPanEnabled, zoomToScale, panToPosition, zoomAtCursor]);

  // Transform wrapper creation for SVG content with comprehensive debugging
  const wrapSVGWithTransformGroup = useCallback((svgContent: string): string => {
    
    if (!svgContent) {
      return svgContent;
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    
    if (!svg) {
      console.error('  - ❌ No SVG element found in parsed content');
      return svgContent;
    }
    
    
    // Check if transform group already exists
    const existingGroup = svg.querySelector('#pan-zoom-group');
    if (existingGroup) {
      return svgContent;
    }
    
    // Create transform group wrapper
    const transformGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    transformGroup.setAttribute('id', 'pan-zoom-group');
    transformGroup.setAttribute('transform', 'translate(0, 0) scale(1)');
    
    // Move all SVG children into the transform group
    const children = Array.from(svg.children);
    
    children.forEach((child, i) => {
      transformGroup.appendChild(child);
    });
    
    // Add the transform group as the only child of SVG
    svg.appendChild(transformGroup);
    
    
    // Ensure proper SVG attributes
    if (svg.getAttribute('height') === 'null' || !svg.getAttribute('height')) {
      svg.setAttribute('height', '100%');
    }
    if (!svg.getAttribute('width')) {
      svg.setAttribute('width', '100%');
    }
    
    const result = new XMLSerializer().serializeToString(doc);
    
    // Verify the result contains the transform group
    if (result.includes('id="pan-zoom-group"')) {
    } else {
      console.error('  - ❌ ERROR: Result does NOT contain pan-zoom-group');
    }
    
    return result;
  }, []);

  // Enhanced SVG initialization after content is set with comprehensive debugging
  const initializeTransformSystem = useCallback(() => {
    if (!svgContainerRef.current) {
      return;
    }
    
    const container = svgContainerRef.current;
    
    // Check for SVG element
    const svg = container.querySelector('svg') as SVGSVGElement;
    
    if (!svg) {
      console.error('❌ No SVG element found in container');
      return;
    }
    
    // Debug SVG structure
    
    // Look for transform group
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    
    if (!transformGroup) {
      console.error('❌ Transform group #pan-zoom-group NOT FOUND');
      const elementsWithIds = container.querySelectorAll('[id]');
      elementsWithIds.forEach((el, i) => {
      });
      
      Array.from(svg.children).forEach((child, i) => {
        const childClass = (child as any).className?.baseVal || child.className || '';
      });
      return;
    }
    
    // Success - set refs and initialize
    svgRef.current = svg;
    transformGroupRef.current = transformGroup;
    
    
    // Apply initial dimension fixes
    svg.style.height = '100%';
    svg.style.width = '100%';
    svg.style.minHeight = '400px';
    svg.style.display = 'block';
  }, []);

  // Monitor SVG content and initialize transform system
  useEffect(() => {
    
    // Clear potentially stale refs when SVG content changes
    svgRef.current = null;
    transformGroupRef.current = null;
    
    if (svgContent && svgContainerRef.current) {
      // Initialize transform system after short delay to ensure DOM is ready
      setTimeout(() => {
        initializeTransformSystem();
      }, 10);
      
      // Retry initialization if needed
      setTimeout(() => {
        if (!transformGroupRef.current) {
          initializeTransformSystem();
        }
      }, 50);
    }
  }, [svgContent, initializeTransformSystem]);

  // Mutation observer removed - not needed for transform-based approach

  // Handle window resize for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current && svgContainerRef.current) {
        setTimeout(() => {
          // For transform-based approach, we don't need to recalculate on resize
          // The transform will maintain proper scaling automatically
        }, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentZoom]);

  // Interactive control functions for custom pan-zoom
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(10, currentZoom * 1.2);
    // Use last click position if available, otherwise try selected table center, then viewport center
    if (lastClickPosition) {
      zoomToScale(newZoom, lastClickPosition.x, lastClickPosition.y);
    } else if (selectedTable) {
      // Fallback to selected table center when no last click position
      const tableCenter = getTableCenterCoordinates(selectedTable);
      if (tableCenter) {
        zoomToScale(newZoom, tableCenter.x, tableCenter.y);
      } else {
        zoomToScale(newZoom);
      }
    } else {
      zoomToScale(newZoom);
    }
  }, [currentZoom, zoomToScale, lastClickPosition, selectedTable, getTableCenterCoordinates]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(0.1, currentZoom * 0.8);
    // Use last click position if available, otherwise try selected table center, then viewport center
    if (lastClickPosition) {
      zoomToScale(newZoom, lastClickPosition.x, lastClickPosition.y);
    } else if (selectedTable) {
      // Fallback to selected table center when no last click position
      const tableCenter = getTableCenterCoordinates(selectedTable);
      if (tableCenter) {
        zoomToScale(newZoom, tableCenter.x, tableCenter.y);
      } else {
        zoomToScale(newZoom);
      }
    } else {
      zoomToScale(newZoom);
    }
  }, [currentZoom, zoomToScale, lastClickPosition, selectedTable, getTableCenterCoordinates]);

  const handleReset = useCallback(() => {
    if (!svgContainerRef.current) return;
    
    
    // Always search for live element
    const container = svgContainerRef.current;
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    
    if (!transformGroup || !document.contains(transformGroup)) {
      return;
    }
    
    // Reset to identity transform using both CSS and SVG attribute
    (transformGroup as any).style.transform = 'translate(0px, 0px) scale(1)';
    transformGroup.setAttribute('transform', 'translate(0, 0) scale(1)');
    
    // Update state
    setCurrentZoom(1.0);
    setCurrentPan({ x: 0, y: 0 });
    
  }, []);

  const handleFit = useCallback(() => {
    if (svgRef.current && svgContainerRef.current) {
      const container = svgContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      // Get the actual SVG content bounds from table elements, not entire SVG
      try {
        let svgBBox;
        
        // First try to get bounds from transform group (content group)
        const transformGroup = transformGroupRef.current;
        if (transformGroup) {
          svgBBox = transformGroup.getBBox();
        } else {
          // Fallback: calculate bounds from actual table elements
          const svg = svgRef.current;
          const tableElements = svg.querySelectorAll('g[data-table-name], g[class*="node"], g[id*="entity-"]');
          
          if (tableElements.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            tableElements.forEach(element => {
              try {
                const elementBBox = element.getBBox();
                minX = Math.min(minX, elementBBox.x);
                minY = Math.min(minY, elementBBox.y);
                maxX = Math.max(maxX, elementBBox.x + elementBBox.width);
                maxY = Math.max(maxY, elementBBox.y + elementBBox.height);
              } catch (e) {
                // Skip elements that can't provide bbox
              }
            });
            
            if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
              svgBBox = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
              };
            } else {
              // Final fallback to entire SVG
              svgBBox = svgRef.current.getBBox();
            }
          } else {
            // No table elements found, use entire SVG
            svgBBox = svgRef.current.getBBox();
          }
        }
        
        // Enhanced bounds calculation for optimal fitting
        if (svgBBox.width > 0 && svgBBox.height > 0) {
          const scaleX = containerRect.width / svgBBox.width;
          const scaleY = containerRect.height / svgBBox.height;
          
          // Calculate optimal fit scale - remove arbitrary constraints
          let fitScale = Math.min(scaleX, scaleY);
          
          // Dynamic padding based on content size and complexity
          let padding;
          if (fitScale > 2.0) {
            // Small content: minimal padding to maximize zoom
            padding = 0.95; // 5% padding
          } else if (fitScale > 1.0) {
            // Medium content: moderate padding
            padding = 0.9; // 10% padding
          } else if (fitScale > 0.3) {
            // Large content: more padding for readability
            padding = 0.85; // 15% padding
          } else {
            // Very large content: minimal padding to allow closer zoom
            padding = 0.95; // 5% padding for massive diagrams
          }
          
          fitScale = fitScale * padding;
          
          // Get real table count from domain metadata instead of estimating
          const svgContainer = svgContainerRef.current;
          const actualTableCount = domainResults?.[domain || 'overview']?.metadata?.tables_count || 
            svgContainer?.querySelectorAll('g[data-table-name]').length || 1;
          
          // Smart minimum with much higher, usable zoom levels (considering focus mode is 300%)
          const intelligentMinimum = actualTableCount <= 5 ? 1.0 :      // Very small: 100% (no zoom out)
                                    actualTableCount <= 15 ? 0.8 :     // Small domains: 80% min
                                    actualTableCount <= 50 ? 0.5 :     // Medium domains: 50% min  
                                    actualTableCount <= 100 ? 0.3 :    // Large domains: 30% min
                                    0.15;                               // Very large: 15% min
          
          fitScale = Math.max(fitScale, intelligentMinimum);
          
          // Calculate proper center point for the fit operation
          const centerX = svgBBox.x + svgBBox.width / 2;
          const centerY = svgBBox.y + svgBBox.height / 2;
          
          zoomToScale(fitScale, centerX, centerY);
          
        } else {
          zoomToScale(0.8); // Better fallback zoom
        }
      } catch (error) {
        
        // Enhanced fallback: try to get viewBox dimensions
        const svg = svgRef.current;
        const viewBox = svg.getAttribute('viewBox');
        
        if (viewBox) {
          const [x, y, width, height] = viewBox.split(' ').map(Number);
          if (width > 0 && height > 0) {
            const containerRect = svgContainerRef.current!.getBoundingClientRect();
            const scaleX = containerRect.width / width;
            const scaleY = containerRect.height / height;
            let fallbackScale = Math.min(scaleX, scaleY);
            
            // Apply same dynamic padding and minimum logic for fallback
            const padding = fallbackScale > 2.0 ? 0.95 : fallbackScale > 1.0 ? 0.9 : fallbackScale > 0.3 ? 0.85 : 0.95;
            
            // Use same real table count logic for fallback
            const svgContainer = svgContainerRef.current;
            const actualTableCount = domainResults?.[domain || 'overview']?.metadata?.tables_count || 
              svgContainer?.querySelectorAll('g[data-table-name]').length || 1;
              
            const intelligentMinimum = actualTableCount <= 5 ? 1.0 :
                                      actualTableCount <= 15 ? 0.8 :
                                      actualTableCount <= 50 ? 0.5 :
                                      actualTableCount <= 100 ? 0.3 :
                                      0.15;
            
            fallbackScale = Math.max(fallbackScale * padding, intelligentMinimum);
            
            zoomToScale(fallbackScale, x + width / 2, y + height / 2);
            return;
          }
        }
        
        // Final fallback - better default
        zoomToScale(0.8);
      }
    }
  }, [zoomToScale]);

  const handleTogglePan = useCallback(() => {
    setIsPanEnabled(prev => !prev);
  }, []);

  // Enhanced zoom and focus handlers for Phase 3
  const handleViewModeChange = useCallback((mode: 'overview' | 'detail' | 'focus') => {
    setViewMode(mode);
    
    switch (mode) {
      case 'overview':
        // Fit entire diagram to view
        handleFit();
        setSelectedTable(null);
        setHighlightedTables(new Set());
        break;
        
      case 'detail':
        // Zoom to 150% for better detail viewing
        zoomToScale(1.5);
        break;
        
      case 'focus':
        // Focus mode: zoom to 200% - centering on specific table handled separately
        break;
    }
  }, [handleFit, zoomToScale]);

  // handleTableClick moved earlier in component to fix initialization order

  // Clear selection only (used for background clicks)
  const handleClearSelectionOnly = useCallback(() => {
    const previousSelection = selectedTable;
    
    // Remove selection handles
    removeSelectionHandles();
    
    // Clear all visual selection states with comprehensive cleanup
    const svgContainer = svgContainerRef.current;
    if (svgContainer) {
      
      // Remove any aria-pressed states from table elements
      const selectedElements = svgContainer.querySelectorAll('[aria-pressed="true"]');
      
      selectedElements.forEach(element => {
        element.setAttribute('aria-pressed', 'false');
      });
      
      // Remove visual selection CSS classes and stop animations - WITH DEBUGGING
      const tableSelectedElements = svgContainer.querySelectorAll('.table-selected');
      
      tableSelectedElements.forEach((element, index) => {
        
        // Stop any running animations first
        element.style.animation = 'none';
        
        // Remove the class
        const hadClass = element.classList.contains('table-selected');
        element.classList.remove('table-selected');
        const stillHasClass = element.classList.contains('table-selected');
        
        
        // Log all inline styles before clearing
        
        // Force clear ALL possible visual effect styles
        const stylesToClear = [
          'filter', 'opacity', 'animation', 'transform', 'box-shadow', 
          'stroke', 'stroke-width', 'stroke-dasharray', 'fill', 'fill-opacity',
          'stroke-opacity', 'visibility', 'display'
        ];
        
        stylesToClear.forEach(prop => {
          element.style.removeProperty(prop);
        });
        
        // Force stop animations and clear computed styles
        element.style.setProperty('animation-play-state', 'paused', 'important');
        element.style.setProperty('animation', 'none', 'important');
        element.style.setProperty('filter', 'none', 'important');
        element.style.setProperty('opacity', '1', 'important');
        
        // Get computed styles and override any that might be causing visual effects
        const computedStyle = getComputedStyle(element);
        
        // Force override computed styles that might persist
        if (computedStyle.filter && computedStyle.filter !== 'none') {
          element.style.setProperty('filter', 'none', 'important');
        }
        
        
        // Clear browser focus states and debug CSS pseudo-classes
        
        // Force remove focus and blur the element
        if (element.matches(':focus')) {
          (element as HTMLElement).blur();
        }
        
        // Temporarily clear tabindex to prevent focus
        const originalTabIndex = element.getAttribute('tabindex');
        if (originalTabIndex !== null) {
          element.setAttribute('tabindex', '-1');
        }
        
        // Clear SVG presentation attributes (not just CSS styles)
        const svgAttributes = ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'fill', 'fill-opacity', 'filter'];
        
        svgAttributes.forEach(attr => {
          if (element.hasAttribute(attr)) {
            const oldValue = element.getAttribute(attr);
            element.removeAttribute(attr);
          }
        });
        
        // Also clear selection styles from child elements
        const childRects = element.querySelectorAll('rect, foreignObject');
        
        childRects.forEach((child, childIndex) => {
          
          // Clear all possible SVG styling properties
          const svgStylesToClear = [
            'animation', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity',
            'fill', 'fill-opacity', 'filter', 'opacity', 'transform', 'visibility'
          ];
          
          svgStylesToClear.forEach(prop => {
            child.style.removeProperty(prop);
          });
          
          // Force clear critical styling with !important and pause animations
          child.style.setProperty('animation-play-state', 'paused', 'important');
          child.style.setProperty('animation', 'none', 'important');
          child.style.setProperty('filter', 'none', 'important');
          child.style.setProperty('stroke', '', 'important');
          child.style.setProperty('stroke-width', '', 'important');
          
          // Also clear SVG presentation attributes on child elements
          svgAttributes.forEach(attr => {
            if (child.hasAttribute(attr)) {
              const oldValue = child.getAttribute(attr);
              child.removeAttribute(attr);
            }
          });
          
        });
        
      });
      
      // Final comprehensive style reset using cssText
      
      const allAffectedElements = svgContainer.querySelectorAll('.table-entity, g[data-table-name]');
      allAffectedElements.forEach((el, index) => {
        // Complete style reset
        const currentCssText = el.style.cssText;
        
        // Keep only essential styles and reset everything else
        el.style.cssText = 'cursor: pointer; pointer-events: auto;';
        
      });
      
      // Remove has-selection class from container
      svgContainer.classList.remove('has-selection');
      
      // Force comprehensive browser repaint using requestAnimationFrame
      requestAnimationFrame(() => {
        // Force layout recalculation
        svgContainer.offsetHeight;
        
        // Reset any inline styles that might persist
        const allTableElements = svgContainer.querySelectorAll('.table-entity');
        allTableElements.forEach(element => {
          element.style.animation = '';
          element.style.filter = '';
        });
      });
    }
    
    // Reset React state
    setSelectedTable(null);
    setHighlightedTables(new Set());
    setViewMode('overview');
    
    // Clear any pending search/centering operations
    setSearchTargetTable(null);
    setIsSearchTriggered(false);
    
  }, [selectedTable, removeSelectionHandles]);

  // Clear selection with zoom (used for control panel clear button)
  const handleClearSelection = useCallback(() => {
    const previousSelection = selectedTable;
    
    // Remove selection handles
    removeSelectionHandles();
    
    // Clear all visual selection states with comprehensive cleanup
    const svgContainer = svgContainerRef.current;
    if (svgContainer) {
      // Remove any aria-pressed states from table elements
      const selectedElements = svgContainer.querySelectorAll('[aria-pressed="true"]');
      selectedElements.forEach(element => {
        element.setAttribute('aria-pressed', 'false');
      });
      
      // Remove visual selection CSS classes and stop animations
      const tableSelectedElements = svgContainer.querySelectorAll('.table-selected');
      tableSelectedElements.forEach(element => {
        // Stop any running animations first
        element.style.animation = 'none';
        element.classList.remove('table-selected');
        
        // Also clear selection styles from child elements
        const childRects = element.querySelectorAll('rect, foreignObject');
        childRects.forEach(child => {
          child.style.animation = 'none';
          if (child instanceof SVGElement) {
            child.style.filter = '';
          }
        });
      });
      
      // Remove has-selection class from container
      svgContainer.classList.remove('has-selection');
      
      // Force comprehensive browser repaint using requestAnimationFrame
      requestAnimationFrame(() => {
        // Force layout recalculation
        svgContainer.offsetHeight;
        
        // Reset any inline styles that might persist
        const allTableElements = svgContainer.querySelectorAll('.table-entity');
        allTableElements.forEach(element => {
          element.style.animation = '';
          element.style.filter = '';
        });
      });
    }
    
    // Reset React state
    setSelectedTable(null);
    setHighlightedTables(new Set());
    setViewMode('overview');
    
    // Clear ERD relationship highlighting
    clearERDRelationshipHighlighting();
    
    // Clear any pending search/centering operations
    setSearchTargetTable(null);
    setIsSearchTriggered(false);
    
    // Use the enhanced fit function to properly center all tables
    handleFit();
    
  }, [selectedTable, handleFit, removeSelectionHandles, clearERDRelationshipHighlighting]);

  const handleDomainFocus = useCallback(() => {
    // Focus on the current domain by fitting and centering
    handleFit();
    setViewMode('detail');
    
  }, [domain, handleFit]);

  // Layout and display option handlers
  const handleToggleCompactView = useCallback(() => {
    setIsCompactView(prev => {
      const newValue = !prev;
      return newValue;
    });
  }, []);

  const handleToggleRelationshipLabels = useCallback(() => {
    setShowRelationshipLabels(prev => {
      const newValue = !prev;
      return newValue;
    });
  }, []);

  const handleToggleAttributeDetails = useCallback(() => {
    setShowAttributeDetails(prev => {
      const newValue = !prev;
      return newValue;
    });
  }, []);

  // Keyboard shortcuts for enhanced navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when ERD is visible and not in input fields
      if (!svgContent || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case '1':
          if (event.altKey) {
            event.preventDefault();
            handleViewModeChange('overview');
          }
          break;
        case '2':
          if (event.altKey) {
            event.preventDefault();
            handleViewModeChange('detail');
          }
          break;
        case '3':
          if (event.altKey) {
            event.preventDefault();
            handleViewModeChange('focus');
          }
          break;
        case 'r':
          if (event.altKey) {
            event.preventDefault();
            handleReset();
          }
          break;
        case 'f':
          if (event.altKey) {
            event.preventDefault();
            handleFit();
          }
          break;
        case 'd':
          if (event.altKey) {
            event.preventDefault();
            handleDomainFocus();
          }
          break;
        case 'escape':
          event.preventDefault();
          handleClearSelection();
          break;
        case '+':
        case '=':
          if (event.altKey) {
            event.preventDefault();
            handleZoomIn();
          }
          break;
        case '-':
          if (event.altKey) {
            event.preventDefault();
            handleZoomOut();
          }
          break;
        case 'c':
          if (event.altKey) {
            event.preventDefault();
            handleToggleCompactView();
          }
          break;
        case 'l':
          if (event.altKey) {
            event.preventDefault();
            handleToggleRelationshipLabels();
          }
          break;
        case 'a':
          if (event.altKey) {
            event.preventDefault();
            handleToggleAttributeDetails();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [svgContent, handleViewModeChange, handleReset, handleFit, handleDomainFocus, handleClearSelection, handleZoomIn, handleZoomOut, handleToggleCompactView, handleToggleRelationshipLabels, handleToggleAttributeDetails]);

  // Helper function to identify external table references
  const identifyExternalTables = useCallback((currentDomainTables: string[]): Set<string> => {
    const externalTables = new Set<string>();
    
    if (!domainResults || Object.keys(domainResults).length === 0) {
      return externalTables;
    }
    
    // Parse the current domain's mermaid diagram to find FK references
    if (mermaidCode) {
      const lines = mermaidCode.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Look for FK column definitions: "foreign_key_name type FK"
        // or relationship definitions: "TableA ||--o{ TableB : relationship"
        if (trimmedLine.includes(' FK') || trimmedLine.includes('||') || trimmedLine.includes('}o')) {
          // Extract referenced table names from relationships
          const relationshipMatch = trimmedLine.match(/(\w+)\s*\|\|[^|]*\{\s*(\w+)/);
          if (relationshipMatch) {
            const [, sourceTable, targetTable] = relationshipMatch;
            
            // Check if target table is external (not in current domain)
            if (!currentDomainTables.includes(targetTable) && targetTable !== sourceTable) {
              externalTables.add(targetTable);
            }
          }
          
          // Also check FK column names for patterns like "user_id" -> "User" table
          if (trimmedLine.includes(' FK')) {
            const fkMatch = trimmedLine.match(/(\w+)_id\s+\w+\s+FK/);
            if (fkMatch) {
              const [, baseTableName] = fkMatch;
              // Convert snake_case to PascalCase for table name
              const possibleTableName = baseTableName.charAt(0).toUpperCase() + baseTableName.slice(1);
              
              // Check if this table exists in any other domain
              for (const [domainName, domainData] of Object.entries(domainResults)) {
                if (domainName === domain || domainName === 'overview') continue;
                
                if (domainData?.diagram && domainData.diagram.includes(`${possibleTableName} {`)) {
                  externalTables.add(possibleTableName);
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    return externalTables;
  }, [domainResults, mermaidCode, domain]);

  // Handle clicks on external table references
  const handleExternalTableClick = useCallback((tableName: string, event?: MouseEvent) => {
    
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // Find which domain contains this external table
    let targetDomain = null;
    
    for (const [domainName, domainData] of Object.entries(domainResults)) {
      if (domainName === domain) continue; // Skip current domain
      
      if (domainData?.diagram && domainData.diagram.includes(`${tableName} {`)) {
        targetDomain = domainName;
        break;
      }
    }
    
    if (targetDomain) {
      if (onExternalTableClick) {
        onExternalTableClick(tableName, targetDomain);
      } else {
      }
    } else {
    }
  }, [domainResults, domain]);

  // Direct SVG manipulation to apply domain styling - bypasses Mermaid CSS system
  // Clean table detection and click handling - NO styling applied
  const applySVGDomainStyling = useCallback((svgString: string): string => {
    
    if (!svgString) {
      return svgString;
    }
    
    
    try {
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
      const svgElement = svgDoc.querySelector('svg');
      
      if (!svgElement) return svgString;
      
      
      // Debug: Count all potential entity containers first
      const allPotentialBoxes = Array.from(svgElement.querySelectorAll('g'));
        
      const nodeClassBoxes = Array.from(svgElement.querySelectorAll('g.node, g[class="node default"], g[class="node"]'));
      
      // Find individual entity nodes for click handling only (exclude containers)
      // Target specific node classes but exclude plural "nodes" container
      const entityBoxes = nodeClassBoxes.filter(box => {
        const className = (box as any).className?.baseVal || box.className || '';
        // Exclude containers like "nodes" - only include individual "node" elements
        return !className.includes('nodes') && (className.includes('node'));
      });
      
      // Debug: Show the first few boxes to understand structure
      // Count entity boxes for detection
      
      let clickableCount = 0;
      let tablesFound: string[] = [];
      
      // Process each potential entity container - detection only, no styling
      entityBoxes.forEach((box) => {
        const entityId = box.getAttribute('id');
        const className = (box as any).className?.baseVal || box.className || '';
        
        let foundTableName: string | null = null;
        
        // Method 1: Try ID attribute patterns
        if (entityId) {
          const match = entityId.match(/entity-(.+)-\d+$/);
          if (match && match[1]) {
            foundTableName = match[1];
          }
        }
        
        // Method 2: Try text content if ID fails
        if (!foundTableName) {
          const spans = Array.from(box.querySelectorAll('span'));
          const tableSpan = spans.find(span => {
            const content = span.textContent?.trim();
            return content && content.length > 2 && !content.includes('PK') && !content.includes('FK') && !content.includes(':');
          });
          
          if (tableSpan) {
            foundTableName = tableSpan.textContent?.trim() || null;
          }
        }
        
        // Set up click handling and selection styling
        if (foundTableName) {
          box.setAttribute('data-table-name', foundTableName);
          (box as HTMLElement).style.cursor = 'pointer';
          
          // Add CSS class for table entity identification
          box.classList.add('table-entity');
          
          // Accessibility only
          box.setAttribute('role', 'button');
          box.setAttribute('tabindex', '0');
          box.setAttribute('aria-label', `Select table ${foundTableName}`);
          
          // Keyboard navigation
          box.addEventListener('keydown', (event) => {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
              event.preventDefault();
              handleTableClick(foundTableName);
            }
          });
          
          clickableCount++;
          tablesFound.push(foundTableName);
        }
      });
      
      
      
      
      // Handle ghost tables (cross-domain references) before external table references
      let ghostTablesFound = 0;
      
      // Extract ghost table metadata from Mermaid source (new approach)
      const ghostTableMap = new Map<string, string>();
      
      if (mermaidCode.includes('GHOST-META:')) {
        // Try multiple regex patterns to match different ghost metadata formats
        const patterns = [
          /%% GHOST-META: (\w+) -> (domain_\d+)/g,
          /%% GHOST-META: (\w+) -> (\w+)/g,
          /GHOST-META: (\w+) -> (domain_\d+)/g,
          /GHOST-META: (\w+) -> (\w+)/g
        ];
        
        let foundMatches = false;
        
        for (const pattern of patterns) {
          // Use matchAll for proper capture group extraction with global patterns
          const matches = Array.from(mermaidCode.matchAll(pattern));
          if (matches.length > 0) {
            foundMatches = true;
            matches.forEach((matchResult) => {
              const [, tableName, targetDomain] = matchResult;
              if (tableName && targetDomain) {
                ghostTableMap.set(tableName, targetDomain);
              }
            });
            break; // Use first matching pattern
          }
        }
        
        if (!foundMatches) {
            mermaidCode.substring(0, 500));
        }
      }
      
      
      if (ghostTableMap.size === 0) {
      }
      
      tablesFound.forEach(tableName => {
        
        // Environment-specific entity ID pattern detection (verified approach)
        const entitySelectors = [
          `g[data-table-name="${tableName}"]`,           // Current pattern
          `[id^="entity-${tableName}"]`,                // Mermaid Live pattern  
          `[id^="${tableName}-"]`,                       // Alternative pattern
          `g[id*="${tableName}"]`,                       // Fallback pattern
          `g[id="entity-${tableName}"]`                  // Exact match pattern
        ];

        let tableElement = null;
        let usedSelector = null;
        for (const selector of entitySelectors) {
          tableElement = svgElement.querySelector(selector);
          if (tableElement) {
            usedSelector = selector;
            break;
          }
        }
        
        if (!tableElement) {
          // Try to find by text content in the actual detected boxes
          const boxesWithThisTable = entityBoxes.filter(box => {
            const textElements = Array.from(box.querySelectorAll('text, tspan, span'));
            return textElements.some(textEl => (textEl.textContent || '').trim() === tableName);
          });
          
          if (boxesWithThisTable.length > 0) {
            tableElement = boxesWithThisTable[0];
            usedSelector = 'text-content-match';
          }
        }
        
        if (tableElement) {
          // Check if this is a ghost table using metadata map (new approach)
          const isGhostTable = ghostTableMap.has(tableName);
          const targetDomain = ghostTableMap.get(tableName);
          
          
          if (isGhostTable && targetDomain) {
            
            
            try {
              // Apply ghost table styling
              tableElement.classList.add('ghost-table');
              tableElement.setAttribute('data-ghost-table', 'true');
              tableElement.setAttribute('data-target-domain', targetDomain);
              tableElement.style.pointerEvents = 'auto';
              
            
              // Set pointer cursor for ghost table navigation
              tableElement.style.cursor = 'pointer';
              
              // Add click handler for ghost table navigation
              tableElement.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                if (onExternalTableClick) {
                  onExternalTableClick(tableName, targetDomain);
                }
              });
              
              ghostTablesFound++;
              
            } catch (error) {
              console.error(`👻 [ERROR] Failed to set up ghost table "${tableName}":`, error);
            }
          } else {
            // Suppress excessive ghost table debug logs for regular tables
            // Only log if this appears to be an unexpected issue
          }
        }
      });
      
      if (ghostTableMap.size > 0) {
      }
      
      if (ghostTablesFound > 0) {
        
      } else {
        if (ghostTableMap.size > 0) {
        } else {
        }
      }
      
      // Now handle external table references (FK references to tables in other domains)
      const externalTables = identifyExternalTables(tablesFound);
      let externalReferencesAdded = 0;
      
      if (externalTables.size > 0) {
        
        // Find text elements that might contain FK column names
        const textElements = Array.from(svgElement.querySelectorAll('text, span, tspan'));
        
        textElements.forEach(textElement => {
          const content = textElement.textContent?.trim();
          if (content && content.includes('FK')) {
            // Look for external table names in the text content
            externalTables.forEach(externalTable => {
              // Check if this text content relates to the external table
              // This could be enhanced with more sophisticated pattern matching
              if (content.toLowerCase().includes(externalTable.toLowerCase()) || 
                  content.toLowerCase().includes(externalTable.toLowerCase() + '_id')) {
                
                // Create a clickable element for the external table reference
                const clickableSpan = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'text');
                clickableSpan.textContent = `→ ${externalTable}`;
                clickableSpan.setAttribute('fill', '#888');
                clickableSpan.setAttribute('font-style', 'italic');
                clickableSpan.setAttribute('cursor', 'pointer');
                clickableSpan.setAttribute('data-external-table', externalTable);
                
                // Position near the FK text
                const bbox = textElement.getBBox ? textElement.getBBox() : { x: 0, y: 0 };
                clickableSpan.setAttribute('x', (bbox.x + 100).toString());
                clickableSpan.setAttribute('y', bbox.y.toString());
                
                // Add click handler for external table navigation
                clickableSpan.addEventListener('click', (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleExternalTableClick(externalTable, event);
                });
                
                // Add to the SVG
                const parentElement = textElement.parentNode;
                if (parentElement) {
                  parentElement.appendChild(clickableSpan);
                  externalReferencesAdded++;
                }
                
              }
            });
          }
        });
        
      }
      
      // Update debugging info
      setClickableTablesCount(clickableCount);
      setDetectedTables(tablesFound);
      
      // Return the enhanced SVG with external table references
      const serializer = new XMLSerializer();
      const enhancedSvg = serializer.serializeToString(svgDoc);
      
      return enhancedSvg;
      
    } catch (error) {
      console.error('Error setting up table detection:', error);
      return svgString; // Return original if setup fails
    }
  }, [handleTableClick, identifyExternalTables, handleExternalTableClick, domain, mermaidCode]);

  // Note: Removed CSS injection-based styling to prevent conflicts with direct DOM styling

  // Apply clean SVG content without styling - including domain change detection
  useEffect(() => {
    
    if (originalSvgContent && !isInitialStylingComplete) {
      const cleanSvg = applySVGDomainStyling(originalSvgContent);
      const wrappedSvg = wrapSVGWithTransformGroup(cleanSvg);
      setBaseSvgContent(wrappedSvg);
      setSvgContent(wrappedSvg);
      setIsInitialStylingComplete(true);
    } else {
    }
  }, [originalSvgContent, applySVGDomainStyling, wrapSVGWithTransformGroup, isInitialStylingComplete, domain]);
  
  // Reset styling completion flag when domain changes to ensure ghost table detection runs
  useEffect(() => {
    setIsInitialStylingComplete(false);
  }, [domain]);
  
  // Apply selection styling when selection changes - consolidated with domain styling
  useEffect(() => {
    if (baseSvgContent && isInitialStylingComplete) {
      // Just use the base styled content, no additional CSS injection
      setSvgContent(baseSvgContent);
      
      // Only handle legacy centering if it's NOT a search-triggered selection
      if (needsCenteringAfterStyling && !isSearchTriggered) {
        setTimeout(() => {
          centerOnTable(needsCenteringAfterStyling.tableName);
          setNeedsCenteringAfterStyling(null);
        }, 300); // Increased delay to ensure DOM updates complete and elements are positioned
      }
    }
  }, [selectedTable, highlightedTables, baseSvgContent, isInitialStylingComplete, needsCenteringAfterStyling, centerOnTable, isSearchTriggered]);

  // Apply simple table selection highlighting (restored working system)
  useEffect(() => {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer || !selectedTable) return;

    
    // RACE CONDITION DEBUG: Track DOM element lifecycle
    const trackElementLifecycle = (tableName: string) => {
      const svg = svgContainer.querySelector('svg');
      if (svg) {
        const tableElement = svg.querySelector(`g[data-table-name="${tableName}"]`) || 
                            svg.querySelector(`g[id*="entity-${tableName}"]`);
        
        if (tableElement) {
          const elementId = tableElement.getAttribute('id');
          const hasClass = tableElement.classList.contains('table-selected');
          
          // Monitor this element for changes
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const currentHasClass = (mutation.target as Element).classList.contains('table-selected');
              }
            });
          });
          
          observer.observe(tableElement, { attributes: true, attributeFilter: ['class'] });
          
          // Clean up observer after 10 seconds
          setTimeout(() => observer.disconnect(), 10000);
          
          return { elementId, hasClass };
        } else {
          return null;
        }
      }
      return null;
    };
    
    // Track element before clearing
    const beforeClear = trackElementLifecycle(selectedTable);
    
    // Always clear old highlighting first
    const oldHighlighted = svgContainer.querySelectorAll('.table-selected, .relationship-highlighted');
    oldHighlighted.forEach(el => {
      const elementId = el.getAttribute('id');
      el.classList.remove('table-selected', 'relationship-highlighted');
    });
    svgContainer.classList.remove('has-selection');

    // Enhanced retry mechanism for robust highlighting during domain switches
    const attemptHighlighting = (attempt: number = 1, maxAttempts: number = 5) => {
      
      const svgRoot = svgContainer.querySelector('svg');
      if (!svgRoot) {
        if (attempt < maxAttempts) {
          setTimeout(() => attemptHighlighting(attempt + 1, maxAttempts), 200);
        }
        return;
      }
      
      // Check SVG dimensions to ensure it's fully rendered
      const svgRect = svgRoot.getBoundingClientRect();
      if (svgRect.width === 0 || svgRect.height === 0) {
        if (attempt < maxAttempts) {
          setTimeout(() => attemptHighlighting(attempt + 1, maxAttempts), 250);
        }
        return;
      }
      
      // Try multiple selector strategies to find the table element (same as recovery mechanism)
      let selectedEntity = svgRoot.querySelector(`g[data-table-name="${selectedTable}"]`) ||
                          svgRoot.querySelector(`g[id*="entity-${selectedTable}"]`) ||
                          svgRoot.querySelector(`g[class*="node"][id*="${selectedTable}"]`);
      
      // Fallback: search by text content
      if (!selectedEntity) {
        const nodeElements = Array.from(svgRoot.querySelectorAll('g.node, g[class*="node"]'));
        selectedEntity = nodeElements.find(node => {
          const textElements = Array.from(node.querySelectorAll('text, tspan, span.nodeLabel'));
          return textElements.some(text => (text.textContent || '').trim() === selectedTable);
        });
      }
          
      if (selectedEntity) {
        
        // Apply table highlighting
        selectedEntity.classList.add('table-selected');
        
        // RACE CONDITION DEBUG: Verify class was actually applied and monitor persistence
        const elementId = selectedEntity.getAttribute('id');
        const hasClassAfterAdd = selectedEntity.classList.contains('table-selected');
        
        // Monitor if class persists for next 5 seconds
        const monitorPersistence = () => {
          let checkCount = 0;
          const checkInterval = setInterval(() => {
            checkCount++;
            const stillHasClass = selectedEntity.classList.contains('table-selected');
            const stillInDOM = document.contains(selectedEntity);
            
            
            if (!stillInDOM) {
              clearInterval(checkInterval);
            } else if (!stillHasClass) {
              clearInterval(checkInterval);
            }
            
            if (checkCount >= 10) { // Check for 5 seconds (500ms * 10)
              clearInterval(checkInterval);
            }
          }, 500);
        };
        
        monitorPersistence();
        
        // Enable dimming by adding container class
        svgContainer.classList.add('has-selection');
        
        // Highlight relationship lines (smart path detection)
        const relationships = parseRelationships(mermaidCode);
        const connectedTables = relationships.get(selectedTable) || [];
        
        if (connectedTables.length > 0) {
          
          // Smart approach: find paths that connect the selected table to its related tables
          const relationshipPaths = svgRoot.querySelectorAll('path[id*="entity-"], .edgePath path');
          let highlightedCount = 0;
              
          relationshipPaths.forEach(path => {
            const pathId = path.getAttribute('id') || '';
            
            // Check if this path connects the selected table to any of its connected tables
            const connectsSelectedTable = connectedTables.some(connectedTable => {
              // Try multiple path ID patterns to match different Mermaid versions
              const patterns = [
                // Standard pattern: "id_entity-TableA-X_entity-TableB-Y_Z"
                () => pathId.includes(`entity-${selectedTable}-`) && pathId.includes(`entity-${connectedTable}-`),
                // Alternative pattern: "entity-TableA_entity-TableB"
                () => pathId.includes(`entity-${selectedTable}_entity-${connectedTable}`) || 
                       pathId.includes(`entity-${connectedTable}_entity-${selectedTable}`),
                // Underscore separated: "TableA_TableB"  
                () => pathId.includes(`${selectedTable}_${connectedTable}`) || 
                       pathId.includes(`${connectedTable}_${selectedTable}`),
                // Dash separated: "TableA-TableB"
                () => pathId.includes(`${selectedTable}-${connectedTable}`) || 
                       pathId.includes(`${connectedTable}-${selectedTable}`)
              ];
              
              return patterns.some(pattern => pattern());
            });
            
            if (connectsSelectedTable) {
              path.classList.add('relationship-highlighted');
              highlightedCount++;
            }
          });
          
          if (highlightedCount > 0) {
          }
        } else {
        }
        
      } else if (attempt < maxAttempts) {
        // Retry if element not found yet (SVG might still be rendering)
        setTimeout(() => attemptHighlighting(attempt + 1, maxAttempts), 200 * attempt);
      } else {
      }
    };
    
    // Start highlighting attempts with improved delay for domain switches
    const initialDelay = svgContainer.querySelector('svg') ? 100 : 300; // Less delay if SVG already exists
    setTimeout(() => attemptHighlighting(), initialDelay);
  }, [selectedTable, svgContent]); // Re-added svgContent to handle domain switches with unified system

  // Re-apply highlighting when SVG content changes (for domain switches)
  useEffect(() => {
    // Use selectedTable if available, otherwise fall back to selectedTableFromSearch during ghost table navigation
    const targetTable = selectedTable || selectedTableFromSearch;
    
    if (targetTable && svgContent) {
      // Retry mechanism for robust highlighting during multiple SVG re-renders
      const attemptHighlighting = (attempt: number = 1, maxAttempts: number = 3) => {
        const svgContainer = svgContainerRef.current;
        if (svgContainer) {
          // Try multiple selector strategies to find the table element
          const selectedEntity = svgContainer.querySelector(`g[data-table-name="${targetTable}"]`) ||
                                svgContainer.querySelector(`g[id*="entity-${targetTable}"]`) ||
                                svgContainer.querySelector(`g[class*="node"][id*="${targetTable}"]`) ||
                                svgContainer.querySelector(`g.node:has(text[text-content="${targetTable}"])`) ||
                                Array.from(svgContainer.querySelectorAll('g.node')).find(node => {
                                  const textElements = Array.from(node.querySelectorAll('text, tspan'));
                                  return textElements.some(text => (text.textContent || '').trim() === targetTable);
                                });
          
          if (selectedEntity) {
            if (!selectedEntity.classList.contains('table-selected')) {
              selectedEntity.classList.add('table-selected');
              svgContainer.classList.add('has-selection');
              
              // Re-apply relationship highlighting
              const relationships = parseRelationships(mermaidCode);
              const connectedTables = relationships.get(targetTable) || [];
              
              if (connectedTables.length > 0) {
                const svgRoot = svgContainer.querySelector('svg');
                if (svgRoot) {
                  const relationshipPaths = svgRoot.querySelectorAll('path[id*="entity-"]');
                  relationshipPaths.forEach(path => {
                    const pathId = path.getAttribute('id') || '';
                    const connectsSelectedTable = connectedTables.some(connectedTable => {
                      // Try multiple path ID patterns to match different Mermaid versions
                      const patterns = [
                        // Standard pattern: "id_entity-TableA-X_entity-TableB-Y_Z"
                        () => pathId.includes(`entity-${targetTable}-`) && pathId.includes(`entity-${connectedTable}-`),
                        // Alternative pattern: "entity-TableA_entity-TableB"
                        () => pathId.includes(`entity-${targetTable}_entity-${connectedTable}`) || 
                               pathId.includes(`entity-${connectedTable}_entity-${targetTable}`),
                        // Underscore separated: "TableA_TableB"  
                        () => pathId.includes(`${targetTable}_${connectedTable}`) || 
                               pathId.includes(`${connectedTable}_${targetTable}`),
                        // Dash separated: "TableA-TableB"
                        () => pathId.includes(`${targetTable}-${connectedTable}`) || 
                               pathId.includes(`${connectedTable}-${targetTable}`)
                      ];
                      
                      return patterns.some(pattern => pattern());
                    });
                    
                    if (connectsSelectedTable) {
                      path.classList.add('relationship-highlighted');
                    }
                  });
                }
              }
            }
          } else if (attempt < maxAttempts) {
            // Retry if element not found yet (SVG might still be rendering)
            setTimeout(() => attemptHighlighting(attempt + 1, maxAttempts), 200 * attempt);
          }
        }
      };
      
      // Initial delay for SVG rendering, then start highlighting attempts
      const timeoutId = setTimeout(() => {
        attemptHighlighting();
      }, 300); // Further increased delay for domain switch SVG rendering and ghost table processing
      
      return () => clearTimeout(timeoutId);
    }
  }, [svgContent, selectedTable, selectedTableFromSearch, mermaidCode, parseRelationships]);


  // Debug: Track selectedTableFromSearch prop changes
  useEffect(() => {
    // Clear the last processed ref when search selection is cleared
    if (!selectedTableFromSearch) {
      lastProcessedSearchTable.current = null;
    }
  }, [selectedTableFromSearch]);

  // Handle external table selection from search
  useEffect(() => {
    
    // Only process if this is a new search selection (not a repeated one)
    // AND if SVG content is actually loaded (prevents initial focus on page load)
    if (selectedTableFromSearch && 
        selectedTableFromSearch !== lastProcessedSearchTable.current &&
        svgContent.length > 0) {
      
      
      // Update the last processed ref
      lastProcessedSearchTable.current = selectedTableFromSearch;
      
      // Mark this as a search-triggered selection for immediate centering
      setSearchTargetTable(selectedTableFromSearch);
      setIsSearchTriggered(true);
      
      // CRITICAL FIX: Wait for domain switch to complete before calling handleTableClick
      // This ensures the SVG content is fully rendered before highlighting attempts
      const waitForDomainSwitch = () => {
        // Check if SVG content is available with the target table
        const svgContainer = svgContainerRef.current;
        if (svgContainer) {
          const svg = svgContainer.querySelector('svg');
          const tableElement = svg?.querySelector(`g[data-table-name="${selectedTableFromSearch}"]`) ||
                               svg?.querySelector(`g[id*="entity-${selectedTableFromSearch}"]`);
          
          if (tableElement && svg) {
            
            // Now trigger the table click with proper domain switch flag
            handleTableClick(selectedTableFromSearch, undefined, false, true);
            
            // Notify parent that table selection is complete (delayed to allow highlighting to stabilize)
            if (onTableSelectionComplete) {
              setTimeout(() => {
                onTableSelectionComplete(selectedTableFromSearch);
              }, 200); // Increased delay to allow highlighting to fully complete
            }
            
          } else {
            // Retry after a short delay if SVG isn't ready
            setTimeout(waitForDomainSwitch, 100);
          }
        } else {
          setTimeout(waitForDomainSwitch, 100);
        }
      };
      
      // Start waiting for domain switch to complete
      // Add a small initial delay to allow domain switching to begin
      setTimeout(waitForDomainSwitch, 200);
    }
  }, [selectedTableFromSearch, selectedTable, handleTableClick, onTableSelectionComplete]);





  // Enhanced centering for search results with cross-domain support and retry mechanism
  useEffect(() => {
    
    if (searchTargetTable && isSearchTriggered && svgContent && baseSvgContent) {
      
      // Enhanced centering function with retry mechanism
      const attemptCentering = (attempt: number = 1, maxAttempts: number = 3) => {
        
        // Check if table element exists before attempting to center
        const svgContainer = svgContainerRef.current;
        const tableElement = svgContainer?.querySelector(`g[data-table-name="${searchTargetTable}"]`);
        
        if (tableElement) {
          centerOnTable(searchTargetTable);
          
          // Trigger table selection after successful centering
          handleTableClick(searchTargetTable, undefined, false, true);
          
          // Clear search target after successful centering
          setSearchTargetTable(null);
          setIsSearchTriggered(false);
        } else if (attempt < maxAttempts) {
          setTimeout(() => attemptCentering(attempt + 1, maxAttempts), 200 * attempt);
        } else {
          console.error(`❌ Failed to find table "${searchTargetTable}" after ${maxAttempts} attempts`);
          // Clear search target even if centering failed to prevent infinite retry
          setSearchTargetTable(null);
          setIsSearchTriggered(false);
        }
      };
      
      // Use longer timeout for cross-domain navigation, shorter for same-domain
      const isLikelyCrossDomain = !svgContainerRef.current?.querySelector(`g[data-table-name="${searchTargetTable}"]`);
      const initialDelay = isLikelyCrossDomain ? 500 : 200; // 500ms for cross-domain, 200ms for same-domain
      
      
      const timeoutId = setTimeout(() => attemptCentering(), initialDelay);
      return () => clearTimeout(timeoutId);
    }
  }, [svgContent, searchTargetTable, isSearchTriggered, baseSvgContent, centerOnTable, handleTableClick]);

  // Enhanced domain switch completion detection
  useEffect(() => {
    if (searchTargetTable && !isSearchTriggered && svgContent) {
      // This handles the case where domain switch completed and ERD re-rendered
      setIsSearchTriggered(true);
    }
  }, [svgContent, searchTargetTable, isSearchTriggered]);

  // Background click handler to clear selection
  useEffect(() => {
    const handleBackgroundClick = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Only handle clicks within the SVG container
      if (!svgContainerRef.current?.contains(target)) {
        return;
      }
      
      // Check if the click was on a table element or any of its children
      const clickedTable = target.closest('g[data-table-name]');
      
      // If no table was clicked and we have a selection, clear it
      if (!clickedTable && selectedTable) {
        handleClearSelectionOnly();
      }
    };
    
    // Add event listener for background clicks
    document.addEventListener('click', handleBackgroundClick, true);
    
    return () => {
      document.removeEventListener('click', handleBackgroundClick, true);
    };
  }, [selectedTable, handleClearSelection]);

  // Bind ERD event handlers after SVG content is rendered
  useEffect(() => {
    if (svgContent && svgContainerRef.current) {
      
      // Small delay to ensure SVG is fully rendered in the DOM
      const timeoutId = setTimeout(() => {
        bindERDEventHandlers();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    } else {
        svgContent: !!svgContent,
        svgContainerRef: !!svgContainerRef.current
      });
    }
  }, [svgContent, bindERDEventHandlers]);

  const createSimplifiedERD = (fullCode: string): string => {
    // Analyze relationships to find key tables by domain
    const lines = fullCode.split('\n');
    const tables: Record<string, string[]> = {};
    const relationships: string[] = [];
    const relationshipCounts: Record<string, number> = {};
    
    // Parse tables and count relationships
    let currentTable = '';
    let inTable = false;
    
    for (const line of lines) {
      if (line.trim().includes('{') && !inTable) {
        currentTable = line.trim().split(' ')[0];
        tables[currentTable] = [line];
        inTable = true;
        relationshipCounts[currentTable] = 0;
      } else if (line.trim() === '}' && inTable) {
        tables[currentTable].push(line);
        inTable = false;
      } else if (inTable) {
        tables[currentTable].push(line);
      } else if (line.trim().includes('||') || line.trim().includes('}|')) {
        relationships.push(line);
        // Count relationships for each table
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const table1 = parts[0];
          const table2 = parts[2];
          relationshipCounts[table1] = (relationshipCounts[table1] || 0) + 1;
          relationshipCounts[table2] = (relationshipCounts[table2] || 0) + 1;
        }
      }
    }
    
    // Identify key domains and their central tables
    const keyTables = new Set<string>();
    
    // Domain 1: User Management (OSSYS_USER, OSSYS_ROLE, etc.)
    const userTables = Object.keys(tables).filter(name => 
      name.includes('User') || name.includes('Role') || name.includes('Group')
    );
    userTables.forEach(table => keyTables.add(table));
    
    // Domain 2: Opportunities
    const opportunityTables = Object.keys(tables).filter(name => 
      name.includes('Opportunity') && relationshipCounts[name] > 2
    ).slice(0, 4);
    opportunityTables.forEach(table => keyTables.add(table));
    
    // Domain 3: Active Campaign
    const campaignTables = Object.keys(tables).filter(name => 
      name.includes('Campaign') && relationshipCounts[name] > 1
    ).slice(0, 3);
    campaignTables.forEach(table => keyTables.add(table));
    
    // Add any high-relationship tables we might have missed
    const topRelatedTables = Object.entries(relationshipCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 12)
      .map(([name]) => name);
    
    topRelatedTables.forEach(table => keyTables.add(table));
    
    // Build simplified ERD
    const erdLines = ['erDiagram'];
    
    // Add selected tables
    keyTables.forEach(tableName => {
      if (tables[tableName]) {
        erdLines.push(...tables[tableName]);
      }
    });
    
    // Add relationships between selected tables
    relationships.forEach(rel => {
      const parts = rel.trim().split(/\s+/);
      if (parts.length >= 3) {
        const table1 = parts[0];
        const table2 = parts[2];
        if (keyTables.has(table1) && keyTables.has(table2)) {
          erdLines.push(rel);
        }
      }
    });
    
    return erdLines.join('\n');
  };



  const handleDownloadSVG = () => {
    if (!svgContent) return;

    // Extract SVG from the HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'text/html');
    const svgElement = doc.querySelector('svg');
    
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'erd-diagram.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMermaidCode = async () => {
    if (!mermaidCode) return;

    try {
      await navigator.clipboard.writeText(mermaidCode);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  if (isLoading || isRendering) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : 'Rendering diagram...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!mermaidCode) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-4 mx-auto">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload and process an Excel file to see the ERD
          </p>
        </div>
      </div>
    );
  }

  // Codemaster panel helper functions
  const hasCodemasterMappings = (tableName: string): boolean => {
    return codemasterMappings.some(mapping => mapping.tableName === tableName);
  };

  const getTableCodemasterMappings = (tableName: string): CodemasterMapping[] => {
    return codemasterMappings.filter(mapping => mapping.tableName === tableName);
  };

  const handleCodemasterToggle = () => {
    if (selectedTable && hasCodemasterMappings(selectedTable)) {
      setIsCodemasterPanelVisible(!isCodemasterPanelVisible);
      setSelectedField(null); // Reset field selection when toggling
    }
  };

  const handleCodemasterFieldClick = (tableName: string, fieldName: string) => {
    setSelectedTable(tableName);
    setSelectedField(fieldName);
    setIsCodemasterPanelVisible(true);
    if (onFieldClick) {
      onFieldClick(tableName, fieldName);
    }
  };

  const handleCodemasterPanelClose = () => {
    setIsCodemasterPanelVisible(false);
    setSelectedField(null);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Action buttons */}
      <div className="flex justify-end space-x-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyMermaidCode}
          className="flex items-center gap-2"
        >
          <Copy className="h-4 w-4" />
          Copy Code
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadSVG}
          className="flex items-center gap-2"
          disabled={!svgContent}
        >
          <Download className="h-4 w-4" />
          Download SVG
        </Button>
        {selectedTable && hasCodemasterMappings(selectedTable) && (
          <Button
            variant={isCodemasterPanelVisible ? "default" : "outline"}
            size="sm"
            onClick={handleCodemasterToggle}
            className="flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            Code Values
          </Button>
        )}
      </div>

      {/* Responsive SVG container - industry standard approach */}
      <div 
        className="border rounded-lg p-4 bg-white dark:bg-gray-900 flex-1 relative"
        style={{ 
          width: '100%',
          height: '100%',
          overflow: 'hidden' // Prevent control overflow
        }}
      >
        {svgContent ? (
          <>
            {/* SVG content container with responsive styling and domain classes */}
            <div 
              ref={svgContainerRef}
              dangerouslySetInnerHTML={{ __html: svgContent }}
              style={{ 
                width: '100%',
                height: '100%',
                minHeight: '400px', // Prevent complete collapse
                position: 'relative'
              }}
              className={`erd-svg-container ${domain ? `domain-${domain}` : ''}`}
            />
            
            {/* Compact Interactive Controls */}
            <div 
              className="erd-controls absolute top-4 left-4 flex flex-col gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border p-2"
              style={{ 
                zIndex: 100, 
                maxHeight: '200px', 
                maxWidth: '180px',
                width: 'auto',
                height: 'auto',
                overflow: 'auto',
                boxSizing: 'border-box'
              }}
            >
              {/* View Mode Selection */}
              <div className="flex flex-col gap-1 border-b pb-2 mb-2">
                <div className="text-xs text-muted-foreground px-1">View Mode</div>
                <div className="flex gap-1">
                  <Button
                    variant={viewMode === 'overview' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewModeChange('overview')}
                    title="Overview (Fit All)"
                    className="h-7 px-2 text-xs"
                  >
                    All
                  </Button>
                  <Button
                    variant={viewMode === 'detail' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewModeChange('detail')}
                    title="Detail View (150%)"
                    className="h-7 px-2 text-xs"
                  >
                    Detail
                  </Button>
                  <Button
                    variant={viewMode === 'focus' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewModeChange('focus')}
                    title="Focus View (200%)"
                    className="h-7 px-2 text-xs"
                  >
                    Focus
                  </Button>
                </div>
              </div>

              {/* Combined Controls: Zoom + Navigation + Pan */}
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomIn}
                  title="Zoom In (+)"
                  className="h-8 w-8 p-0"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomOut}
                  title="Zoom Out (-)"
                  className="h-8 w-8 p-0"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  title="Reset View (R)"
                  className="h-8 w-8 p-0"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant={isPanEnabled ? "default" : "ghost"}
                  size="sm"
                  onClick={handleTogglePan}
                  title="Toggle Pan Mode (Space)"
                  className="h-8 w-8 p-0"
                >
                  <Move className="h-4 w-4" />
                </Button>
                
                {/* Debug tooltip test button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTooltip({
                      visible: true,
                      x: 200,
                      y: 100,
                      content: 'Test tooltip content\nMultiple lines',
                      tableName: 'TestTable',
                      columnName: 'TestColumn'
                    });
                    setTimeout(() => setTooltip(prev => ({ ...prev, visible: false })), 3000);
                  }}
                  title="Test Tooltip"
                  className="h-8 w-8 p-0 bg-blue-500 text-white"
                >
                  T
                </Button>
              </div>

              {/* Selection Info */}
              {selectedTable && (
                <div className="border-t pt-2 mt-2">
                  <div className="text-xs text-muted-foreground px-1 mb-1">Selected</div>
                  <div className="text-xs font-medium px-1 truncate max-w-20" title={selectedTable}>
                    {selectedTable}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                    title="Clear Selection"
                    className="h-6 w-full mt-1 text-xs"
                  >
                    Clear
                  </Button>
                </div>
              )}


              
              {/* Zoom indicator */}
              <div className="text-xs text-center text-muted-foreground mt-1">
                {Math.round(currentZoom * 100)}%
              </div>
            </div>

          </>
        ) : mermaidCode ? (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground">
            <div>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <div>Processing ERD diagram...</div>
              <div className="text-xs mt-2">Using industry-standard responsive rendering</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground">
            Upload an Excel file to see the ERD
          </div>
        )}
      </div>


      {/* Enhanced Codemaster Tooltip with Responsive Sizing */}
      {tooltip.visible && (
        <div
          className={`codemaster-tooltip ${isDraggingTooltip ? 'dragging' : ''}`}
          style={{
            left: tooltip.x,
            top: tooltip.y,
            cursor: isDraggingTooltip ? 'grabbing' : 'default',
            // Dynamic CSS custom properties for container-relative sizing
            '--tooltip-width': `${tooltip.calculatedWidth || 350}px`,
            '--tooltip-max-height': `${tooltip.calculatedHeight || 250}px`,
            '--tooltip-min-width': `${Math.min(280, (tooltip.calculatedWidth || 350) * 0.8)}px`,
            '--tooltip-min-height': '120px',
            '--tooltip-max-width': `${tooltip.calculatedWidth || 350}px`
          } as React.CSSProperties}
        >
          {/* Title Bar with Drag Handle and Close Button */}
          <div
            className="codemaster-tooltip-title"
            onMouseDown={handleTooltipDragStart}
          >
            <div className="flex items-center space-x-2">
              <div className="table-name">
                {tooltip.tableName}
              </div>
              <div className="drag-hint">
                ⋮⋮ drag to move
              </div>
            </div>
            <button
              onClick={handleTooltipClose}
              className="codemaster-tooltip-close"
              title="Close tooltip"
            >
              ✕
            </button>
          </div>
          
          {/* Content Area */}
          <div className="codemaster-tooltip-content">
            <div className="content-text">
              {tooltip.content}
            </div>
          </div>
          
          {/* Optional resize handle in bottom-right corner */}
          <div className="codemaster-tooltip-resize">
            ⋱
          </div>
        </div>
      )}

      {/* Codemaster Panel */}
      <CodemasterPanel
        selectedTable={selectedTable}
        selectedField={selectedField}
        codemasterMappings={codemasterMappings}
        isVisible={isCodemasterPanelVisible}
        onClose={handleCodemasterPanelClose}
        onFieldClick={handleCodemasterFieldClick}
      />
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
const MemoizedERDRenderer = memo(ERDRenderer, (prevProps, nextProps) => {
  // Only re-render if essential props change
  return (
    prevProps.mermaidCode === nextProps.mermaidCode &&
    prevProps.isDarkMode === nextProps.isDarkMode &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.domain === nextProps.domain &&
    prevProps.selectedTableFromSearch === nextProps.selectedTableFromSearch &&
    prevProps.codemasterMappings === nextProps.codemasterMappings
  );
});

export default MemoizedERDRenderer;
