import { type TableData, type Relationship } from '@shared/schema';

interface MermaidOptions {
  theme?: string;
  direction?: string;
}

interface MermaidResponse {
  diagram: string;
  metadata: {
    tables_count: number;
    relationships_count: number;
  };
}

export class MermaidGeneratorService {
  generateMermaidDiagram(tables: TableData[], relationships: Relationship[] = [], options: MermaidOptions = {}): MermaidResponse {
    let diagram = 'erDiagram\n';

    // Generate entity definitions
    for (const table of tables) {
      diagram += `  ${table.name} {\n`;
      
      for (const attribute of table.attributes) {
        let keyIndicator = '';
        if (attribute.isPrimaryKey) {
          keyIndicator = ' PK';
        } else if (attribute.isForeignKey) {
          keyIndicator = ' FK';
        }
        
        diagram += `    ${attribute.type} ${attribute.name}${keyIndicator}\n`;
      }
      
      diagram += '  }\n';
    }

    // Add an empty line before relationships
    if (relationships.length > 0) {
      diagram += '\n';
    }

    // Generate relationships
    const processedRelationships = new Set<string>();
    
    for (const rel of relationships) {
      // Create a unique key for this relationship to avoid duplicates
      const relKey = `${rel.sourceTable}-${rel.sourceColumn}-${rel.targetTable}-${rel.targetColumn}`;
      
      if (!processedRelationships.has(relKey)) {
        // Check if both tables exist
        const sourceTableExists = tables.some(t => t.name === rel.sourceTable);
        const targetTableExists = tables.some(t => t.name === rel.targetTable);
        
        if (sourceTableExists && targetTableExists) {
          // Use proper Mermaid relationship syntax
          // }o--|| means zero or one to one or more
          diagram += `  ${rel.sourceTable} }o--|| ${rel.targetTable} : "FK ${rel.sourceColumn}"\n`;
          processedRelationships.add(relKey);
        }
      }
    }

    return {
      diagram: diagram.trim(),
      metadata: {
        tables_count: tables.length,
        relationships_count: processedRelationships.size
      }
    };
  }

  validateMermaidSyntax(diagram: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Basic validation checks
    if (!diagram.startsWith('erDiagram')) {
      errors.push('Diagram must start with "erDiagram"');
    }

    // Check for balanced braces
    const openBraces = (diagram.match(/{/g) || []).length;
    const closeBraces = (diagram.match(/}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      errors.push('Unbalanced braces in diagram syntax');
    }

    // Check for valid relationship syntax
    const relationshipLines = diagram.split('\n').filter(line => 
      line.includes('--') && (line.includes('}') || line.includes('|'))
    );
    
    for (const line of relationshipLines) {
      if (!line.match(/\s+\w+\s+[}|o]+--[|]+\s+\w+\s*:/)) {
        errors.push(`Invalid relationship syntax: ${line.trim()}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const mermaidGeneratorService = new MermaidGeneratorService();
