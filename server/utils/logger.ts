/**
 * Simple Logger utility for consistent logging across services
 */
export class Logger {
  constructor(private context: string) {}
  
  info(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] [${this.context}] ${message}`, data);
    } else {
      console.log(`[${timestamp}] [${this.context}] ${message}`);
    }
  }
  
  error(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    if (error) {
      console.error(`[${timestamp}] [${this.context}] ERROR: ${message}`, error);
    } else {
      console.error(`[${timestamp}] [${this.context}] ERROR: ${message}`);
    }
  }
  
  warn(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    if (data) {
      console.warn(`[${timestamp}] [${this.context}] WARNING: ${message}`, data);
    } else {
      console.warn(`[${timestamp}] [${this.context}] WARNING: ${message}`);
    }
  }
  
  debug(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    if (data) {
      console.debug(`[${timestamp}] [${this.context}] DEBUG: ${message}`, data);
    } else {
      console.debug(`[${timestamp}] [${this.context}] DEBUG: ${message}`);
    }
  }
}