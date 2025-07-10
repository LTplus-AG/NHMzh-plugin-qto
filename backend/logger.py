import logging
import os

class QTOLogger:
    def __init__(self, name='QTO-Backend', level=None):
        self.logger = logging.getLogger(name)
        
        # Set log level from environment or default to INFO
        log_level = level or os.getenv('LOG_LEVEL', 'INFO').upper()
        self.logger.setLevel(getattr(logging, log_level, logging.INFO))
        
        # Create console handler if not already exists
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setLevel(self.logger.level)
            
            # Create formatter
            formatter = logging.Formatter(
                '%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
                datefmt='%Y-%m-%dT%H:%M:%S'
            )
            handler.setFormatter(formatter)
            
            self.logger.addHandler(handler)
    
    def debug(self, message, *args, **kwargs):
        self.logger.debug(message, *args, **kwargs)
    
    def info(self, message, *args, **kwargs):
        self.logger.info(message, *args, **kwargs)
    
    def warn(self, message, *args, **kwargs):
        self.logger.warning(message, *args, **kwargs)
    
    def error(self, message, *args, **kwargs):
        self.logger.error(message, *args, **kwargs)

# Create singleton instance
logger = QTOLogger()

# Export for convenience
debug = logger.debug
info = logger.info
warn = logger.warn
error = logger.error 