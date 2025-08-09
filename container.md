# ERD Builder - Container Layout Documentation

## Overview
This document maps the div container hierarchy for the ERD preview components to help understand layout structure, identify sizing issues, and debug container problems.

## Home Page ERD Preview Container Hierarchy

```
📄 home.tsx
├── <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
│   ├── <header className="sticky top-0 z-10 bg-background border-b border-border">
│   │   └── [Navigation content]
│   │
│   ├── <main className="container mx-auto px-4 py-8">                    ⚙️ Main page container
│   │   └── <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: '800px' }}>  🎯 HEIGHT: 800px
│   │       ├── <div className="w-full lg:w-1/2 space-y-4">              📤 Left column (50% width)
│   │       │   └── [Upload/Metadata panels]
│   │       │
│   │       └── <div className="w-full lg:w-1/2">                        📥 Right column (50% width)
│   │           └── <Card className="h-full" style={{ display: 'flex', flexDirection: 'column' }}>  🎯 HEIGHT: 100% of parent
│   │               └── <CardContent className="pt-6 flex-1" style={{ display: 'flex', flexDirection: 'column' }}>  🎯 HEIGHT: flex-1
│   │                   ├── <div className="mb-4">                       📋 Headers/selectors (fixed height)
│   │                   │   ├── <div className="flex justify-between items-center mb-4">
│   │                   │   │   ├── <h3>ERD Preview</h3>
│   │                   │   │   └── <Button>Full Preview</Button>
│   │                   │   └── [Domain Selector - when visible]          🔽 Takes additional space
│   │                   │
│   │                   └── 📦 <ERDRenderer />                           🎯 Remaining height after headers
│                               │
│                               📄 ERDRenderer.tsx
│                               └── <div className="flex flex-col h-full space-y-4">  🎯 HEIGHT: 100% of remaining space
│                                   ├── <div className="flex justify-end space-x-2 flex-shrink-0">  📋 Action buttons (fixed)
│                                   │   ├── <Button>Copy Code</Button>
│                                   │   └── <Button>Download SVG</Button>
│                                   │
│                                   └── <div className="border rounded-lg p-4 bg-white flex-1" 
│                                           style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
│                                                                           🎯 HEIGHT: flex-1 (remaining space)
│                                       │
│                                       ├── 🖼️ <div ref={svgContainerRef} 
│                                       │        dangerouslySetInnerHTML={{ __html: svgContent }}
│                                       │        style={{ width: '100%', height: '100%' }} />  ⭐ SVG CONTENT CONTAINER
│                                       │
│                                       └── <div style={{ position: 'absolute', bottom: '16px', right: '16px', zIndex: 100 }}>
│                                           └── 🎮 <DiagramControls />      💫 Floating controls overlay
│   │
│   └── <footer className="bg-muted mt-12 py-8">
│       └── [Footer content]
```

### Home Page Analysis
- **Available Height**: Starts with 800px from main container
- **Height Consumers**: 
  - Headers/title (~80px)
  - Domain selector (~80px when visible) 
  - Action buttons (~60px)
  - Card padding/margins (~40px)
- **Remaining for ERD**: ~540px (without domain selector) or ~460px (with selector)

---

## Full Preview Page Container Hierarchy

```
📄 erd-preview.tsx
├── <div className="min-h-screen bg-background">
│   ├── <header className="bg-background border-b border-border">
│   │   └── <div className="container mx-auto px-4 py-4">               📋 Header content (~80px)
│   │       └── [Back button, title, copy button]
│   │
│   └── <main className="container mx-auto px-4 py-8">                  ⚙️ Main content container
│       ├── <div className="bg-white dark:bg-slate-800 rounded-lg border border-border p-6" 
│       │        style={{ minHeight: '80vh' }}>                         🎯 HEIGHT: 80vh (~768px on 1024px screen)
│       │   │
│       │   └── 📦 <ERDRenderer mermaidCode={mermaidCode} />            🎯 Full available height
│       │       │
│       │       📄 ERDRenderer.tsx (Same structure as home page)
│       │       └── <div className="flex flex-col h-full space-y-4">    🎯 HEIGHT: 100% of 80vh
│       │           ├── <div className="flex justify-end space-x-2 flex-shrink-0">  📋 Action buttons (~60px)
│       │           │   ├── <Button>Copy Code</Button>
│       │           │   └── <Button>Download SVG</Button>
│       │           │
│       │           └── <div className="border rounded-lg p-4 bg-white flex-1" 
│       │                   style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
│       │                                                               🎯 HEIGHT: flex-1 (~700px remaining)
│       │               │
│       │               ├── 🖼️ <div ref={svgContainerRef} 
│       │               │        dangerouslySetInnerHTML={{ __html: svgContent }}
│       │               │        style={{ width: '100%', height: '100%' }} />  ⭐ SVG CONTENT CONTAINER
│       │               │
│       │               └── <div style={{ position: 'absolute', bottom: '16px', right: '16px', zIndex: 100 }}>
│       │                   └── 🎮 <DiagramControls />                  💫 Floating controls overlay
│       │
│       └── <div className="mt-8 bg-white dark:bg-slate-800 rounded-lg border border-border p-6">
│           └── [Code Display Section]                                   📋 Additional content below
```

### Full Preview Page Analysis
- **Available Height**: 80vh (~768px on typical screen)
- **Height Consumers**: 
  - Action buttons (~60px)
  - Container padding/margins (~24px)
- **Remaining for ERD**: ~684px (significantly more than home page)

---

## Key Container Properties

### Critical Height-Defining Containers

| Container | Location | Height Property | Impact |
|-----------|----------|----------------|---------|
| Main flex container | home.tsx:179 | `minHeight: '800px'` | 🎯 Sets total available space |
| ERD wrapper | erd-preview.tsx:67-68 | `minHeight: '80vh'` | 🎯 Gives full preview proper height context |
| Card | home.tsx:217 | `h-full` + flex column | ✅ Passes height down |
| CardContent | home.tsx:218 | `flex-1` + flex column | ✅ Takes remaining space |
| ERDRenderer root | ERDRenderer.tsx:447 | `h-full` + flex column | ✅ Uses available height |
| Diagram container | ERDRenderer.tsx:472-479 | `flex-1` + `height: '100%'` | ⭐ Final ERD container |
| SVG container | ERDRenderer.tsx:484-490 | `height: '100%'` | ⭐ SVG rendering target |

### Layout Patterns Used

1. **Flex Column Chain**: `display: flex, flexDirection: 'column'` with `flex-1` to distribute height
2. **Height Inheritance**: `height: '100%'` to use parent's full height  
3. **Minimum Heights**: `minHeight` to establish height context
4. **Absolute Positioning**: For floating controls overlay

---

## Container Issues & Solutions

### ✅ Fixed Issues
- **Full Preview No Height**: Added `minHeight: '80vh'` to ERD container
- **Control Overflow**: Added `overflow: 'hidden'` to prevent controls extending outside
- **Limited Home Space**: Increased from 600px to 800px

### 🎯 Height Distribution Comparison

| Page | Total Height | ERD Available | Notes |
|------|--------------|---------------|-------|
| Home Page | 800px | ~460-540px | Depends on domain selector visibility |
| Full Preview | 80vh (~768px) | ~684px | Much more space available |

### 🔍 Debugging Tips
1. **Check height inheritance chain** - ensure each container passes height down
2. **Look for height consumers** - headers, buttons, selectors that take fixed space
3. **Verify flex properties** - `flex-1` should take remaining space
4. **Test with browser dev tools** - inspect computed heights at each level

---

## SVG Rendering Flow

```
Mermaid.js → SVG String → dangerouslySetInnerHTML → DOM → svg-pan-zoom → Interactive Diagram
                                    ↑
                              SVG Container Ref
                           (ERDRenderer.tsx:484-490)
```

The SVG container at `ERDRenderer.tsx:484-490` is the final target where the interactive diagram renders. Its size determines the ERD display area.