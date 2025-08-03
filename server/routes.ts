import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import cors from "cors";
import { storage } from "./storage";
import { excelParserService } from "./services/excelParser";
import { mermaidGeneratorService } from "./services/mermaidGenerator";
import { generateMermaidRequestSchema } from "@shared/schema";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow Excel files
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure CORS
  app.use(cors({
    origin: true, // Allow all origins in development
    credentials: true,
  }));

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      const uptime = process.uptime();
      const uptimeString = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        uptime: uptimeString,
        services: {
          excel_parser: "operational",
          mermaid_generator: "operational"
        }
      });
    } catch (error) {
      res.status(500).json({
        error: "Health check failed",
        code: 500
      });
    }
  });

  // Parse Excel endpoint
  app.post("/api/parse-excel", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded",
          code: 400
        });
      }

      // Create upload session
      const session = await storage.createUploadSession({
        filename: req.file.originalname,
        status: "processing",
        tablesCount: null,
        relationshipsCount: null,
        errors: null
      });

      // Parse the Excel file
      const parseResult = await excelParserService.parseExcelFile(req.file.buffer);

      if (parseResult.errors.length > 0) {
        await storage.updateUploadSession(session.id, {
          status: "failed",
          errors: parseResult.errors
        });

        return res.status(422).json({
          error: "Failed to parse Excel file",
          code: 422,
          details: parseResult.errors
        });
      }

      // Store parsed data
      await storage.clearTables();
      await storage.clearRelationships();

      for (const table of parseResult.tables) {
        await storage.createTable({
          name: table.name,
          attributes: table.attributes
        });
      }

      for (const relationship of parseResult.relationships) {
        await storage.createRelationship({
          sourceTable: relationship.sourceTable,
          sourceColumn: relationship.sourceColumn,
          targetTable: relationship.targetTable,
          targetColumn: relationship.targetColumn
        });
      }

      // Update session status
      await storage.updateUploadSession(session.id, {
        status: "completed",
        tablesCount: parseResult.tables.length.toString(),
        relationshipsCount: parseResult.relationships.length.toString()
      });

      // Format response to match frontend expectations
      const formattedTables = parseResult.tables.map(table => ({
        name: table.name,
        columns: table.attributes.map(attr => ({
          name: attr.name,
          type: attr.type,
          isPrimaryKey: attr.isPrimaryKey,
          isForeignKey: attr.isForeignKey,
          references: attr.references
        }))
      }));

      res.json({
        tables: formattedTables,
        relationships: parseResult.relationships,
        sessionId: session.id,
        metadata: {
          tables_count: parseResult.tables.length,
          relationships_count: parseResult.relationships.length
        }
      });

    } catch (error) {
      console.error('Parse Excel error:', error);
      
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: "File size exceeds 5MB limit",
            code: 413,
            details: {
              max_size: "5MB",
              received_size: req.file ? `${(req.file.size / 1024 / 1024).toFixed(1)}MB` : "unknown"
            }
          });
        }
      }

      res.status(500).json({
        error: "Internal server error during file parsing",
        code: 500,
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate Mermaid endpoint
  app.post("/api/generate-mermaid", async (req, res) => {
    try {
      // Validate request body
      const validatedData = generateMermaidRequestSchema.parse(req.body);
      
      const { tables, relationships = [], options = {} } = validatedData;

      // Generate Mermaid diagram
      const result = mermaidGeneratorService.generateMermaidDiagram(
        tables,
        relationships,
        options
      );

      // Validate the generated syntax
      const validation = mermaidGeneratorService.validateMermaidSyntax(result.diagram);
      
      if (!validation.isValid) {
        return res.status(500).json({
          error: "Failed to generate valid Mermaid syntax",
          code: 500,
          details: validation.errors
        });
      }

      res.json(result);

    } catch (error) {
      console.error('Generate Mermaid error:', error);
      
      res.status(400).json({
        error: "Invalid request data for Mermaid generation",
        code: 400,
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get parsed tables (for frontend integration)
  app.get("/api/tables", async (req, res) => {
    try {
      const tables = await storage.getTables();
      const relationships = await storage.getRelationships();

      // Format for frontend compatibility
      const formattedTables = tables.map(table => ({
        name: table.name,
        columns: Array.isArray(table.attributes) ? table.attributes.map((attr: any) => ({
          name: attr.name,
          type: attr.type,
          isPrimaryKey: attr.isPrimaryKey || false,
          isForeignKey: attr.isForeignKey || false,
          references: attr.references
        })) : []
      }));

      res.json({
        tables: formattedTables,
        relationships: relationships.map(rel => ({
          sourceTable: rel.sourceTable,
          sourceColumn: rel.sourceColumn,
          targetTable: rel.targetTable,
          targetColumn: rel.targetColumn
        }))
      });

    } catch (error) {
      console.error('Get tables error:', error);
      res.status(500).json({
        error: "Failed to retrieve tables",
        code: 500
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
