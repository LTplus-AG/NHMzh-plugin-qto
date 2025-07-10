type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  enableTimestamp?: boolean;
}

class Logger {
  private level: LogLevel;
  private prefix: string;
  private enableTimestamp: boolean;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(config: LoggerConfig = { level: 'info' }) {
    this.level = config.level;
    this.prefix = config.prefix || '[QTO]';
    this.enableTimestamp = config.enableTimestamp ?? true;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = this.enableTimestamp ? new Date().toISOString() : '';
    const parts = [
      timestamp,
      this.prefix,
      `[${level.toUpperCase()}]`,
      message
    ].filter(Boolean);
    
    return parts.join(' ');
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message), data ?? '');
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message), data ?? '');
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), data ?? '');
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), error ?? '');
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Create singleton instance
const logger = new Logger({
  level: import.meta.env.VITE_LOG_LEVEL as LogLevel || 'info',
  prefix: '[QTO]'
});

export default logger;
export { Logger };
export type { LogLevel, LoggerConfig }; 