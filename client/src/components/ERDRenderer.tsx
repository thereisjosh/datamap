import React, { useEffect, useState, memo, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Download, Copy, AlertCircle, ZoomIn, ZoomOut, RotateCcw, Move, Maximize2 } from 'lucide-react';
import './ERDRenderer.css';

interface ERDRendererProps {
  mermaidCode?: string;
  isDarkMode?: boolean;
  isLoading?: boolean;
  domain?: string;
  selectedTableFromSearch?: string | null;
  onTableSelectionComplete?: () => void;
  onDomainSwitch?: (domain: string, tableName: string) => void;
}


const ERDRenderer: React.FC<ERDRendererProps> = ({
  mermaidCode = '',
  isDarkMode = false,
  isLoading = false,
  domain,
  selectedTableFromSearch = null,
  onTableSelectionComplete,
  onDomainSwitch
}) => {
  // State for Direct SVG Rendering pattern
  const [svgContent, setSvgContent] = useState<string>('');
  const [originalSvgContent, setOriginalSvgContent] = useState<string>(''); // Store original content separately
  const [baseSvgContent, setBaseSvgContent] = useState<string>(''); // Store clean content
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [needsCenteringAfterStyling, setNeedsCenteringAfterStyling] = useState<{ tableName: string; } | null>(null);
  const [isInitialStylingComplete, setIsInitialStylingComplete] = useState<boolean>(false);
  
  // Transform-based Pan-Zoom state and refs
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const transformGroupRef = useRef<SVGGElement | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(1.0);
  const [currentPan, setCurrentPan] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [isPanEnabled, setIsPanEnabled] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [svgBounds, setSvgBounds] = useState<{x: number, y: number, width: number, height: number}>({x: 0, y: 0, width: 800, height: 600});
  
  // Enhanced zoom and focus state
  const [viewMode, setViewMode] = useState<'overview' | 'detail' | 'focus'>('overview');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [highlightedTables, setHighlightedTables] = useState<Set<string>>(new Set());
  
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
  const ZOOM_TRACKPAD_MULTIPLIER = 1.8; // Additional multiplier for trackpads (more aggressive than pan)
  const ZOOM_MAX_SENSITIVITY = 0.004; // Maximum sensitivity to prevent overly aggressive zooming
  
  // Clean rendering - no domain styling

  // Initialize Mermaid with industry standard responsive configuration
  useEffect(() => {
    try {
      mermaid.initialize({
        startOnLoad: false, // Critical for React integration
        theme: isDarkMode ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'Arial, sans-serif',
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

  // Enhanced table centering function with improved handling for complex tables
  const centerOnTable = useCallback((tableName: string, retryCount: number = 0) => {
    console.log(`🎯 centerOnTable called for: ${tableName} (attempt ${retryCount + 1})`);
    
    // Special debugging for problematic tables
    if (tableName.toLowerCase().includes('opportunity')) {
      console.log(`🔍 Special handling for Opportunity table (high relationship count)`);
    }
    
    if (!svgContainerRef.current) {
      console.warn(`❌ Cannot center on table ${tableName}: Container not available`);
      return;
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
          if (tableEntity.ownerDocument && tableEntity.getBoundingClientRect) {
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
          // Enhanced validation with bounds checking for complex tables
          const isValidX = isFinite(elementCenterX) && elementCenterX > -10000 && elementCenterX < 10000;
          const isValidY = isFinite(elementCenterY) && elementCenterY > -10000 && elementCenterY < 10000;
          
          if (isValidX && isValidY) {
            console.log(`  📍 Final element center: (${elementCenterX}, ${elementCenterY})`);
            
            // For problematic tables like Opportunity, use more conservative zoom
            const isComplexTable = tableName.toLowerCase().includes('opportunity');
            const targetZoom = isComplexTable ? 2.5 : 3.0; // Slightly less aggressive zoom for complex tables
            
            zoomToScale(targetZoom, elementCenterX, elementCenterY);
            console.log(`✅ Centered table ${tableName} at zoom ${targetZoom}x${isComplexTable ? ' (complex table)' : ''}`);
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
        console.warn('Could not center on table:', error);
        zoomToScale(3.0);
      }
    } else {
      console.warn(`Could not find entity element for table: ${tableName}`);
      zoomToScale(3.0);
    }
  }, [zoomToScale]);

  // Define handleTableClick before it's used in event delegation
  const handleTableClick = useCallback((tableName: string, event?: MouseEvent) => {
    console.log(`🎯 Selected table: ${tableName}`);
    
    // Domain detection: Check if table exists in current domain
    const svgContainer = svgContainerRef.current;
    if (svgContainer) {
      const tableElement = svgContainer.querySelector(`g[data-table-name="${tableName}"]`);
      
      if (!tableElement && onDomainSwitch) {
        console.log(`🔍 Table "${tableName}" not found in current domain "${domain || 'unknown'}" - requesting domain switch`);
        
        // Define domain patterns similar to server-side logic
        const domainPatterns = {
          'user-management': ['User', 'Role', 'Group', 'Permission', 'Login'],
          'donations-payments': ['Donation', 'Giver', 'Pledge', 'Fund', 'Donor', 'Payment', 'Transaction', 'Invoice', 'Billing', 'ClaimTDR', 'TaxDeductible', 'Receipt'],
          'opportunities': ['Opportunity', 'Deal', 'Quote', 'Lead'],
          'campaigns': ['Campaign', 'Marketing', 'Contact', 'ActiveCampaign', 'BulkImport'],
          'system': ['Log', 'SSO', 'AppVar', 'Configuration', 'Settings']
        };
        
        // Find which domain this table likely belongs to
        let targetDomain = null;
        for (const [domainId, patterns] of Object.entries(domainPatterns)) {
          for (const pattern of patterns) {
            if (tableName.toLowerCase().includes(pattern.toLowerCase()) || pattern.toLowerCase().includes(tableName.toLowerCase())) {
              targetDomain = domainId;
              console.log(`📊 Table "${tableName}" matches domain "${domainId}" pattern "${pattern}"`);
              break;
            }
          }
          if (targetDomain) break;
        }
        
        if (targetDomain && targetDomain !== domain) {
          console.log(`🎯 Switching to domain "${targetDomain}" for table "${tableName}"`);
          onDomainSwitch(targetDomain, tableName);
          return; // Don't proceed with centering, let the domain switch handle it
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
    
    // Find related tables (this is a simplified version - can be enhanced)
    const relatedTables = new Set<string>();
    relatedTables.add(tableName);
    
    // TODO: Parse mermaid code to find actual relationships
    // For now, just highlight the clicked table
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
    
    // Schedule centering to happen after styling completes
    setNeedsCenteringAfterStyling({ tableName });
  }, [selectedTable, domain, onDomainSwitch]);

  // Add event delegation for table clicks - handles clicks on any child element
  useEffect(() => {
    const delegatedClickHandler = (event: MouseEvent) => {
      const target = event.target as Element;
      const svgContainer = svgContainerRef.current;
      
      // Only handle clicks within our SVG container
      if (svgContainer && svgContainer.contains(target)) {
        console.log(`📍 Document click detected in SVG area:`);
        console.log(`  Target:`, target.tagName, (target as any).className?.baseVal || target.className);
        console.log(`  Position: (${event.clientX}, ${event.clientY})`);
        
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
          
          console.log(`🎯 DELEGATED TABLE CLICK: ${tableName}`);
          console.log(`  Event details:`, {
            type: event.type,
            target: target.tagName,
            entityElement: entityParent.tagName,
            detectionStrategy: entityParent.closest('g[class*="node"]') ? 'closest(g[class*="node"])' : 'manual traversal'
          });
          
          // Call the table click handler directly
          handleTableClick(tableName);
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
            // Comprehensive SVG structure analysis
            
            // Analyze all elements and their attributes
            const allElements = Array.from(svgElement.querySelectorAll('*'));
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
      
      // Convert mouse position to SVG coordinate space
      // This is the key to proper zoom-to-cursor behavior
      const svg = container.querySelector('svg') as SVGSVGElement;
      if (!svg) return;
      
      const viewBoxAttr = svg.getAttribute('viewBox');
      if (!viewBoxAttr) {
        // Fallback: Use container dimensions if no viewBox
        const svgX = clientX;
        const svgY = clientY;
        console.log(`📍 Zoom target (no viewBox): SVG(${svgX.toFixed(2)}, ${svgY.toFixed(2)})`);
        zoomToScale(newZoom, svgX, svgY);
        return;
      }
      
      // Parse viewBox for proper coordinate conversion
      const [vbX, vbY, vbWidth, vbHeight] = viewBoxAttr.split(' ').map(Number);
      const svgRect = svg.getBoundingClientRect();
      
      // Convert pixel coordinates to SVG coordinate space
      const scaleX = vbWidth / svgRect.width;
      const scaleY = vbHeight / svgRect.height;
      
      const svgX = vbX + clientX * scaleX;
      const svgY = vbY + clientY * scaleY;
      
      console.log(`📍 Cursor-based zoom: Client(${clientX.toFixed(2)}, ${clientY.toFixed(2)}) -> SVG(${svgX.toFixed(2)}, ${svgY.toFixed(2)})`);
      console.log(`🔍 Zoom: ${currentZoom.toFixed(2)}x -> ${newZoom.toFixed(2)}x (factor: ${zoomFactor.toFixed(3)})`);
      
      // Apply zoom centered on cursor position
      zoomToScale(newZoom, svgX, svgY);
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
  }, [svgContainerRef.current, currentZoom, isDragging, dragStart, isPanEnabled, zoomToScale, panToPosition]);

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
    zoomToScale(newZoom);
  }, [currentZoom, zoomToScale]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(0.1, currentZoom * 0.8);
    zoomToScale(newZoom);
  }, [currentZoom, zoomToScale]);

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
      
      // Get the actual SVG content bounds
      try {
        const svgBBox = svgRef.current.getBBox();
        const scaleX = containerRect.width / svgBBox.width;
        const scaleY = containerRect.height / svgBBox.height;
        let fitScale = Math.min(scaleX, scaleY, 1) * 0.95; // 95% padding instead of 90%
        
        // Set minimum zoom level for readability - especially important for 'All' view
        fitScale = Math.max(fitScale, 0.8); // Minimum 80% zoom level
        
        zoomToScale(fitScale, svgBBox.x + svgBBox.width / 2, svgBBox.y + svgBBox.height / 2);
        
        console.log(`📏 HandleFit: calculated scale=${(Math.min(scaleX, scaleY, 1) * 0.95).toFixed(3)}, applied scale=${fitScale.toFixed(3)}`);
      } catch (error) {
        // Fallback to reasonable zoom level
        console.warn('SVG getBBox failed, using fallback zoom');
        zoomToScale(0.5); // 50% zoom as fallback instead of 100%
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

  const handleClearSelection = useCallback(() => {
    // Remove selection handles
    removeSelectionHandles();
    
    setSelectedTable(null);
    setHighlightedTables(new Set());
    setViewMode('overview');
    
    handleFit();
    
    console.log('🧹 Cleared table selection and handles');
  }, [handleFit, removeSelectionHandles]);

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
      
      console.log(`🔍 Setting up clean table detection (no styling applied)...`);
      
      // Find individual entity nodes for click handling only (exclude containers)
      // Target specific node classes but exclude plural "nodes" container
      const entityBoxes = Array.from(svgElement.querySelectorAll('g.node, g[class="node default"], g[class="node"]')).filter(box => {
        const className = (box as any).className?.baseVal || box.className || '';
        // Exclude containers like "nodes" - only include individual "node" elements
        return !className.includes('nodes') && (className.includes('node'));
      });
      console.log(`🔍 Found ${entityBoxes.length} individual table nodes for detection...`);
      
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
        
        // Set up click handling only - no visual styling
        if (foundTableName) {
          box.setAttribute('data-table-name', foundTableName);
          (box as HTMLElement).style.cursor = 'pointer';
          
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
      
      // Update debugging info
      setClickableTablesCount(clickableCount);
      setDetectedTables(tablesFound);
      
      // Return the clean SVG with no styling changes
      const serializer = new XMLSerializer();
      const cleanSvg = serializer.serializeToString(svgDoc);
      
      return cleanSvg;
      
    } catch (error) {
      console.error('Error setting up table detection:', error);
      return svgString; // Return original if setup fails
    }
  }, [handleTableClick]);

  // Note: Removed CSS injection-based styling to prevent conflicts with direct DOM styling

  // Apply clean SVG content without styling
  useEffect(() => {
    if (originalSvgContent && !isInitialStylingComplete) {
      const cleanSvg = applySVGDomainStyling(originalSvgContent);
      const wrappedSvg = wrapSVGWithTransformGroup(cleanSvg);
      setBaseSvgContent(wrappedSvg);
      setSvgContent(wrappedSvg);
      setIsInitialStylingComplete(true);
    }
  }, [originalSvgContent, applySVGDomainStyling, wrapSVGWithTransformGroup, isInitialStylingComplete]);
  
  // Apply selection styling when selection changes - consolidated with domain styling
  useEffect(() => {
    if (baseSvgContent && isInitialStylingComplete) {
      // Just use the base styled content, no additional CSS injection
      setSvgContent(baseSvgContent);
      
      // If there's a pending table selection, handle it after styling completes
      if (needsCenteringAfterStyling) {
        setTimeout(() => {
          centerOnTable(needsCenteringAfterStyling.tableName);
          setNeedsCenteringAfterStyling(null);
        }, 300); // Increased delay to ensure DOM updates complete and elements are positioned
      }
    }
  }, [selectedTable, highlightedTables, baseSvgContent, isInitialStylingComplete, needsCenteringAfterStyling, centerOnTable]);

  // Handle external table selection from search
  useEffect(() => {
    if (selectedTableFromSearch && selectedTableFromSearch !== selectedTable) {
      console.log(`🔍 External table selection request: ${selectedTableFromSearch}`);
      handleTableClick(selectedTableFromSearch);
      
      // Notify parent component that selection is complete
      if (onTableSelectionComplete) {
        onTableSelectionComplete();
      }
    }
  }, [selectedTableFromSearch, selectedTable, handleTableClick, onTableSelectionComplete]);

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

              {/* Zoom Controls */}
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
              </div>
              
              {/* Navigation Controls */}
              <div className="flex gap-1">
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
                  variant="ghost"
                  size="sm"
                  onClick={handleFit}
                  title="Fit to Screen (F)"
                  className="h-8 w-8 p-0"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDomainFocus}
                  title="Focus on Domain"
                  className="h-8 w-8 p-0"
                >
                  🏷️
                </Button>
              </div>
              
              <Button
                variant={isPanEnabled ? "default" : "ghost"}
                size="sm"
                onClick={handleTogglePan}
                title="Toggle Pan Mode (Space)"
                className="h-8 w-8 p-0"
              >
                <Move className="h-4 w-4" />
              </Button>

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
                    {domain.replace('-', ' ')}
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
    prevProps.isLoading === nextProps.isLoading
  );
});

export default MemoizedERDRenderer;
