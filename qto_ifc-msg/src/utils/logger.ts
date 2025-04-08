import winston from "winston";

// Define log levels (matching OpenTelemetry severity levels)
const levels = {
	error: 0,
	warn: 1,
	info: 2,
	http: 3,
	debug: 4,
};

// Create the logger instance
const logger = winston.createLogger({
	level: process.env.NODE_ENV === "development" ? "debug" : "info",
	levels,
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json() // Use JSON format for better OpenTelemetry compatibility
	),
	transports: [
		new winston.transports.Console({
			format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
		}),
		new winston.transports.File({
			filename: "logs/error.log",
			level: "error",
		}),
		new winston.transports.File({
			filename: "logs/combined.log",
		}),
	],
});

// Create a wrapper class that will make it easier to add OpenTelemetry later
class Logger {
	private static instance: Logger;
	private winstonLogger: winston.Logger;

	private constructor() {
		this.winstonLogger = logger;
	}

	public static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	// Add context support for future OpenTelemetry integration
	private formatMessage(message: string, context?: Record<string, any>): any {
		return {
			message,
			...context,
		};
	}

	public error(message: string, context?: Record<string, any>): void {
		this.winstonLogger.error(this.formatMessage(message, context));
	}

	public warn(message: string, context?: Record<string, any>): void {
		this.winstonLogger.warn(this.formatMessage(message, context));
	}

	public info(message: string, context?: Record<string, any>): void {
		this.winstonLogger.info(this.formatMessage(message, context));
	}

	public http(message: string, context?: Record<string, any>): void {
		this.winstonLogger.http(this.formatMessage(message, context));
	}

	public debug(message: string, context?: Record<string, any>): void {
		this.winstonLogger.debug(this.formatMessage(message, context));
	}
}

// Export a singleton instance
export const log = Logger.getInstance();
