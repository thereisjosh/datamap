import { type TableData } from '@shared/schema';

export type BusinessDomainType = 
  | 'user_management'
  | 'payments_donations' 
  | 'opportunities'
  | 'campaigns_marketing'
  | 'system_configuration'
  | 'organization_management'
  | 'content_management'
  | 'unknown';

export interface DomainPattern {
  name: string;
  patterns: RegExp[];
  priority: number;
  description: string;
}

export interface BusinessDomainClassification {
  domainType: BusinessDomainType;
  confidence: number;
  matchingPatterns: string[];
  suggestedName: string;
  description: string;
}

export class BusinessRuleEngine {
  
  private domainPatterns: Record<BusinessDomainType, DomainPattern> = {
    user_management: {
      name: 'User Management',
      patterns: [
        /\buser\b/i,
        /\bauth\b/i,
        /\brole\b/i,
        /\bpermission\b/i,
        /\blogin\b/i,
        /\bmember\b/i,
        /\bgroup\b/i,
        /\baccount\b/i,
        /\bprofile\b/i,
        /\bsession\b/i
      ],
      priority: 1,
      description: 'User authentication, authorization, and profile management'
    },
    
    payments_donations: {
      name: 'Donations and Payments',
      patterns: [
        /\bpayment\b/i,
        /\btransaction\b/i,
        /\bdonation\b/i,
        /\bcheckout\b/i,
        /\bbilling\b/i,
        /\binvoice\b/i,
        /\bgiver\b/i,
        /\bdonor\b/i,
        /\bpledge\b/i,
        /\bfund\b/i,
        /\brefund\b/i,
        /\breceipt\b/i,
        /\bstripe\b/i,
        /\benets\b/i,
        /\bideal\b/i
      ],
      priority: 2,
      description: 'Payment processing, donations, and financial transactions'
    },
    
    opportunities: {
      name: 'Opportunities',
      patterns: [
        /\bopportunity\b/i,
        /\bvolunteer\b/i,
        /\bregistration\b/i,
        /\bskill\b/i,
        /\bposition\b/i,
        /\bapplication\b/i,
        /\battendance\b/i,
        /\bvacancy\b/i,
        /\btimeslot\b/i,
        /\bhelper\b/i,
        /\bpartner\b/i,
        /\bapprove\b/i,
        /\bsuitable\b/i,
        /\bproject\b/i,
        /\brecurring\b/i,
        /\bregistration\b/i,
        /\bthreshold\b/i
      ],
      priority: 3,
      description: 'Volunteer opportunities, registrations, and skill matching'
    },
    
    campaigns_marketing: {
      name: 'Campaigns',
      patterns: [
        /\bcampaign\b/i,
        /\bmarketing\b/i,
        /\bcontent\b/i,
        /\barticle\b/i,
        /\bstory\b/i,
        /\bevent\b/i,
        /\btag\b/i,
        /\bcollection\b/i,
        /\bbrand\b/i,
        /\basset\b/i,
        /\bfeature\b/i
      ],
      priority: 4,
      description: 'Marketing campaigns, content management, and events'
    },
    
    organization_management: {
      name: 'Users',
      patterns: [
        /\bentitygroup\b/i,
        /\borganisation\b/i,
        /\borganization\b/i,
        /\bcharity\b/i,
        /\bpartner\b/i,
        /\binvitation\b/i,
        /\bgroundup\b/i,
        /\bsector\b/i,
        /\bentity\b/i
      ],
      priority: 5,
      description: 'Organization setup, partnerships, and entity management'
    },
    
    system_configuration: {
      name: 'System Management',
      patterns: [
        /\baudit\b/i,
        /\blog\b/i,
        /\bconfig\b/i,
        /\bsetting\b/i,
        /\bfile\b/i,
        /\breport\b/i,
        /\bnotification\b/i,
        /\bsystem\b/i,
        /\bapi\b/i,
        /\benvironment\b/i,
        /\bmenu\b/i,
        /\bmodule\b/i,
        /\bapplication\b/i,
        /\btrail\b/i,
        /\bsso\b/i
      ],
      priority: 6,
      description: 'System configuration, logging, and administrative functions'
    },
    
    content_management: {
      name: 'Content Management',
      patterns: [
        /\bdocument\b/i,
        /\bresource\b/i,
        /\bcategory\b/i,
        /\btype\b/i,
        /\bstatus\b/i,
        /\btemplate\b/i,
        /\blanguage\b/i,
        /\bconsent\b/i,
        /\bredirect\b/i,
        /\burl\b/i
      ],
      priority: 7,
      description: 'Content, documents, and resource management'
    },
    
    unknown: {
      name: 'Unknown Domain',
      patterns: [],
      priority: 999,
      description: 'Tables that do not match any recognized business domain'
    }
  };
  
  /**
   * Classify a group of tables into a business domain
   */
  public classifyDomain(tables: TableData[]): BusinessDomainClassification {
    console.log(`🏢 Classifying domain for ${tables.length} tables: [${tables.map(t => t.name).join(', ')}]`);
    
    const scores = new Map<BusinessDomainType, number>();
    const matchedPatterns = new Map<BusinessDomainType, string[]>();
    
    // Initialize scores
    Object.keys(this.domainPatterns).forEach(domain => {
      scores.set(domain as BusinessDomainType, 0);
      matchedPatterns.set(domain as BusinessDomainType, []);
    });
    
    // Score each table against all domain patterns
    tables.forEach(table => {
      const tableName = table.name;
      
      Object.entries(this.domainPatterns).forEach(([domainType, pattern]) => {
        const domain = domainType as BusinessDomainType;
        const matches = this.matchTableAgainstPattern(tableName, pattern);
        
        if (matches.length > 0) {
          const currentScore = scores.get(domain) || 0;
          const currentPatterns = matchedPatterns.get(domain) || [];
          
          scores.set(domain, currentScore + matches.length);
          matchedPatterns.set(domain, [...currentPatterns, ...matches]);
        }
      });
    });
    
    // Find the best match
    let bestDomain: BusinessDomainType = 'unknown';
    let bestScore = 0;
    let bestPatterns: string[] = [];
    
    scores.forEach((score, domain) => {
      if (domain !== 'unknown' && score > bestScore) {
        bestScore = score;
        bestDomain = domain;
        bestPatterns = matchedPatterns.get(domain) || [];
      }
    });
    
    // Calculate confidence based on coverage and strength
    const confidence = this.calculateConfidence(tables, bestScore, bestPatterns);
    const suggestedName = this.generateDomainName(bestDomain, bestPatterns, tables);
    
    console.log(`   ✅ Classification: ${bestDomain} (confidence: ${confidence.toFixed(2)}, patterns: ${bestPatterns.length})`);
    
    return {
      domainType: bestDomain,
      confidence,
      matchingPatterns: bestPatterns,
      suggestedName,
      description: this.domainPatterns[bestDomain].description
    };
  }
  
  /**
   * Match table name against domain pattern
   */
  private matchTableAgainstPattern(tableName: string, pattern: DomainPattern): string[] {
    const matches: string[] = [];
    
    pattern.patterns.forEach(regex => {
      if (regex.test(tableName)) {
        matches.push(regex.source);
      }
    });
    
    return matches;
  }
  
  /**
   * Calculate confidence score for domain classification
   */
  private calculateConfidence(
    tables: TableData[], 
    matchScore: number, 
    matchedPatterns: string[]
  ): number {
    if (matchScore === 0) return 0;
    
    // Base confidence from pattern matches
    const patternCoverage = matchedPatterns.length / tables.length;
    const baseConfidence = Math.min(patternCoverage * 0.8, 0.8);
    
    // Bonus for strong pattern matches
    const patternStrengthBonus = Math.min(matchScore / tables.length * 0.2, 0.2);
    
    return Math.min(baseConfidence + patternStrengthBonus, 1.0);
  }
  
  /**
   * Generate a meaningful domain name
   */
  private generateDomainName(
    domainType: BusinessDomainType, 
    patterns: string[], 
    tables: TableData[]
  ): string {
    // Use predefined name if confidence is high
    if (patterns.length >= 2) {
      return this.domainPatterns[domainType].name;
    }
    
    // Generate custom name based on table analysis
    const concepts = this.extractBusinessConcepts(tables);
    if (concepts.length > 0) {
      if (concepts.length === 1) {
        return `${concepts[0]} Management`;
      } else if (concepts.length === 2) {
        return `${concepts[0]} & ${concepts[1]}`;
      } else {
        return `${concepts[0]}, ${concepts[1]} & ${concepts[2]}`;
      }
    }
    
    // Fallback to domain type name
    return this.domainPatterns[domainType].name;
  }
  
  /**
   * Extract business concepts from table names
   */
  private extractBusinessConcepts(tables: TableData[]): string[] {
    const conceptMap = new Map<string, number>();
    
    tables.forEach(table => {
      const tableName = table.name.toLowerCase();
      
      // Extract meaningful words (skip common suffixes/prefixes)
      const words = tableName
        .split(/[_\s]+/)
        .filter(word => word.length > 2)
        .filter(word => !['log', 'type', 'status', 'history', 'audit'].includes(word))
        .map(word => this.capitalizeFirst(word));
      
      words.forEach(word => {
        conceptMap.set(word, (conceptMap.get(word) || 0) + 1);
      });
    });
    
    // Return top 3 concepts by frequency
    return Array.from(conceptMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([concept]) => concept)
      .slice(0, 3);
  }
  
  /**
   * Check if domain should remain separate (avoid merging cross-domain references)
   */
  public shouldKeepDomainsSeparate(
    domain1Classification: BusinessDomainClassification,
    domain2Classification: BusinessDomainClassification
  ): boolean {
    // Always keep user management separate
    if (domain1Classification.domainType === 'user_management' || 
        domain2Classification.domainType === 'user_management') {
      return true;
    }
    
    // Keep high-confidence domains separate
    if (domain1Classification.confidence > 0.7 && domain2Classification.confidence > 0.7) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get minimum domain size for a domain type
   */
  public getMinimumDomainSize(domainType: BusinessDomainType): number {
    const minimumSizes: Record<BusinessDomainType, number> = {
      'user_management': 3,
      'payments_donations': 5,
      'opportunities': 3,
      'campaigns_marketing': 4,
      'organization_management': 3,
      'system_configuration': 2,
      'content_management': 2,
      'unknown': 1
    };
    
    return minimumSizes[domainType];
  }
  
  /**
   * Utility function to capitalize first letter
   */
  private capitalizeFirst(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
}

// Export singleton instance
export const businessRuleEngine = new BusinessRuleEngine();