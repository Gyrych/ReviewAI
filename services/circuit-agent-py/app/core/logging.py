import logging
from logging import Logger

class SensitiveFilter(logging.Filter):
    def filter(self, record):
        try:
            if hasattr(record, 'args') and isinstance(record.args, dict) and 'headers' in record.args:
                hdrs = record.args.get('headers')
                if isinstance(hdrs, dict) and 'Authorization' in hdrs:
                    hdrs = dict(h for h in hdrs.items() if h[0] != 'Authorization')
                    record.args['headers'] = hdrs
        except Exception:
            pass
        return True

def get_logger(name: str) -> Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s %(levelname)s [%(name)s] %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.addFilter(SensitiveFilter())
    return logger
