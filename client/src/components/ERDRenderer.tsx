import React, { useEffect, useState, memo, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Download, Copy, AlertCircle, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';
import './ERDRenderer.css';

interface ERDRendererProps {
  mermaidCode?: string;
  isDarkMode?: boolean;
  isLoading?: boolean;
  domain?: string;
  selectedTableFromSearch?: string | null;
  domainResults?: Record<string, any>;
  onExternalTableClick?: (tableName: string, targetDomain: string) => void;
}


const ERDRenderer: React.FC<ERDRendererProps> = ({
  mermaidCode = '',
  isDarkMode = false,
  isLoading = false,
  domain,
  selectedTableFromSearch = null,
  domainResults = {},
  onExternalTableClick
}) => {
  
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
  
  // Track last processed selectedTableFromSearch to prevent duplicate processing
  const lastProcessedSearchTable = useRef<string | null>(null);
  
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
      console.error('Mermaid initialization error:', err);
    }
  }, [isDarkMode]);

  // SVG-native transform-based pan-zoom functions (NO CSS transforms)
  const zoomToScale = useCallback((scale: number, centerX?: number, centerY?: number) => {
    console.log(`🔧 SVG-native zoomToScale: scale=${scale}, centerX=${centerX}, centerY=${centerY}`);
    
    if (!svgContainerRef.current) {
      console.error('❌ zoomToScale: Container ref is NULL');
      return;
    }
    
    const container = svgContainerRef.current;
    
    // ALWAYS search for live element instead of using potentially stale refs
    console.log('🔍 Searching for live transform group element...');
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    
    if (!transformGroup) {
      console.error('❌ zoomToScale: Transform group #pan-zoom-group not found in live DOM');
      console.log('🔍 Available elements with IDs:');
      const elementsWithIds = container.querySelectorAll('[id]');
      elementsWithIds.forEach((el, i) => {
        console.log(`  ${i + 1}. ${el.tagName}#${el.id}`);
      });
      return;
    }
    
    // Verify element is connected to the document
    const isConnected = document.contains(transformGroup);
    console.log('🔍 Element verification:');
    console.log('  - Found transform group:', transformGroup);
    console.log('  - Element connected to document:', isConnected);
    
    if (!isConnected) {
      console.error('❌ zoomToScale: Transform group found but NOT connected to document');
      return;
    }
    
    console.log('✅ Live transform group element found and verified');
    
    // Validate input parameters
    if (!isFinite(scale) || scale <= 0) {
      console.warn('Invalid scale provided:', scale);
      return;
    }
    
    // Get container dimensions for viewport center calculation
    const containerRect = container.getBoundingClientRect();
    console.log(`📐 Container: ${containerRect.width} x ${containerRect.height}`);
    
    // Get SVG element and its viewBox (SVG coordinate space)
    const svg = container.querySelector('svg') as SVGSVGElement;
    const viewBoxAttr = svg.getAttribute('viewBox');
    console.log(`📊 SVG viewBox: "${viewBoxAttr}"`);
    
    // Parse viewBox to understand SVG coordinate system
    let viewBoxX = 0, viewBoxY = 0, viewBoxWidth = 800, viewBoxHeight = 600; // defaults
    if (viewBoxAttr) {
      const viewBoxParts = viewBoxAttr.split(' ').map(Number);
      if (viewBoxParts.length === 4) {
        [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = viewBoxParts;
        console.log(`📊 Parsed viewBox: x=${viewBoxX}, y=${viewBoxY}, w=${viewBoxWidth}, h=${viewBoxHeight}`);
      }
    }
    
    // Calculate viewport center in SVG coordinate space
    const viewportCenterX = viewBoxX + viewBoxWidth / 2;
    const viewportCenterY = viewBoxY + viewBoxHeight / 2;
    console.log(`📍 Viewport center in SVG space: (${viewportCenterX}, ${viewportCenterY})`);
    
    // Determine the point to center on
    let targetCenterX, targetCenterY;
    
    if (centerX !== undefined && centerY !== undefined) {
      // Use provided SVG coordinates (already in SVG coordinate space)
      targetCenterX = centerX;
      targetCenterY = centerY;
      console.log(`🎯 Using provided target: (${targetCenterX}, ${targetCenterY})`);
    } else {
      // No specific target - zoom on current viewport center
      targetCenterX = viewportCenterX;
      targetCenterY = viewportCenterY; 
      console.log(`🎯 Using viewport center as target: (${targetCenterX}, ${targetCenterY})`);
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
      console.error('🚨 Invalid transform calculation detected!');
      console.error(`  - finalTranslateX: ${finalTranslateX}`);
      console.error(`  - finalTranslateY: ${finalTranslateY}`);
      console.error(`  - scale: ${scale}`);
      return;
    }
    
    // Create the SVG transform string (ONLY SVG, no CSS)
    const svgTransformString = `translate(${finalTranslateX}, ${finalTranslateY}) scale(${scale})`;
    
    console.log(`🧮 SVG Transform calculation:`);
    console.log(`  - Target point: (${targetCenterX}, ${targetCenterY})`);
    console.log(`  - Viewport center: (${viewportCenterX}, ${viewportCenterY})`);
    console.log(`  - Translate to origin: (${translateToOriginX}, ${translateToOriginY})`);
    console.log(`  - Translate to center: (${translateToCenterX}, ${translateToCenterY})`);
    console.log(`  - Final translate: (${finalTranslateX.toFixed(2)}, ${finalTranslateY.toFixed(2)})`);
    console.log(`  - Scale: ${scale}`);
    console.log(`  - SVG transform: "${svgTransformString}"`);
    
    // Clear any CSS transforms that might interfere
    (transformGroup as any).style.transform = '';
    console.log('🧹 Cleared CSS transforms to prevent conflicts');
    
    // Apply ONLY SVG transform attribute (no CSS)
    transformGroup.setAttribute('transform', svgTransformString);
    console.log('✅ Applied SVG-native transform');
    
    // Update state for consistency
    setCurrentZoom(scale);
    setCurrentPan({ x: finalTranslateX, y: finalTranslateY });
    
    // Verify transform was applied
    setTimeout(() => {
      const actualTransform = transformGroup.getAttribute('transform');
      console.log(`🔍 Verification - Applied transform: "${actualTransform}"`);
      
      // Check that no CSS transforms are applied
      const computedStyles = window.getComputedStyle(transformGroup);
      console.log('🔍 Verification - CSS transform should be none:', computedStyles.transform);
      
      // Check SVG dimensions (should remain stable)
      const svgRect = svg.getBoundingClientRect();
      console.log(`🔍 Verification - SVG dimensions: ${svgRect?.width} x ${svgRect?.height}`);
      
      if (svgRect?.width === 0 || svgRect?.height === 0) {
        console.error('🚨 SVG collapsed to zero dimensions after transform!');
      } else {
        console.log('✅ SVG dimensions stable after SVG-native transform');
      }
    }, 10);
  }, [currentZoom, currentPan]);
  
  const panToPosition = useCallback((deltaX: number, deltaY: number) => {
    if (!svgContainerRef.current) return;
    
    // Always search for live element
    const container = svgContainerRef.current;
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    
    if (!transformGroup || !document.contains(transformGroup)) {
      console.warn('❌ panToPosition: Transform group not found or disconnected');
      return;
    }
    
    // Update pan position
    const newPanX = currentPan.x + deltaX;
    const newPanY = currentPan.y + deltaY;
    
    // Validate pan values
    if (!isFinite(newPanX) || !isFinite(newPanY)) {
      console.error('🚨 Invalid pan calculation detected!');
      console.error(`  - newPanX: ${newPanX}`);
      console.error(`  - newPanY: ${newPanY}`);
      console.error(`  - deltaX: ${deltaX}`);
      console.error(`  - deltaY: ${deltaY}`);
      return;
    }
    
    console.log(`🔄 SVG-native pan: delta(${deltaX.toFixed(2)}, ${deltaY.toFixed(2)}) -> new pan(${newPanX.toFixed(2)}, ${newPanY.toFixed(2)})`);
    
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
      console.warn('Failed to get transformation matrix, falling back to basic conversion');
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
      console.warn('❌ zoomAtCursor: Transform group not found or disconnected');
      return;
    }

    // Validate inputs
    if (!isFinite(newZoom) || newZoom <= 0) {
      console.warn('Invalid zoom value:', newZoom);
      return;
    }

    // Get cursor position in current transformed coordinate space
    const cursorPos = getTransformedCursorPosition(cursorX, cursorY, container);
    
    console.log(`🎯 Cursor-centered zoom: Client(${cursorX.toFixed(1)}, ${cursorY.toFixed(1)}) -> Transformed(${cursorPos.x.toFixed(1)}, ${cursorPos.y.toFixed(1)})`);
    console.log(`🔍 Zoom: ${currentZoom.toFixed(2)}x -> ${newZoom.toFixed(2)}x`);

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
      console.error('🚨 Invalid cursor-centered zoom calculation!');
      console.error(`  - newPanX: ${newPanX}, newPanY: ${newPanY}`);
      console.error(`  - cursorPos: (${cursorPos.x}, ${cursorPos.y})`);
      console.error(`  - zoomFactor: ${zoomFactor}`);
      return;
    }

    // Apply the new transform
    const svgTransformString = `translate(${newPanX}, ${newPanY}) scale(${newZoom})`;
    
    console.log(`🧮 Cursor-centered transform: "${svgTransformString}"`);
    
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
      console.warn(`Could not find foreignObject or div for table ${tableName}`);
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
    
    console.log(`🔍 SELECTION HANDLES DEBUG for ${tableName}:`);
    console.log(`  - storedOriginalWidth: "${storedOriginalWidth}"`);
    console.log(`  - originalWidth: ${originalWidth}px`);
    console.log(`  - foreignObject height: "${foreignObject.getAttribute('height')}"`);
    console.log(`  - originalHeight: ${originalHeight}px`);
    
    // Simple positioning - use foreignObject coordinates
    const divX = foreignX;
    const divY = foreignY;
    const divWidth = Math.max(originalWidth, 120); // Match the constraint we apply to selected div
    const divHeight = Math.max(originalHeight, 40);
    
    console.log(`  - Calculated handle dimensions: ${divWidth}px x ${divHeight}px`);
    console.log(`  - Handle positions will be at: (${divX}, ${divY}) to (${divX + divWidth}, ${divY + divHeight})`);
    
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
    
    console.log(`✨ Selection handles aligned with content: width=${divWidth.toFixed(0)}px, height=${divHeight.toFixed(0)}px for table: ${tableName}`);
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
    
    console.log(`🔍 Parsing relationships from ${lines.length} lines of ERD code...`);
    
    // Debug: Show first few lines that contain | or - characters
    const potentialRelLines = lines.filter(line => 
      line.includes('|') || line.includes('-')
    ).slice(0, 10);
    console.log(`🔍 Sample potential relationship lines:`, potentialRelLines);
    
    // Debug: Test the specific line we know should match
    const testLine = '  BankStatementAllocation }o--|| PaymentTransaction : "FK PaymentTransactionId"';
    const testPattern = /(\w+)\s*\}o--\|\|\s*(\w+)\s*:\s*"[^"]*"/;
    const testMatch = testLine.match(testPattern);
    console.log(`🧪 SPECIFIC TEST: "${testLine}"`);
    console.log(`🧪 Pattern: ${testPattern.source}`);
    console.log(`🧪 Result: ${testMatch ? `${testMatch[1]} <-> ${testMatch[2]}` : 'NO MATCH'}`);
    
    // Debug: Check if the expected relationship line exists in the mermaidCode
    const expectedLine = 'BankStatementAllocation }o--|| PaymentTransaction';
    const codeContainsExpected = diagramCode.includes(expectedLine);
    console.log(`🧪 MERMAID CODE CONTAINS "${expectedLine}": ${codeContainsExpected}`);
    
    // Debug: Show lines around PaymentTransaction in the split result
    const paymentLines = lines.filter((line, index) => {
      const contains = line.includes('PaymentTransaction');
      if (contains) {
        console.log(`🧪 LINE ${index}: "${line}"`);
      }
      return contains;
    });
    console.log(`🧪 Found ${paymentLines.length} lines containing PaymentTransaction in split result`);
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Debug: Log ALL lines that contain PaymentTransaction to see what we're actually processing
      if (trimmedLine.includes('PaymentTransaction')) {
        console.log(`🔍 RAW LINE: "${line}"`);
        console.log(`🔍 TRIMMED: "${trimmedLine}"`);
        console.log(`🔍 LENGTH: ${trimmedLine.length}`);
      }
      
      // Skip empty lines and table definitions (but NOT relationship lines)
      if (!trimmedLine || 
          trimmedLine.endsWith('{') || trimmedLine === '}' ||
          trimmedLine.startsWith('erDiagram') || trimmedLine.startsWith('classDiagram') ||
          trimmedLine.startsWith('%%') || trimmedLine.startsWith('classDef')) {
        if (trimmedLine.includes('PaymentTransaction')) {
          console.log(`🚫 SKIPPED PaymentTransaction line: "${trimmedLine}" (reason: empty/table definition/comment)`);
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
        
        // Debug: Show which patterns are being tested against PaymentTransaction lines
        if (trimmedLine.includes('PaymentTransaction') || trimmedLine.includes('BankStatementAllocation')) {
          if (match) {
            console.log(`✅ REGEX MATCH: "${trimmedLine}" -> ${match[1]} <-> ${match[2]} (pattern: ${pattern.source})`);
          } else {
            console.log(`❌ REGEX FAIL: "${trimmedLine}" vs pattern: ${pattern.source}`);
          }
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
            
            console.log(`✅ Found relationship: ${sourceTable} <-> ${targetTable} (pattern: ${pattern.source})`);
            matched = true;
            break;
          }
        }
      }
      
      if (!matched && (trimmedLine.includes('|') || trimmedLine.includes('-'))) {
        console.log(`⚠️ Unmatched potential relationship line: "${trimmedLine}"`);
      }
    }
    
    console.log(`🔗 Total relationships parsed: ${relationships.size} entities with connections`);
    
    // Debug: Show parsed relationships
    if (relationships.size > 0) {
      for (const [table, connected] of relationships.entries()) {
        console.log(`  🔗 ${table} connects to: [${connected.join(', ')}]`);
      }
    } else {
      console.log(`⚠️ No relationships parsed - check regex patterns!`);
    }
    
    return relationships;
  }, []);

  // Bind ERD-specific event handlers after SVG is rendered (Mermaid best practice)
  const bindERDEventHandlers = useCallback(() => {
    console.log('🔗 bindERDEventHandlers called!');
    
    const svgContainer = svgContainerRef.current;
    if (!svgContainer) {
      console.log('❌ svgContainer not found');
      return;
    }

    const svgRoot = svgContainer.querySelector('svg');
    if (!svgRoot) {
      console.log('❌ svgRoot not found');
      return;
    }

    console.log('🔗 Binding ERD relationship highlighting event handlers...');
    console.log('📊 SVG Root element found:', svgRoot.tagName);

    // Debug: Inspect the actual SVG structure to understand what Mermaid generates
    console.log('🔍 DEBUGGING SVG STRUCTURE:');
    
    // Check for various possible ERD-related selectors
    const possibleSelectors = [
      '.er.entityBox',
      '.er-entityBox', 
      '.entityBox',
      '.entity-box',
      '.entity',
      'g[id*="entity"]',
      'g[class*="entity"]',
      'g[class*="er"]',
      '.er',
      'rect',
      'g'
    ];
    
    possibleSelectors.forEach(selector => {
      const elements = svgRoot.querySelectorAll(selector);
      console.log(`  - ${selector}: ${elements.length} elements`);
      if (elements.length > 0 && elements.length < 10) {
        elements.forEach((el, i) => {
          console.log(`    [${i}] ${el.tagName} id="${el.getAttribute('id')}" class="${el.getAttribute('class')}"`);
        });
      }
    });

    // Check for relationship-related elements
    console.log('🔍 CHECKING RELATIONSHIP ELEMENTS:');
    const relationshipSelectors = [
      '.er.relationshipLine',
      '.relationshipLine',
      '.relationship-line',
      'path',
      'line'
    ];
    
    relationshipSelectors.forEach(selector => {
      const elements = svgRoot.querySelectorAll(selector);
      console.log(`  - ${selector}: ${elements.length} elements`);
    });

    // Remove existing event listeners to prevent duplicates
    const existingHandlers = svgRoot.querySelectorAll('[data-erd-handler]');
    console.log(`🧹 Removing ${existingHandlers.length} existing ERD handlers`);
    existingHandlers.forEach(box => {
      box.removeAttribute('data-erd-handler');
    });

    // Try to find entity boxes using the expected selector first
    let entityBoxes = svgRoot.querySelectorAll('.er.entityBox');
    console.log(`🏢 Found ${entityBoxes.length} .er.entityBox elements`);
    
    // If no .er.entityBox found, try alternative selectors
    if (entityBoxes.length === 0) {
      console.log('⚠️ No .er.entityBox found, trying alternative selectors...');
      
      // Try g elements with entity in ID
      entityBoxes = svgRoot.querySelectorAll('g[id*="entity"]');
      console.log(`🏢 Found ${entityBoxes.length} g[id*="entity"] elements`);
      
      if (entityBoxes.length === 0) {
        // Try any g elements with classes
        entityBoxes = svgRoot.querySelectorAll('g[class]');
        console.log(`🏢 Found ${entityBoxes.length} g[class] elements (fallback)`);
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
          console.log(`🎯 ERD entity clicked: ${entityId}`);
          highlightERDRelationships(entityId, svgRoot);
        }
      });
    });
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
    
    console.warn('⚠️ Could not determine entity ID from box:', box);
    return null;
  }, []);

  // Simple relationship line highlighting using CSS classes
  const highlightRelationshipLines = useCallback((tableName: string, svgRoot: Element) => {
    console.log(`🔗 Highlighting relationship lines for table: ${tableName}`);
    
    // Parse relationships to find connected tables
    const relationships = parseRelationships(mermaidCode);
    const connectedTables = relationships.get(tableName) || [];
    
    console.log(`🔗 Found ${connectedTables.length} connected tables: [${connectedTables.join(', ')}]`);
    
    if (connectedTables.length === 0) {
      console.log(`⚠️ No relationships found for ${tableName}`);
      return;
    }
    
    // Find the entity using real Mermaid selectors - entities have IDs like "entity-PaymentStatus-7"
    let clickedEntityBox: Element | null = null;
    
    // Try to find by entity ID pattern
    const entityById = svgRoot.querySelector(`g[id*="entity-${entityId}"]`);
    if (entityById) {
      entityById.classList.add('is-highlighted');
      clickedEntityBox = entityById;
      console.log(`✅ Found entity by ID pattern: ${entityById.getAttribute('id')}`);
    } else {
      // Fallback: try data-table-name attribute
      const entityByDataAttr = svgRoot.querySelector(`g[data-table-name="${entityId}"]`);
      if (entityByDataAttr) {
        entityByDataAttr.classList.add('is-highlighted');
        clickedEntityBox = entityByDataAttr;
        console.log(`✅ Found entity by data-table-name: ${entityId}`);
      }
    }
    
    if (!clickedEntityBox) {
      console.warn(`⚠️ Could not find entity box for: ${entityId}`);
      console.log(`🔍 Available entities:`, Array.from(svgRoot.querySelectorAll('g[id*="entity"]')).map(g => g.getAttribute('id')));
      return;
    }
    
    // Parse relationships from the original Mermaid ERD code (not rendered SVG)
    if (mermaidCode) {
      const relationshipMap = parseRelationships(mermaidCode);
      const connectedTables = relationshipMap.get(entityId) || [];
      
      console.log(`🔗 Found ${connectedTables.length} connected tables:`, connectedTables);
      
      // Debug: Show all relationships found in the diagram
      console.log(`🔍 DEBUG: All relationships in diagram:`, Array.from(relationshipMap.entries()));
      
      // Debug: Check if entity appears in any relationships with different case/format
      const entityVariations = [entityId, entityId.toLowerCase(), entityId.toUpperCase()];
      entityVariations.forEach(variation => {
        const found = relationshipMap.get(variation);
        if (found && found.length > 0) {
          console.log(`🔍 Found relationships for variation "${variation}":`, found);
        }
      });
      
      // Debug: Show a sample of the ERD code to understand the format
      const erdLines = mermaidCode.split('\n').filter(line => 
        line.includes('||') || line.includes('}|') || line.includes('--')
      ).slice(0, 5);
      console.log(`🔍 Sample ERD relationship lines:`, erdLines);
      
      // Highlight connected entities
      connectedTables.forEach(connectedEntity => {
        const connectedElement = svgRoot.querySelector(`g[id*="entity-${connectedEntity}"]`) || 
                                svgRoot.querySelector(`g[data-table-name="${connectedEntity}"]`);
        if (connectedElement) {
          connectedElement.classList.add('is-highlighted');
          console.log(`✅ Highlighted connected entity: ${connectedEntity}`);
        }
      });
      
      // Only highlight relationship paths if we actually found connected tables
      let highlightedCount = 0;
      
      if (connectedTables.length > 0) {
        console.log(`🔍 Looking for relationship paths between ${entityId} and connected entities...`);
        
        // Find and highlight relationship paths
        const allPaths = svgRoot.querySelectorAll('path');
        const entityCenter = getTableCenterCoordinates(entityId);
        
        if (entityCenter) {
          // Get centers of all connected entities
          const connectedCenters = connectedTables.map(connectedEntity => {
            const center = getTableCenterCoordinates(connectedEntity);
            return { entity: connectedEntity, center };
          }).filter(item => item.center !== null);
          
          console.log(`🔍 Checking ${allPaths.length} paths for connections between entities...`);
          
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
                  console.log(`✅ Path ${index + 1} connects ${entityId} to ${connectedEntity}`);
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
        console.log(`⚠️ No connected tables found for ${entityId}, skipping path highlighting`);
      }
      
      // Always add container class to enable dimming when any table is selected
      svgRoot.classList.add('has-erd-selection');
      console.log(`✅ Applied .has-erd-selection class to SVG root for dimming effect`);
      
      // Debug: Check what elements should be dimmed
      const allEntities = svgRoot.querySelectorAll('g[id*="entity"], g[data-table-name], g.table-entity');
      const highlightedEntities = svgRoot.querySelectorAll('g.is-highlighted');
      console.log(`🔍 Dimming Debug: ${allEntities.length} total entities, ${highlightedEntities.length} highlighted, ${allEntities.length - highlightedEntities.length} should be dimmed`);
      
      // Debug: Check CSS classes and selectors
      console.log(`🔍 CSS Debug:`);
      console.log(`  - SVG root has .has-erd-selection: ${svgRoot.classList.contains('has-erd-selection')}`);
      console.log(`  - Sample entity classes: ${allEntities[0]?.className}`);
      console.log(`  - Sample highlighted entity classes: ${highlightedEntities[0]?.className}`);
      
      // Test CSS selector matching
      const shouldBeDimmed = svgRoot.querySelectorAll('.has-erd-selection g[id*="entity"]:not(.is-highlighted)');
      const shouldBeDimmed2 = svgRoot.querySelectorAll('.has-erd-selection g[data-table-name]:not(.is-highlighted)');
      const shouldBeDimmed3 = svgRoot.querySelectorAll('.has-erd-selection g.table-entity:not(.is-highlighted)');
      console.log(`  - Entities matching dimming selectors: ${shouldBeDimmed.length}, ${shouldBeDimmed2.length}, ${shouldBeDimmed3.length}`);
      
      console.log(`✨ Highlighted ${highlightedCount} relationship paths and ${connectedTables.length} connected entities for "${entityId}"`);
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
    console.log(`🧹 Cleared ERD relationship highlighting`);
  }, []);

  // Enhanced table centering function with improved handling for complex tables
  const centerOnTable = useCallback((tableName: string, retryCount: number = 0) => {
    console.log(`🎯 centerOnTable called for: ${tableName} (attempt ${retryCount + 1})`);
    
    // Enhanced error checking and validation
    if (!tableName || typeof tableName !== 'string') {
      console.error(`❌ Invalid table name provided:`, tableName);
      return;
    }
    
    if (!svgContainerRef.current) {
      console.warn(`❌ Cannot center on table ${tableName}: Container not available`);
      if (retryCount < 2) {
        console.log(`⏳ Retrying centerOnTable in 100ms...`);
        setTimeout(() => centerOnTable(tableName, retryCount + 1), 100);
      }
      return;
    }
    
    // Special debugging for problematic tables
    if (tableName.toLowerCase().includes('opportunity')) {
      console.log(`🔍 Special handling for Opportunity table (high relationship count)`);
    }
    
    const svgContainer = svgContainerRef.current;
    
    // Always search for live SVG element
    const svg = svgContainer.querySelector('svg') as SVGSVGElement;
    if (!svg) {
      console.warn(`❌ Cannot center on table ${tableName}: SVG element not found in DOM`);
      
      // Retry logic for race conditions
      if (retryCount < 2) {
        console.log(`🔄 Retrying centerOnTable in 50ms... (attempt ${retryCount + 2})`);
        setTimeout(() => centerOnTable(tableName, retryCount + 1), 50);
      }
      return;
    }
    
    console.log(`✅ Found live SVG element for table centering`);

    // Try multiple strategies to find the table entity
    let tableEntity: Element | null = null;
    
    console.log(`🔍 Searching for table entity: "${tableName}"`);
    
    // Strategy 1: Use data-table-name attribute (set during styling)
    console.log(`  Strategy 1: Looking for g[data-table-name="${tableName}"]`);
    tableEntity = svg.querySelector(`g[class*="node"][data-table-name="${tableName}"]`) || 
                  svg.querySelector(`g[data-table-name="${tableName}"]`);
    
    if (tableEntity) {
      console.log(`  ✅ Strategy 1 found entity:`, tableEntity);
    } else {
      console.log(`  ❌ Strategy 1 failed`);
      
      // Debug: Show all elements with data-table-name
      const allDataElements = Array.from(svg.querySelectorAll('g[data-table-name]'));
      console.log(`  - Found ${allDataElements.length} elements with data-table-name:`);
      allDataElements.slice(0, 5).forEach((el, i) => {
        console.log(`    ${i + 1}. data-table-name="${el.getAttribute('data-table-name')}"`);
      });
    }
    
    // Strategy 2: Use Mermaid-generated ID (more reliable)
    if (!tableEntity) {
      console.log(`  Strategy 2: Looking for g[id*="entity-${tableName}-"]`);
      tableEntity = svg.querySelector(`g[id*="entity-${tableName}-"]`);
      
      if (tableEntity) {
        console.log(`  ✅ Strategy 2 found entity:`, tableEntity);
      } else {
        console.log(`  ❌ Strategy 2 failed`);
        
        // Debug: Show all elements with entity IDs
        const allEntityIds = Array.from(svg.querySelectorAll('g[id*="entity-"]'));
        console.log(`  - Found ${allEntityIds.length} elements with entity IDs:`);
        allEntityIds.slice(0, 5).forEach((el, i) => {
          console.log(`    ${i + 1}. id="${el.getAttribute('id')}"`);
        });
      }
    }
    
    // Strategy 3: Search by text content in nodeLabel spans
    if (!tableEntity) {
      console.log(`  Strategy 3: Looking for nodeLabel with text "${tableName}"`);
      const nodeLabels = Array.from(svg.querySelectorAll('span.nodeLabel'));
      console.log(`  - Found ${nodeLabels.length} nodeLabel spans`);
      
      // Show first few nodeLabel contents for debugging
      nodeLabels.slice(0, 5).forEach((label, i) => {
        console.log(`    ${i + 1}. nodeLabel text: "${label.textContent?.trim()}"`);
      });
      
      for (const label of nodeLabels) {
        if (label.textContent?.trim() === tableName) {
          tableEntity = label.closest('g[class*="node"]');
          if (tableEntity) {
            console.log(`  ✅ Strategy 3 found entity via nodeLabel:`, tableEntity);
            break;
          }
        }
      }
      
      if (!tableEntity) {
        console.log(`  ❌ Strategy 3 failed`);
      }
    }

    if (tableEntity) {
      try {
        console.log(`🎯 Centering on table: ${tableName}`);
        console.log(`  - Found table entity:`, tableEntity.tagName, tableEntity.getAttribute('class'));
        console.log(`  - Entity ID:`, tableEntity.getAttribute('id'));
        console.log(`  - Entity data-table-name:`, tableEntity.getAttribute('data-table-name'));
        
        // Industry-standard coordinate detection: getBBox() first, then transforms
        let elementCenterX = 0;
        let elementCenterY = 0;
        let coordinatesFound = false;
        
        // Strategy 1: getBBox() - Most reliable for SVG elements (industry standard)
        console.log(`  🔄 Strategy 1: getBBox() coordinate detection (industry standard)...`);
        try {
          // Ensure element is properly attached before calling getBBox
          if (tableEntity.ownerDocument && typeof tableEntity.getBoundingClientRect === 'function') {
            const bbox = (tableEntity as SVGGraphicsElement).getBBox();
            console.log(`  - getBBox() result:`, bbox);
            
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
              
              console.log(`  ✅ getBBox() with transform coordinates:`);
              console.log(`    - Local bbox center: (${bbox.x + bbox.width / 2}, ${bbox.y + bbox.height / 2})`);
              console.log(`    - Transform: translate(${transformX}, ${transformY})`);
              console.log(`    - Final SVG center: (${elementCenterX}, ${elementCenterY})`);
            } else {
              console.log(`  ❌ getBBox() returned invalid dimensions:`, bbox);
            }
          }
        } catch (bboxError) {
          console.log(`  ❌ getBBox() failed:`, bboxError);
        }
        
        // Strategy 2: Transform attributes - Reliable fallback for positioned elements  
        if (!coordinatesFound) {
          console.log(`  🔄 Strategy 2: Transform coordinate detection...`);
          const transform = tableEntity.getAttribute('transform');
          if (transform) {
            console.log(`  - Transform attribute:`, transform);
            
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
                console.log(`  ✅ Transform coordinates found: (${elementCenterX}, ${elementCenterY})`);
              } else {
                console.log(`  ❌ Transform coordinates invalid/out-of-bounds: (${transformX}, ${transformY})`);
              }
            } else {
              console.log(`  ❌ Could not parse transform:`, transform);
            }
          } else {
            console.log(`  ❌ No transform attribute found`);
          }
        }
        
        // For debugging: if neither method worked, log element structure
        if (!coordinatesFound && tableName.toLowerCase().includes('opportunity')) {
          console.log(`  🔍 Opportunity table coordinate detection failed - element structure:`, {
            tagName: tableEntity.tagName,
            className: tableEntity.getAttribute('class'),
            id: tableEntity.getAttribute('id'),
            hasTransform: !!tableEntity.getAttribute('transform'),
            childElementCount: tableEntity.children.length
          });
        }
        
        // Strategy 3: Simple fallback using foreignObject coordinates
        if (!coordinatesFound) {
          console.log(`  🔄 Strategy 3: Simple foreignObject coordinate fallback...`);
          
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
              console.log(`  ✅ ForeignObject coordinates found: (${elementCenterX}, ${elementCenterY})`);
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
            console.log(`  📍 Final element center: (${elementCenterX}, ${elementCenterY})`);
            
            // For problematic tables like Opportunity, use more conservative zoom
            const isComplexTable = tableName.toLowerCase().includes('opportunity');
            const targetZoom = isComplexTable ? 2.5 : 3.0; // Slightly less aggressive zoom for complex tables
            
            zoomToScale(targetZoom, elementCenterX, elementCenterY);
            console.log(`✅ Centered table ${tableName} at zoom ${targetZoom}x${isComplexTable ? ' (complex table)' : ''}`);
            
            // Update lastClickPosition to ensure zoom controls center on this table
            setLastClickPosition({ x: elementCenterX, y: elementCenterY });
            console.log(`🎯 Updated lastClickPosition for zoom controls: (${elementCenterX}, ${elementCenterY})`);
          } else {
            console.log(`  ❌ Final coordinates are out of bounds: (${elementCenterX}, ${elementCenterY})`);
            console.log(`  🔄 Falling back to basic zoom without centering`);
            zoomToScale(2.0); // More conservative fallback zoom
          }
        } else {
          console.log(`  ❌ Could not determine coordinates for table ${tableName}`);
          console.log(`  🔄 Falling back to basic zoom without centering`);
          // For tables that fail centering, try a gentle zoom to at least improve visibility
          zoomToScale(2.0); // More conservative fallback zoom
        }
        
      } catch (error) {
        console.error(`❌ Exception in centerOnTable for "${tableName}":`, error);
        console.log(`🔄 Applying fallback zoom due to error`);
        zoomToScale(2.5); // Slightly less aggressive fallback
      }
    } else {
      console.warn(`⚠️ Table element not found for: "${tableName}"`);
      console.log(`🔍 Available tables in current domain:`, Array.from(svgContainer.querySelectorAll('g[data-table-name]')).map(el => el.getAttribute('data-table-name')).slice(0, 10));
      
      if (retryCount < 2) {
        console.log(`⏳ Retrying to find table element in 200ms...`);
        setTimeout(() => centerOnTable(tableName, retryCount + 1), 200);
      } else {
        console.log(`🔄 Applying fallback zoom after failed table search`);
        zoomToScale(2.5);
      }
    }
  }, [zoomToScale]);

  // Define handleTableClick before it's used in event delegation
  const handleTableClick = useCallback((tableName: string, event?: MouseEvent, isFromSearch: boolean = false) => {
    console.log(`🎯 Selected table: ${tableName} ${isFromSearch ? '(from search)' : '(direct click)'}`);
    
    // Domain detection: Check if table exists in current domain (skip for search calls)
    const svgContainer = svgContainerRef.current;
    if (svgContainer && !isFromSearch) {
      const tableElement = svgContainer.querySelector(`g[data-table-name="${tableName}"]`);
      
      if (!tableElement) {
        console.log(`🔍 Table "${tableName}" not found in current domain "${domain || 'unknown'}"`);
        
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
                  console.log(`📊 Table "${tableName}" found in domain "${domainName}"`);
                  break;
                }
              }
              
              if (targetDomain) break;
            }
          }
          
          // Fallback to overview if not found in specific domains
          if (!targetDomain && domainResults.overview) {
            targetDomain = 'overview';
            console.log(`📊 Table "${tableName}" not found in specific domains, falling back to overview`);
          }
        }
        
        if (targetDomain && targetDomain !== domain) {
          console.log(`🎯 Table "${tableName}" is in domain "${targetDomain}" (current: "${domain}")`);
          if (onExternalTableClick) {
            onExternalTableClick(tableName, targetDomain);
          } else {
            console.warn(`⚠️ No onExternalTableClick handler provided`);
          }
          return; // Don't proceed with centering since table is in different domain
        } else {
          console.warn(`⚠️ Could not determine domain for table "${tableName}" - proceeding in current domain`);
        }
      }
      
      // DEBUG: Check SVG dimensions BEFORE any state changes
      const svg = svgContainer.querySelector('svg');
      if (svg) {
        const beforeRect = svg.getBoundingClientRect();
        console.log(`📏 SVG dimensions BEFORE state changes: ${beforeRect.width} x ${beforeRect.height}`);
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
    
    console.log(`⚛️ About to update React state: selectedTable, highlightedTables, viewMode`);
    
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
    console.log(`🎯 Setting viewMode to 'focus' (re-enabled after fixing SVG collapse)`);
    setViewMode('focus');
    
    // Add selection handles after a short delay to ensure styling is applied
    setTimeout(() => {
      addSelectionHandles(tableName);
    }, 100);
    
    console.log(`⏰ State updates scheduled, checking dimensions after React updates...`);
    
    // Check dimensions after state updates
    setTimeout(() => {
      if (svgContainer) {
        const svg = svgContainer.querySelector('svg');
        if (svg) {
          const afterRect = svg.getBoundingClientRect();
          console.log(`📏 SVG dimensions AFTER state changes: ${afterRect.width} x ${afterRect.height}`);
          
          if (afterRect.width === 0 || afterRect.height === 0) {
            console.log(`🚨 SVG became zero dimensions after state changes!`);
            
            // Check CSS that might be causing this
            const computedStyles = window.getComputedStyle(svg);
            console.log(`🎨 SVG styles after state change:`);
            console.log(`  - display: "${computedStyles.display}"`);
            console.log(`  - visibility: "${computedStyles.visibility}"`);
            console.log(`  - width: "${computedStyles.width}"`);
            console.log(`  - height: "${computedStyles.height}"`);
            console.log(`  - position: "${computedStyles.position}"`);
            console.log(`  - opacity: "${computedStyles.opacity}"`);
            
            // Check container styles too
            const containerStyles = window.getComputedStyle(svgContainer);
            console.log(`📦 Container styles after state change:`);
            console.log(`  - display: "${containerStyles.display}"`);
            console.log(`  - width: "${containerStyles.width}"`);
            console.log(`  - height: "${containerStyles.height}"`);
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
              console.warn('Could not get SVG screen CTM');
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
            console.warn('Could not convert click coordinates to SVG space:', error);
          }
        }
        
        // Try multiple strategies to find the table entity
        let entityParent: Element | null = null;
        let tableName: string | null = null;
        
        // Strategy 1: Try the closest g[class*="node"] approach
        entityParent = target.closest('g[class*="node"]');
        if (entityParent) {
          tableName = entityParent.getAttribute('data-table-name');
          console.log(`  🎯 Strategy 1 - Found entity with table: "${tableName}"`);
        }
        
        // Strategy 2: Try direct data-table-name search  
        if (!tableName) {
          entityParent = target.closest('g[data-table-name]');
          if (entityParent) {
            tableName = entityParent.getAttribute('data-table-name');
            console.log(`  🎯 Strategy 2 - Found entity with table: "${tableName}"`);
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
              console.log(`  🎯 Strategy 3 - Found table at depth ${depth}: "${tableName}"`);
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
            console.log(`👻 GHOST TABLE CLICK: "${tableName}" -> navigating to domain "${targetDomain}"`);
            // Directly navigate to target domain (we already know it from metadata)
            if (onExternalTableClick) {
              onExternalTableClick(tableName, targetDomain);
              console.log(`🚀 Navigated to domain "${targetDomain}" for ghost table "${tableName}"`);
            } else {
              console.warn('onExternalTableClick handler not available for ghost table navigation');
            }
            return; // Prevent further processing
          } else {
            console.log(`🎯 DELEGATED TABLE CLICK: ${tableName}`);
            console.log(`  Event details:`, {
              type: event.type,
              target: target.tagName,
              entityElement: entityParent.tagName,
              detectionStrategy: entityParent.closest('g[class*="node"]') ? 'closest(g[class*="node"])' : 'manual traversal'
            });
            
            // Call the table click handler directly
            handleTableClick(tableName);
          }
        } else {
          console.log(`  ❌ No table found for this click - debugging info:`);
          console.log(`    Target data-table-name:`, target.getAttribute('data-table-name'));
          console.log(`    Target class:`, (target as any).className?.baseVal || target.className);
          console.log(`    Target ID:`, target.id);
          
          // Show parent chain for debugging
          let el = target;
          for (let i = 0; i < 5 && el; i++) {
            const elementClass = (el as any).className?.baseVal || el.className || '';
            console.log(`    Parent ${i}: ${el.tagName} (class: "${elementClass}", data-table-name: "${el.getAttribute('data-table-name')}")`);
            el = el.parentElement as Element;
          }
        }
      }
    };
    
    document.addEventListener('click', delegatedClickHandler, true);
    return () => document.removeEventListener('click', delegatedClickHandler, true);
  }, [handleTableClick]); // Add handleTableClick to dependencies

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
        
        // Debug Mermaid input before rendering
        console.log('🐛 [DEBUG] Mermaid Input Analysis:');
        console.log('  📝 Mermaid code length:', mermaidCode.length);
        console.log('  👻 Looking for ghost table indicators...');
        
        const hasGhostTables = mermaidCode.includes('GHOST-META:');
        const hasGhostClass = mermaidCode.includes('classDef ghostTable') || mermaidCode.includes('class ') && mermaidCode.includes('ghostTable');
        
        console.log('  👻 Ghost table content found:', hasGhostTables);
        console.log('  🎨 Ghost class definition found:', hasGhostClass);
        
        if (hasGhostTables) {
          // Extract ghost table metadata for debugging (new format)
          const ghostMetaMatches = mermaidCode.match(/%% GHOST-META: (\w+) -> (domain_\d+)/g);
          if (ghostMetaMatches) {
            console.log('  👻 Ghost table metadata found:', ghostMetaMatches);
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
            // Debug Mermaid DOM structure after render
            console.log('🐛 [DEBUG] Mermaid SVG Structure Analysis:');
            
            // Analyze all elements and their attributes
            const allElements = Array.from(svgElement.querySelectorAll('*'));
            console.log('  📊 Total SVG elements:', allElements.length);
            
            // Look for entity-related elements specifically
            const entityElements = allElements.filter(el => {
              const id = el.getAttribute('id') || '';
              const className = el.getAttribute('class') || '';
              return id.includes('entity') || className.includes('entity') || 
                     id.includes('Entity') || className.includes('Entity');
            });
            
            console.log('  🏢 Entity-related elements found:', entityElements.length);
            entityElements.forEach((el, i) => {
              if (i < 5) { // Log first 5 for debugging
                console.log(`    ${i + 1}. ${el.tagName}#${el.getAttribute('id')} .${el.getAttribute('class')}`);
              }
            });
            
            // Look for text elements that might contain ghost table content
            const textElements = Array.from(svgElement.querySelectorAll('text, tspan'));
            const ghostTextElements = textElements.filter(el => {
              const content = el.textContent || '';
              return content.includes('Ghost-Table') || content.includes('Click-to-navigate-to');
            });
            
            console.log('  👻 Ghost table text elements found:', ghostTextElements.length);
            ghostTextElements.forEach((el, i) => {
              console.log(`    👻 ${i + 1}. "${el.textContent}" (parent: ${el.parentElement?.tagName}#${el.parentElement?.getAttribute('id')})`);
            });
            
            // Analyze g elements (groups) which typically contain table structures
            const groupElements = Array.from(svgElement.querySelectorAll('g'));
            console.log('  📦 Group elements found:', groupElements.length);
            
            const elementsWithIds = groupElements.filter(el => el.getAttribute('id'));
            console.log('  🆔 Groups with IDs:', elementsWithIds.length);
            elementsWithIds.forEach((el, i) => {
              if (i < 10) { // Log first 10 for debugging
                const id = el.getAttribute('id');
                const hasGhostContent = Array.from(el.querySelectorAll('text, tspan'))
                  .some(textEl => (textEl.textContent || '').includes('Ghost-Table'));
                console.log(`    ${i + 1}. g#${id} ${hasGhostContent ? '👻 (has ghost content)' : ''}`);
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
        console.error('Mermaid rendering failed:', error);
        
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
      console.log('⚠️ Mouse handlers: SVG not found, skipping event handler setup');
      return;
    }
    
    // Industry-standard cursor-based zoom handler (Google Maps/Figma pattern)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      // Get mouse position relative to container
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      
      console.log(`🖱️ Wheel zoom at client position: (${clientX.toFixed(2)}, ${clientY.toFixed(2)})`);
      
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
      
      console.log(`🔍 Zoom sensitivity: deltaY=${deltaY}, trackpad=${isPotentialTrackpad}, sensitivity=${effectiveZoomSensitivity.toFixed(4)}, factor=${zoomFactor.toFixed(3)}`);
      
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
      
      // Don't start panning if clicking on a table (let table click handler deal with it)
      const target = e.target as Element;
      const isTable = target.closest('g[data-table-name]');
      if (isTable) return;
      
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
      
      console.log(`🎯 Pan sensitivity: raw(${deltaX.toFixed(1)}, ${deltaY.toFixed(1)}) -> adjusted(${adjustedDeltaX.toFixed(1)}, ${adjustedDeltaY.toFixed(1)}) [zoom: ${currentZoom.toFixed(2)}x, sensitivity: ${effectiveSensitivity.toFixed(2)}x]`);
      
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
    console.log('🔄 wrapSVGWithTransformGroup called');
    console.log('  - Input content length:', svgContent?.length || 0);
    
    if (!svgContent) {
      console.log('  - No content provided, returning empty');
      return svgContent;
    }
    
    console.log('  - Parsing SVG content...');
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    
    if (!svg) {
      console.error('  - ❌ No SVG element found in parsed content');
      return svgContent;
    }
    
    console.log('  - ✅ SVG element found');
    console.log('  - Original SVG children count:', svg.children.length);
    
    // Check if transform group already exists
    const existingGroup = svg.querySelector('#pan-zoom-group');
    if (existingGroup) {
      console.log('  - ⚠️ Transform group already exists, skipping wrap');
      return svgContent;
    }
    
    // Create transform group wrapper
    console.log('  - Creating transform group...');
    const transformGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    transformGroup.setAttribute('id', 'pan-zoom-group');
    transformGroup.setAttribute('transform', 'translate(0, 0) scale(1)');
    
    // Move all SVG children into the transform group
    console.log('  - Moving children into transform group...');
    const children = Array.from(svg.children);
    console.log(`  - Moving ${children.length} children`);
    
    children.forEach((child, i) => {
      console.log(`    ${i + 1}. Moving ${child.tagName} (id: "${child.id}")`);
      transformGroup.appendChild(child);
    });
    
    // Add the transform group as the only child of SVG
    svg.appendChild(transformGroup);
    
    console.log('  - Transform group added to SVG');
    console.log('  - Final SVG children count:', svg.children.length);
    console.log('  - Transform group children count:', transformGroup.children.length);
    
    // Ensure proper SVG attributes
    if (svg.getAttribute('height') === 'null' || !svg.getAttribute('height')) {
      console.log('  - Fixing SVG height attribute');
      svg.setAttribute('height', '100%');
    }
    if (!svg.getAttribute('width')) {
      console.log('  - Fixing SVG width attribute');
      svg.setAttribute('width', '100%');
    }
    
    const result = new XMLSerializer().serializeToString(doc);
    console.log('  - ✅ SVG wrapping complete, result length:', result.length);
    
    // Verify the result contains the transform group
    if (result.includes('id="pan-zoom-group"')) {
      console.log('  - ✅ Verified: Result contains pan-zoom-group');
    } else {
      console.error('  - ❌ ERROR: Result does NOT contain pan-zoom-group');
    }
    
    return result;
  }, []);

  // Enhanced SVG initialization after content is set with comprehensive debugging
  const initializeTransformSystem = useCallback(() => {
    if (!svgContainerRef.current) {
      console.warn('❌ initializeTransformSystem: No container ref');
      return;
    }
    
    const container = svgContainerRef.current;
    console.log('🔧 Initializing transform-based pan-zoom system');
    console.log('📦 Container element:', container);
    
    // Check for SVG element
    const svg = container.querySelector('svg') as SVGSVGElement;
    console.log('📊 Found SVG element:', svg);
    
    if (!svg) {
      console.error('❌ No SVG element found in container');
      return;
    }
    
    // Debug SVG structure
    console.log('📋 SVG children count:', svg.children.length);
    console.log('📋 SVG innerHTML preview:', svg.innerHTML.substring(0, 200) + '...');
    
    // Look for transform group
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    console.log('🎯 Transform group search result:', transformGroup);
    
    if (!transformGroup) {
      console.error('❌ Transform group #pan-zoom-group NOT FOUND');
      console.log('🔍 Available elements with IDs:');
      const elementsWithIds = container.querySelectorAll('[id]');
      elementsWithIds.forEach((el, i) => {
        console.log(`  ${i + 1}. ${el.tagName}#${el.id}`);
      });
      
      console.log('🔍 All immediate SVG children:');
      Array.from(svg.children).forEach((child, i) => {
        const childClass = (child as any).className?.baseVal || child.className || '';
        console.log(`  ${i + 1}. ${child.tagName} (id: "${child.id}", class: "${childClass}")`);
      });
      return;
    }
    
    // Success - set refs and initialize
    svgRef.current = svg;
    transformGroupRef.current = transformGroup;
    
    console.log('✅ Transform system initialized successfully');
    console.log('  - SVG ref set:', !!svgRef.current);
    console.log('  - Transform group ref set:', !!transformGroupRef.current);
    console.log('  - Transform group children count:', transformGroup.children.length);
    
    // Apply initial dimension fixes
    svg.style.height = '100%';
    svg.style.width = '100%';
    svg.style.minHeight = '400px';
    svg.style.display = 'block';
  }, []);

  // Monitor SVG content and initialize transform system
  useEffect(() => {
    console.log('📊 SVG Content Change Monitor TRIGGERED');
    console.log(`  - svgContent length: ${svgContent ? svgContent.length : 0} characters`);
    console.log(`  - svgContainerRef exists: ${!!svgContainerRef.current}`);
    
    // Clear potentially stale refs when SVG content changes
    console.log('🧹 Clearing potentially stale element refs');
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
          console.log('🔄 Retrying transform system initialization...');
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
          console.log('📱 Window resized - transform system is responsive automatically');
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
    
    console.log('🔄 Resetting pan-zoom to default state');
    
    // Always search for live element
    const container = svgContainerRef.current;
    const transformGroup = container.querySelector('#pan-zoom-group') as SVGGElement;
    
    if (!transformGroup || !document.contains(transformGroup)) {
      console.warn('❌ handleReset: Transform group not found or disconnected');
      return;
    }
    
    // Reset to identity transform using both CSS and SVG attribute
    (transformGroup as any).style.transform = 'translate(0px, 0px) scale(1)';
    transformGroup.setAttribute('transform', 'translate(0, 0) scale(1)');
    
    // Update state
    setCurrentZoom(1.0);
    setCurrentPan({ x: 0, y: 0 });
    
    console.log('✅ Reset complete: zoom=1, pan=(0,0)');
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
          console.log(`📊 Using transform group bbox: ${svgBBox.width}x${svgBBox.height}`);
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
              console.log(`📊 Calculated bbox from ${tableElements.length} table elements: ${svgBBox.width}x${svgBBox.height}`);
            } else {
              // Final fallback to entire SVG
              svgBBox = svgRef.current.getBBox();
              console.log(`📊 Using fallback SVG bbox: ${svgBBox.width}x${svgBBox.height}`);
            }
          } else {
            // No table elements found, use entire SVG
            svgBBox = svgRef.current.getBBox();
            console.log(`📊 No table elements found, using entire SVG bbox: ${svgBBox.width}x${svgBBox.height}`);
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
          
          console.log(`📏 OptimalFit: bbox=(${svgBBox.x}, ${svgBBox.y}, ${svgBBox.width}x${svgBBox.height}), container=(${containerRect.width}x${containerRect.height}), actualTables=${actualTableCount}, minZoom=${(intelligentMinimum * 100).toFixed(0)}%, finalScale=${fitScale.toFixed(3)}, padding=${(padding * 100).toFixed(0)}%`);
        } else {
          console.warn('Invalid SVG bbox dimensions, using fallback');
          zoomToScale(0.8); // Better fallback zoom
        }
      } catch (error) {
        console.warn('SVG getBBox failed, using enhanced fallback strategy:', error);
        
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
            console.log(`📏 Fallback fit using viewBox: scale=${fallbackScale.toFixed(3)}`);
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
        console.log('📊 Switched to Overview mode');
        break;
        
      case 'detail':
        // Zoom to 150% for better detail viewing
        zoomToScale(1.5);
        console.log('🔍 Switched to Detail mode (150% zoom)');
        break;
        
      case 'focus':
        // Focus mode: zoom to 200% - centering on specific table handled separately
        console.log('🎯 Switched to Focus mode - centering will be handled by selected table');
        break;
    }
  }, [handleFit, zoomToScale]);

  // handleTableClick moved earlier in component to fix initialization order

  // Clear selection only (used for background clicks)
  const handleClearSelectionOnly = useCallback(() => {
    const previousSelection = selectedTable;
    console.log(`🔍 [DEBUG] handleClearSelectionOnly called for: "${previousSelection}"`);
    
    // Remove selection handles
    removeSelectionHandles();
    
    // Clear all visual selection states with comprehensive cleanup
    const svgContainer = svgContainerRef.current;
    if (svgContainer) {
      console.log(`🔍 [DEBUG] SVG container found, proceeding with clearing`);
      
      // Remove any aria-pressed states from table elements
      const selectedElements = svgContainer.querySelectorAll('[aria-pressed="true"]');
      console.log(`🔍 [DEBUG] Found ${selectedElements.length} elements with aria-pressed="true"`);
      
      selectedElements.forEach(element => {
        element.setAttribute('aria-pressed', 'false');
      });
      
      // Remove visual selection CSS classes and stop animations - WITH DEBUGGING
      const tableSelectedElements = svgContainer.querySelectorAll('.table-selected');
      console.log(`🔍 [DEBUG] Selection clearing found ${tableSelectedElements.length} elements with .table-selected class`);
      
      tableSelectedElements.forEach((element, index) => {
        console.log(`🔍 [DEBUG] Processing element ${index + 1}:`, element);
        console.log(`🔍 [DEBUG] Element tag:`, element.tagName, 'ID:', element.id, 'Classes:', element.className);
        
        // Stop any running animations first
        element.style.animation = 'none';
        
        // Remove the class
        const hadClass = element.classList.contains('table-selected');
        element.classList.remove('table-selected');
        const stillHasClass = element.classList.contains('table-selected');
        
        console.log(`🔍 [DEBUG] Had .table-selected: ${hadClass}, Still has: ${stillHasClass}`);
        console.log(`🔍 [DEBUG] Classes after removal:`, element.className);
        
        // Log all inline styles before clearing
        console.log(`🔍 [DEBUG] Inline styles before clearing:`, element.getAttribute('style'));
        
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
        console.log(`🔍 [DEBUG] Computed filter: ${computedStyle.filter}`);
        console.log(`🔍 [DEBUG] Computed animation: ${computedStyle.animation}`);
        
        // Force override computed styles that might persist
        if (computedStyle.filter && computedStyle.filter !== 'none') {
          element.style.setProperty('filter', 'none', 'important');
        }
        
        console.log(`🔍 [DEBUG] Inline styles after clearing:`, element.getAttribute('style'));
        
        // Clear browser focus states and debug CSS pseudo-classes
        console.log(`🔍 [DEBUG] Checking CSS pseudo-classes:`);
        console.log(`  - :focus: ${element.matches(':focus')}`);
        console.log(`  - :focus-visible: ${element.matches(':focus-visible')}`);
        console.log(`  - :hover: ${element.matches(':hover')}`);
        console.log(`  - tabindex: ${element.getAttribute('tabindex')}`);
        
        // Force remove focus and blur the element
        if (element.matches(':focus')) {
          (element as HTMLElement).blur();
          console.log(`🔍 [DEBUG] Blurred focused element`);
        }
        
        // Temporarily clear tabindex to prevent focus
        const originalTabIndex = element.getAttribute('tabindex');
        if (originalTabIndex !== null) {
          element.setAttribute('tabindex', '-1');
          console.log(`🔍 [DEBUG] Set tabindex to -1 (was: ${originalTabIndex})`);
        }
        
        // Clear SVG presentation attributes (not just CSS styles)
        const svgAttributes = ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'fill', 'fill-opacity', 'filter'];
        console.log(`🔍 [DEBUG] Clearing SVG presentation attributes...`);
        
        svgAttributes.forEach(attr => {
          if (element.hasAttribute(attr)) {
            const oldValue = element.getAttribute(attr);
            element.removeAttribute(attr);
            console.log(`🔍 [DEBUG] Removed SVG attribute ${attr}: ${oldValue}`);
          }
        });
        
        // Also clear selection styles from child elements
        const childRects = element.querySelectorAll('rect, foreignObject');
        console.log(`🔍 [DEBUG] Found ${childRects.length} child rect/foreignObject elements`);
        
        childRects.forEach((child, childIndex) => {
          console.log(`🔍 [DEBUG] Clearing child ${childIndex + 1} styles:`, child.getAttribute('style'));
          
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
              console.log(`🔍 [DEBUG] Removed child SVG attribute ${attr}: ${oldValue}`);
            }
          });
          
          console.log(`🔍 [DEBUG] Child ${childIndex + 1} after clearing:`, child.getAttribute('style'));
        });
        
        console.log(`🔍 [DEBUG] Applied forced style clearing with !important`);
      });
      
      // Final comprehensive style reset using cssText
      console.log(`🔍 [DEBUG] Applying final comprehensive style reset...`);
      
      const allAffectedElements = svgContainer.querySelectorAll('.table-entity, g[data-table-name]');
      allAffectedElements.forEach((el, index) => {
        // Complete style reset
        const currentCssText = el.style.cssText;
        console.log(`🔍 [DEBUG] Element ${index + 1} cssText before reset: ${currentCssText}`);
        
        // Keep only essential styles and reset everything else
        el.style.cssText = 'cursor: pointer; pointer-events: auto;';
        
        console.log(`🔍 [DEBUG] Element ${index + 1} cssText after reset: ${el.style.cssText}`);
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
    
    console.log(`🧹 Cleared table selection "${previousSelection || 'none'}" (background click - no zoom)`);
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
    
    console.log(`🧹 Cleared table selection "${previousSelection || 'none'}" and reset to overview with proper fit`);
  }, [selectedTable, handleFit, removeSelectionHandles, clearERDRelationshipHighlighting]);

  const handleDomainFocus = useCallback(() => {
    // Focus on the current domain by fitting and centering
    handleFit();
    setViewMode('detail');
    
    console.log(`🏷️ Focusing on domain: ${domain || 'overview'}`);
  }, [domain, handleFit]);

  // Layout and display option handlers
  const handleToggleCompactView = useCallback(() => {
    setIsCompactView(prev => {
      const newValue = !prev;
      console.log(`📦 ${newValue ? 'Enabled' : 'Disabled'} compact view`);
      return newValue;
    });
  }, []);

  const handleToggleRelationshipLabels = useCallback(() => {
    setShowRelationshipLabels(prev => {
      const newValue = !prev;
      console.log(`🏷️ ${newValue ? 'Showing' : 'Hiding'} relationship labels`);
      return newValue;
    });
  }, []);

  const handleToggleAttributeDetails = useCallback(() => {
    setShowAttributeDetails(prev => {
      const newValue = !prev;
      console.log(`📝 ${newValue ? 'Showing' : 'Hiding'} attribute details`);
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
              console.log(`🔗 Found external table reference: "${targetTable}" (not in current domain)`);
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
                  console.log(`🔗 Found external table reference from FK: "${possibleTableName}" (from ${baseTableName}_id FK)`);
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
    console.log(`🔗 External table clicked: "${tableName}"`);
    
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
        console.log(`🎯 External table "${tableName}" found in domain "${domainName}"`);
        break;
      }
    }
    
    if (targetDomain) {
      console.log(`🚀 Navigating to domain "${targetDomain}" for table "${tableName}"`);
      if (onExternalTableClick) {
        onExternalTableClick(tableName, targetDomain);
      } else {
        console.warn(`⚠️ No onExternalTableClick handler provided`);
      }
    } else {
      console.warn(`⚠️ Could not find domain for external table "${tableName}"`);
    }
  }, [domainResults, domain]);

  // Direct SVG manipulation to apply domain styling - bypasses Mermaid CSS system
  // Clean table detection and click handling - NO styling applied
  const applySVGDomainStyling = useCallback((svgString: string): string => {
    console.log(`🔍 [DEBUG] applySVGDomainStyling function called for domain: ${domain || 'undefined'}`);
    console.log(`🔍 [DEBUG] SVG string length: ${svgString?.length || 0}`);
    
    if (!svgString) {
      console.log(`🔍 [DEBUG] applySVGDomainStyling: svgString is empty, returning early`);
      return svgString;
    }
    
    console.log(`🔍 [DEBUG] applySVGDomainStyling: proceeding with SVG processing for domain: ${domain || 'undefined'}...`);
    
    try {
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
      const svgElement = svgDoc.querySelector('svg');
      
      if (!svgElement) return svgString;
      
      console.log(`🔍 Setting up clean table detection (no styling applied)...`);
      
      // Debug: Count all potential entity containers first
      const allPotentialBoxes = Array.from(svgElement.querySelectorAll('g'));
      console.log(`🐛 [DEBUG] Total g elements found: ${allPotentialBoxes.length}`);
      
      const nodeClassBoxes = Array.from(svgElement.querySelectorAll('g.node, g[class="node default"], g[class="node"]'));
      console.log(`🐛 [DEBUG] G elements with 'node' class: ${nodeClassBoxes.length}`);
      
      // Find individual entity nodes for click handling only (exclude containers)
      // Target specific node classes but exclude plural "nodes" container
      const entityBoxes = nodeClassBoxes.filter(box => {
        const className = (box as any).className?.baseVal || box.className || '';
        // Exclude containers like "nodes" - only include individual "node" elements
        return !className.includes('nodes') && (className.includes('node'));
      });
      console.log(`🔍 Found ${entityBoxes.length} individual table nodes for detection...`);
      
      // Debug: Show the first few boxes to understand structure
      entityBoxes.slice(0, 3).forEach((box, i) => {
        const id = box.getAttribute('id');
        const className = (box as any).className?.baseVal || box.className || '';
        console.log(`🐛 [DEBUG] Box ${i + 1}: id="${id}", class="${className}"`);
      });
      
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
            console.log(`  ✅ Found table: "${foundTableName}" from ID pattern`);
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
            console.log(`  ✅ Found table: "${foundTableName}" from text content`);
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
      
      console.log(`✅ Clean setup complete - ${tablesFound.length} clickable tables: [${tablesFound.join(', ')}]`);
      
      
      
      // Handle ghost tables (cross-domain references) before external table references
      console.log(`👻 Starting ghost table detection for ${tablesFound.length} tables in ${domain || 'undefined'}`);
      let ghostTablesFound = 0;
      
      // Extract ghost table metadata from Mermaid source (new approach)
      const ghostTableMap = new Map<string, string>();
      
      if (mermaidCode.includes('GHOST-META:')) {
        const ghostMetaMatches = mermaidCode.match(/%% GHOST-META: (\w+) -> (domain_\d+)/g);
        if (ghostMetaMatches) {
          ghostMetaMatches.forEach((match) => {
            const [, tableName, targetDomain] = match.match(/%% GHOST-META: (\w+) -> (domain_\d+)/) || [];
            if (tableName && targetDomain) {
              ghostTableMap.set(tableName, targetDomain);
            }
          });
        }
      }
      
      console.log(`👻 Found ${ghostTableMap.size} ghost table references`);
      
      if (ghostTableMap.size === 0) {
        console.log(`👻 [DEBUG] No ghost tables found in metadata - this might be the issue!`);
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
            console.log(`🐛 [DEBUG] Found element for "${tableName}" using selector: ${selector}`);
            break;
          }
        }
        
        if (!tableElement) {
          console.log(`🐛 [DEBUG] No element found for "${tableName}" - trying alternative approach...`);
          // Try to find by text content in the actual detected boxes
          const boxesWithThisTable = entityBoxes.filter(box => {
            const textElements = Array.from(box.querySelectorAll('text, tspan, span'));
            return textElements.some(textEl => (textEl.textContent || '').trim() === tableName);
          });
          
          if (boxesWithThisTable.length > 0) {
            tableElement = boxesWithThisTable[0];
            usedSelector = 'text-content-match';
            console.log(`🐛 [DEBUG] Found element for "${tableName}" via text content match`);
          }
        }
        
        if (tableElement) {
          // Check if this is a ghost table using metadata map (new approach)
          const isGhostTable = ghostTableMap.has(tableName);
          const targetDomain = ghostTableMap.get(tableName);
          
          
          if (isGhostTable && targetDomain) {
            console.log(`👻 Setting up ghost table styling: ${tableName}`);
            
            
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
                console.log(`👻 Ghost table clicked: "${tableName}" -> ${targetDomain}`);
                
                if (onExternalTableClick) {
                  onExternalTableClick(tableName, targetDomain);
                }
              });
              
              ghostTablesFound++;
              
            } catch (error) {
              console.error(`👻 [ERROR] Failed to set up ghost table "${tableName}":`, error);
            }
          } else {
            // Log why this table wasn't processed as a ghost table
            if (!isGhostTable) {
              console.log(`🐛 [DEBUG] ❌ "${tableName}" not found in ghostTableMap`);
            }
            if (!targetDomain) {
              console.log(`🐛 [DEBUG] ❌ "${tableName}" has no target domain`);
            }
          }
        }
      });
      
      console.log(`🏁 [SUMMARY] Ghost table detection completed for domain: ${domain || 'undefined'}`);
      console.log(`🏁 [SUMMARY] Total tables checked: ${tablesFound.length}`);
      console.log(`🏁 [SUMMARY] Ghost tables found in metadata: ${ghostTableMap.size}`);
      console.log(`🏁 [SUMMARY] Ghost tables successfully configured: ${ghostTablesFound}`);
      
      if (ghostTablesFound > 0) {
        console.log(`👻 ✅ Found and styled ${ghostTablesFound} ghost tables`);
        
      } else {
        console.log(`👻 ❌ No ghost tables were found or configured`);
        if (ghostTableMap.size > 0) {
          console.log(`👻 🔍 Ghost tables were in metadata but not found in DOM - check element selectors`);
        } else {
          console.log(`👻 🔍 No ghost tables in metadata - check mermaidCode content`);
        }
      }
      
      // Now handle external table references (FK references to tables in other domains)
      const externalTables = identifyExternalTables(tablesFound);
      let externalReferencesAdded = 0;
      
      if (externalTables.size > 0) {
        console.log(`🔗 Found ${externalTables.size} external table references: [${Array.from(externalTables).join(', ')}]`);
        
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
                
                console.log(`  ✅ Added clickable external reference: "${externalTable}"`);
              }
            });
          }
        });
        
        console.log(`✅ Added ${externalReferencesAdded} clickable external table references`);
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
    console.log(`🔍 [DEBUG] SVG styling useEffect triggered:`);
    console.log(`  - originalSvgContent exists: ${!!originalSvgContent}`);
    console.log(`  - originalSvgContent length: ${originalSvgContent?.length || 0}`);
    console.log(`  - current domain: ${domain || 'undefined'}`);
    console.log(`  - isInitialStylingComplete: ${isInitialStylingComplete}`);
    console.log(`  - Will call applySVGDomainStyling: ${!!(originalSvgContent && !isInitialStylingComplete)}`);
    
    if (originalSvgContent && !isInitialStylingComplete) {
      console.log(`🔍 [DEBUG] Calling applySVGDomainStyling for domain: ${domain || 'undefined'}...`);
      const cleanSvg = applySVGDomainStyling(originalSvgContent);
      const wrappedSvg = wrapSVGWithTransformGroup(cleanSvg);
      setBaseSvgContent(wrappedSvg);
      setSvgContent(wrappedSvg);
      setIsInitialStylingComplete(true);
      console.log(`🔍 [DEBUG] applySVGDomainStyling completed for domain: ${domain || 'undefined'}`);
    } else {
      console.log(`🔍 [DEBUG] applySVGDomainStyling skipped - conditions not met`);
    }
  }, [originalSvgContent, applySVGDomainStyling, wrapSVGWithTransformGroup, isInitialStylingComplete, domain]);
  
  // Reset styling completion flag when domain changes to ensure ghost table detection runs
  useEffect(() => {
    console.log(`🌐 [DEBUG] Domain change detected: ${domain || 'undefined'}`);
    console.log(`🌐 [DEBUG] Resetting isInitialStylingComplete to force ghost table detection`);
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
    if (!svgContainer) return;

    console.log(`🎯 Simple selection useEffect - selectedTable: "${selectedTable}"`);
    
    // Always clear old highlighting first
    const oldHighlighted = svgContainer.querySelectorAll('.table-selected, .relationship-highlighted');
    oldHighlighted.forEach(el => {
      el.classList.remove('table-selected', 'relationship-highlighted');
    });
    svgContainer.classList.remove('has-selection');

    // Apply simple selection highlighting if table is selected
    if (selectedTable) {
      console.log(`✨ Applying simple highlighting to selected table: ${selectedTable}`);
      
      const svgRoot = svgContainer.querySelector('svg');
      if (svgRoot) {
        // Find and highlight the selected table
        const selectedEntity = svgRoot.querySelector(`g[data-table-name="${selectedTable}"]`) ||
                              svgRoot.querySelector(`g[id*="entity-${selectedTable}"]`);
        
        if (selectedEntity) {
          selectedEntity.classList.add('table-selected');
          console.log(`✅ Added .table-selected to ${selectedTable}`);
        }
        
        // Enable dimming by adding container class
        svgContainer.classList.add('has-selection');
        console.log(`✅ Added .has-selection for dimming effect`);
        
        // Highlight relationship lines (smart path detection)
        const relationships = parseRelationships(mermaidCode);
        const connectedTables = relationships.get(selectedTable) || [];
        
        if (connectedTables.length > 0) {
          console.log(`🔗 ${selectedTable} connects to: [${connectedTables.join(', ')}]`);
          
          // Smart approach: find paths that connect the selected table to its related tables
          const relationshipPaths = svgRoot.querySelectorAll('path[id*="entity-"]');
          let highlightedCount = 0;
          
          relationshipPaths.forEach(path => {
            const pathId = path.getAttribute('id') || '';
            
            // Check if this path connects the selected table to any of its connected tables
            const connectsSelectedTable = connectedTables.some(connectedTable => {
              // Path IDs typically look like: "id_entity-TableA-X_entity-TableB-Y_Z"
              const selectedPattern = `entity-${selectedTable}-`;
              const connectedPattern = `entity-${connectedTable}-`;
              
              return pathId.includes(selectedPattern) && pathId.includes(connectedPattern);
            });
            
            if (connectsSelectedTable) {
              path.classList.add('relationship-highlighted');
              highlightedCount++;
              console.log(`✅ Highlighted path: ${pathId}`);
            }
          });
          
          console.log(`✅ Highlighted ${highlightedCount} specific relationship lines for ${selectedTable}`);
        } else {
          console.log(`⚠️ No relationships found for ${selectedTable}`);
        }
      }
    }
  }, [selectedTable, svgContent]);

  // Debug: Track selectedTableFromSearch prop changes
  useEffect(() => {
    console.log(`📥 PROP CHANGE: selectedTableFromSearch changed to "${selectedTableFromSearch}"`);
    
    // Clear the last processed ref when search selection is cleared
    if (!selectedTableFromSearch) {
      lastProcessedSearchTable.current = null;
      console.log(`🧹 Cleared lastProcessedSearchTable ref`);
    }
  }, [selectedTableFromSearch]);

  // Handle external table selection from search
  useEffect(() => {
    console.log(`🔍 ERDRenderer useEffect triggered: selectedTableFromSearch="${selectedTableFromSearch}", selectedTable="${selectedTable}", lastProcessed="${lastProcessedSearchTable.current}"`);
    
    // Only process if this is a new search selection (not a repeated one)
    if (selectedTableFromSearch && 
        selectedTableFromSearch !== lastProcessedSearchTable.current) {
      
      console.log(`🔍 External table selection request: ${selectedTableFromSearch}`);
      
      // Update the last processed ref
      lastProcessedSearchTable.current = selectedTableFromSearch;
      
      // Mark this as a search-triggered selection for immediate centering
      setSearchTargetTable(selectedTableFromSearch);
      setIsSearchTriggered(true);
      
      // Clear any legacy centering requests since we're handling this via search centering
      setNeedsCenteringAfterStyling(null);
      
      handleTableClick(selectedTableFromSearch, undefined, true);
      
      // Centering will be handled by the effect that watches searchTargetTable
      console.log(`⏳ Allowing centering to complete`);
    } else if (selectedTableFromSearch === lastProcessedSearchTable.current) {
      console.log(`⚠️ Skipping duplicate search selection: "${selectedTableFromSearch}" was already processed`);
    } else {
      console.log(`❌ Condition not met: selectedTableFromSearch="${selectedTableFromSearch}" (truthy: ${!!selectedTableFromSearch}), lastProcessed="${lastProcessedSearchTable.current}", same as last: ${selectedTableFromSearch === lastProcessedSearchTable.current}`);
    }
  }, [selectedTableFromSearch, selectedTable, handleTableClick]);

  // Enhanced centering for search results with cross-domain support and retry mechanism
  useEffect(() => {
    console.log(`🎯 Search centering useEffect: searchTargetTable="${searchTargetTable}", isSearchTriggered=${isSearchTriggered}, svgContent=${!!svgContent}, baseSvgContent=${!!baseSvgContent}`);
    
    if (searchTargetTable && isSearchTriggered && svgContent && baseSvgContent) {
      console.log(`🎯 Search-triggered centering: targeting table "${searchTargetTable}"`);
      
      // Enhanced centering function with retry mechanism
      const attemptCentering = (attempt: number = 1, maxAttempts: number = 3) => {
        console.log(`🔄 Centering attempt ${attempt}/${maxAttempts} for table "${searchTargetTable}"`);
        
        // Check if table element exists before attempting to center
        const svgContainer = svgContainerRef.current;
        const tableElement = svgContainer?.querySelector(`g[data-table-name="${searchTargetTable}"]`);
        
        if (tableElement) {
          console.log(`✅ Table element found, proceeding with centering`);
          centerOnTable(searchTargetTable);
          
          // Trigger table selection after successful centering
          handleTableClick(searchTargetTable, undefined, true);
          
          // Clear search target after successful centering
          setSearchTargetTable(null);
          setIsSearchTriggered(false);
          console.log(`✅ Search centering completed for table: ${searchTargetTable}`);
        } else if (attempt < maxAttempts) {
          console.log(`⚠️ Table element not found, retrying in ${200 * attempt}ms (attempt ${attempt + 1}/${maxAttempts})`);
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
      
      console.log(`⏱️ Using ${initialDelay}ms delay for ${isLikelyCrossDomain ? 'cross-domain' : 'same-domain'} centering`);
      
      const timeoutId = setTimeout(() => attemptCentering(), initialDelay);
      return () => clearTimeout(timeoutId);
    }
  }, [svgContent, searchTargetTable, isSearchTriggered, baseSvgContent, centerOnTable, handleTableClick]);

  // Enhanced domain switch completion detection
  useEffect(() => {
    if (searchTargetTable && !isSearchTriggered && svgContent) {
      // This handles the case where domain switch completed and ERD re-rendered
      console.log(`🌐 Domain switch completed, re-triggering search centering for: ${searchTargetTable}`);
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
        console.log(`🎯 Background click detected, clearing selection: "${selectedTable}"`);
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
      console.log('🔍 ERD Event Handler Binding - useEffect triggered');
      console.log('  - svgContent length:', svgContent.length);
      console.log('  - svgContainerRef exists:', !!svgContainerRef.current);
      
      // Small delay to ensure SVG is fully rendered in the DOM
      const timeoutId = setTimeout(() => {
        console.log('🔍 ERD Event Handler Binding - timeout executing, calling bindERDEventHandlers...');
        bindERDEventHandlers();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    } else {
      console.log('🔍 ERD Event Handler Binding - useEffect skipped:', {
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
            
            {/* Enhanced Phase 3 Interactive Controls */}
            <div 
              className="erd-controls absolute bottom-4 right-4 flex flex-col gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border p-2"
              style={{ 
                zIndex: 100, 
                maxHeight: '300px', 
                maxWidth: '200px',
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

              {/* Layout Options */}
              <div className="border-t pt-2 mt-2">
                <div className="text-xs text-muted-foreground px-1 mb-1">Display</div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant={isCompactView ? "default" : "ghost"}
                    size="sm"
                    onClick={handleToggleCompactView}
                    title="Compact View (Alt+C)"
                    className="h-6 w-full text-xs justify-start"
                  >
                    {isCompactView ? '📦' : '📋'} {isCompactView ? 'Compact' : 'Normal'}
                  </Button>
                  <Button
                    variant={showRelationshipLabels ? "default" : "ghost"}
                    size="sm"
                    onClick={handleToggleRelationshipLabels}
                    title="Show Relationship Labels (Alt+L)"
                    className="h-6 w-full text-xs justify-start"
                  >
                    {showRelationshipLabels ? '🏷️' : '🔗'} Labels
                  </Button>
                  <Button
                    variant={showAttributeDetails ? "default" : "ghost"}
                    size="sm"
                    onClick={handleToggleAttributeDetails}
                    title="Show Attribute Details (Alt+A)"
                    className="h-6 w-full text-xs justify-start"
                  >
                    {showAttributeDetails ? '📝' : '📄'} Attributes
                  </Button>
                </div>
              </div>

              {/* Debug Info */}
              {clickableTablesCount > 0 && (
                <div className="border-t pt-2 mt-2">
                  <div className="text-xs text-muted-foreground px-1 mb-1">Interactive</div>
                  <div className="text-xs font-medium px-1">
                    {clickableTablesCount} clickable tables
                  </div>
                  {detectedTables.length > 0 && detectedTables.length <= 3 && (
                    <div className="text-xs text-muted-foreground px-1 mt-1">
                      {detectedTables.join(', ')}
                    </div>
                  )}
                  {detectedTables.length > 3 && (
                    <div className="text-xs text-muted-foreground px-1 mt-1">
                      {detectedTables.slice(0, 3).join(', ')}...
                    </div>
                  )}
                </div>
              )}

              {/* Domain Info */}
              {domain && domain !== 'overview' && (
                <div className="border-t pt-2 mt-2">
                  <div className="text-xs text-muted-foreground px-1">Domain</div>
                  <div className="text-xs font-medium px-1 capitalize">
                    {domainResults[domain]?.displayName || domain.replace(/[-_]/g, ' ')}
                  </div>
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
    prevProps.selectedTableFromSearch === nextProps.selectedTableFromSearch &&
    prevProps.domain === nextProps.domain
  );
});

export default MemoizedERDRenderer;
