import { log } from "./logger";

export function getEnv(key: string): string {
	const value = process.env[key];
	if (!value) {
		log.error(`Environment variable ${key} is not set`);
		process.exit(1);
	} else {
		log.debug(`Environment variable ${key} loaded successfully`);
	}
	return value;
}
