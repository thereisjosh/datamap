# ERD Generator Application

## Overview

This is a full-stack ERD (Entity Relationship Diagram) generator application that processes Excel data dictionaries and automatically generates Mermaid diagrams. The application allows users to upload Excel files containing table and attribute metadata, which are then parsed and visualized as professional ERD diagrams. Built with a modern React frontend and Express backend, the system provides an intuitive interface for database designers and developers to quickly convert tabular data specifications into visual database schemas.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development practices
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management and caching
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent, accessible UI components
- **Build Tool**: Vite for fast development and optimized production builds
- **File Upload**: React Dropzone for drag-and-drop file upload functionality

### Backend Architecture
- **Framework**: Express.js with TypeScript running on Node.js
- **File Processing**: Multer for handling multipart file uploads with memory storage
- **Excel Parsing**: SheetJS (xlsx) library for reading and parsing Excel files
- **Data Storage**: In-memory storage implementation with interface for future database integration
- **API Design**: RESTful endpoints with proper error handling and CORS support

### Database Schema Design
- **ORM**: Drizzle ORM configured for PostgreSQL with type-safe queries
- **Tables**: 
  - `tables` - stores table metadata with JSONB attributes column
  - `relationships` - tracks foreign key relationships between tables
  - `uploadSessions` - manages file upload processing status and errors
- **Data Validation**: Zod schemas for runtime type checking and API request validation

### Core Processing Pipeline
- **Excel Parser Service**: Extracts table and attribute metadata from standardized Excel sheets
- **Mermaid Generator Service**: Converts parsed metadata into valid Mermaid erDiagram syntax
- **Error Handling**: Comprehensive validation with user-friendly error messages
- **File Validation**: Restricts uploads to .xlsx files with 5MB size limit

### Component Architecture
- **Upload Panel**: Drag-and-drop interface with progress tracking and file validation
- **Metadata Preview**: Accordion-based display of parsed table structures with relationship indicators
- **ERD Renderer**: Mermaid diagram visualization with zoom, export, and theming capabilities
- **Tab Navigation**: Multi-step workflow from upload through preview to final diagram

## External Dependencies

### Core Runtime Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL driver for database connectivity
- **drizzle-orm & drizzle-kit**: Type-safe ORM and migration toolkit
- **mermaid**: Client-side diagram rendering library
- **xlsx**: Excel file parsing and manipulation
- **multer**: Express middleware for handling file uploads
- **cors**: Cross-origin resource sharing configuration

### UI and Styling
- **@radix-ui/***: Comprehensive set of accessible, unstyled UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Type-safe variant-based component styling
- **lucide-react**: Modern icon library

### Development and Build Tools
- **vite**: Fast build tool with HMR and optimized bundling
- **typescript**: Static type checking and enhanced developer experience
- **@replit/vite-plugin-***: Replit-specific development enhancements
- **react-dropzone**: File upload UI component with drag-and-drop support

### Data Processing and Validation
- **zod**: Runtime type validation and schema definition
- **date-fns**: Date manipulation and formatting utilities
- **nanoid**: Secure, URL-safe unique ID generation

The application is designed for deployment on Replit with built-in support for PostgreSQL databases, making it easily deployable and scalable for team use.