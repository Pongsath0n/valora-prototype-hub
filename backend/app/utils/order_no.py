from datetime import datetime
import secrets


def generate_order_no(prefix: str = 'VO') -> str:
    dt = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    suffix = secrets.token_hex(2).upper()
    return f'{prefix}-{dt}-{suffix}'
