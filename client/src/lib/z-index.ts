/**
 * Systematic Z-Index Management for ERD Builder
 * Following 2025 UI/UX best practices for layering hierarchy
 */

export const Z_INDEX = {
  // Base content layers
  BASE: 0,           // Main content, ERD diagrams
  SIDEBAR: 1,        // Persistent navigation, search, domain filters
  ELEVATED: 5,       // Cards, floating elements, dropdowns
  
  // Interactive layers  
  NAVIGATION: 10,    // Navigation dropdowns, menus
  OVERLAY: 15,       // Chat panels, popovers, tooltips
  MODAL: 20,         // Modal dialogs, full-screen overlays
  
  // System layers
  TOAST: 25,         // Toast notifications, alerts
  TOOLTIP: 30,       // Tooltips that appear over everything
  DEBUG: 9999        // Development/debug overlays only
} as const;

// CSS custom properties for consistent usage
export const Z_INDEX_CSS_VARS = {
  '--z-base': Z_INDEX.BASE.toString(),
  '--z-sidebar': Z_INDEX.SIDEBAR.toString(),
  '--z-elevated': Z_INDEX.ELEVATED.toString(),
  '--z-navigation': Z_INDEX.NAVIGATION.toString(),
  '--z-overlay': Z_INDEX.OVERLAY.toString(),
  '--z-modal': Z_INDEX.MODAL.toString(),
  '--z-toast': Z_INDEX.TOAST.toString(),
  '--z-tooltip': Z_INDEX.TOOLTIP.toString(),
} as const;

// Utility functions for z-index management
export const getZIndex = {
  base: () => Z_INDEX.BASE,
  sidebar: () => Z_INDEX.SIDEBAR,
  elevated: () => Z_INDEX.ELEVATED,
  navigation: () => Z_INDEX.NAVIGATION,
  overlay: () => Z_INDEX.OVERLAY,
  modal: () => Z_INDEX.MODAL,
  toast: () => Z_INDEX.TOAST,
  tooltip: () => Z_INDEX.TOOLTIP,
} as const;

// CSS class utilities for common z-index patterns
export const zIndexClasses = {
  base: 'z-0',
  sidebar: 'z-[1]',
  elevated: 'z-[5]',
  navigation: 'z-[10]',
  overlay: 'z-[15]',
  modal: 'z-[20]',
  toast: 'z-[25]',
  tooltip: 'z-[30]',
} as const;