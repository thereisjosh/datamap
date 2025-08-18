import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { flexibleExcelParser, type ColumnMappings } from "../services/flexibleExcelParser";
import { 
  validateFileUpload, 
  validateSchema 
} from "../middleware/validation";
import { 
  analysisRateLimit,
  fileUploadRateLimit 
} from "../middleware/advancedRateLimiter";
import { 
  logSecurityEvent, 
  logFileUploadSecurity 
} from "../middleware/securityLogger";
import { columnMappingsSchema } from "@shared/validation-schemas";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept Excel files
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

// Validation schemas
const analyzeMappingsSchema = z.object({
  tableSheet: z.string().min(1, "Table sheet is required"),
  tableNameColumn: z.string().min(1, "Table name column is required"),
  tableTypeColumn: z.string().optional(),
  columnSheet: z.string().min(1, "Column sheet is required"),
  columnTableNameColumn: z.string().min(1, "Column table name column is required"),
  columnNameColumn: z.string().min(1, "Column name column is required"),
  columnTypeColumn: z.string().min(1, "Column type column is required"),
  primaryKeyColumn: z.string().optional(),
  foreignKeyTableColumn: z.string().optional(),
  foreignKeyColumnColumn: z.string().optional(),
});

/**
 * POST /api/flexible-parser/analyze
 * Analyze Excel file structure and return sheets/columns information
 */
router.post('/analyze', [
  analysisRateLimit,
  logSecurityEvent('excel_analysis', 'medium'),
  upload.single('file'),
  validateFileUpload({ 
    required: true,
    maxSize: 10 * 1024 * 1024,
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ]
  }),
  logFileUploadSecurity()
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    console.log(`📊 Analyzing Excel structure: ${req.file.originalname} (${req.file.size} bytes)`);

    const analysis = await flexibleExcelParser.analyzeExcelStructure(req.file.buffer);

    console.log(`✅ Analysis complete: ${analysis.sheets.length} sheets found`);

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Error analyzing Excel structure:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze Excel file'
    });
  }
});

/**
 * POST /api/flexible-parser/parse
 * Parse Excel file using provided column mappings
 */
router.post('/parse', [
  fileUploadRateLimit,
  logSecurityEvent('excel_parse', 'medium'),
  upload.single('file'),
  validateFileUpload({ 
    required: true,
    maxSize: 10 * 1024 * 1024
  }),
  logFileUploadSecurity(),
  validateSchema(columnMappingsSchema)
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Parse mapping data from form data or body
    let mappingData;
    try {
      mappingData = req.body.mapping ? JSON.parse(req.body.mapping) : req.body;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mapping data format'
      });
    }

    // Validate mappings
    const validationResult = analyzeMappingsSchema.safeParse(mappingData);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mapping configuration',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const mappings: ColumnMappings = validationResult.data;

    console.log(`🔄 Parsing Excel with custom mappings: ${req.file.originalname}`);
    console.log(`📋 Complete Mappings:`, {
      tableSheet: mappings.tableSheet,
      tableNameColumn: mappings.tableNameColumn,
      tableTypeColumn: mappings.tableTypeColumn || '(not provided)',
      columnSheet: mappings.columnSheet,
      columnTableNameColumn: mappings.columnTableNameColumn,
      columnNameColumn: mappings.columnNameColumn,
      columnTypeColumn: mappings.columnTypeColumn,
      primaryKeyColumn: mappings.primaryKeyColumn || '(not provided)',
      foreignKeyTableColumn: mappings.foreignKeyTableColumn || '(not provided)',
      foreignKeyColumnColumn: mappings.foreignKeyColumnColumn || '(not provided)'
    });

    const result = await flexibleExcelParser.parseWithMappings(req.file.buffer, mappings);

    console.log(`✅ Parsing complete: ${result.summary.tablesFound} tables, ${result.summary.relationshipsFound} relationships`);

    if (result.errors.length > 0) {
      console.log(`⚠️ Parsing warnings:`, result.errors);
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error parsing Excel with mappings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse Excel file'
    });
  }
});

/**
 * GET /api/flexible-parser/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Flexible Excel Parser API is running',
    timestamp: new Date().toISOString()
  });
});

export default router;