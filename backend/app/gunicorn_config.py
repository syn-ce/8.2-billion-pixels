from collections.abc import Iterable
import os
import struct

from redis import Redis
from gunicorn.arbiter import Arbiter
import logging

from RedisKeys import RedisKeys
from colors import Color, ColorProvider
from sections import Point2D, Section, split_bits

workers = int(os.environ.get('GUNICORN_PROCESSES', '1'))

threads = int(os.environ.get('GUNICORN_THREADS', '4'))

# timeout = int(os.environ.get('GUNICORN_TIMEOUT', '120'))

bind = os.environ.get('GUNICORN_BIND', '0.0.0.0:5000')

forwarded_allow_ips = '*'

secure_scheme_headers = {'X-Forwarded-Proto': 'https'}


# Set up logging before gunicorn server starts
def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.StreamHandler()
        ]
    )


def set_sections_config_values(redis: Redis, section_width: int, section_height: int, nr_rows: int, nr_cols: int, bits_per_color: int, color_provider: ColorProvider):
    redis.set(RedisKeys.TOTAL_NR_PIXELS, section_width * section_height * nr_rows * nr_cols)
    redis.set(RedisKeys.BITS_PER_COLOR, bits_per_color)
    redis.set(RedisKeys.NR_SEC_COLS, nr_cols)
    redis.set(RedisKeys.NR_SEC_ROWS, nr_rows)
    redis.set(RedisKeys.SEC_WIDTH, section_width)
    redis.set(RedisKeys.SEC_HEIGHT, section_height)
    redis.sadd(RedisKeys.COLOR_SET, *color_provider.colors_to_bytes())


def add_section(redis: Redis, sections: list[Section], bits_per_color: int, top_left: Point2D, bot_right: Point2D):
    section = Section(top_left, bot_right, len(sections)) #{'topLeft': top_left, 'botRight': bot_right, 'id': len(sections)}
    width = bot_right[0] - top_left[0]
    height = bot_right[1] - top_left[1]
    sections.append(section)
    redis.set(RedisKeys.sec_info(section.id), section.to_bytes())
    redis.setbit(RedisKeys.sec_pixel_data(id), width * height * bits_per_color - 1, 0)
    return sections


def init_from_clear_db(redis: Redis, sec_width: int, sec_height: int, start_top_left: int, nr_cols: int, nr_rows: int, bits_per_color: int, color_provider: ColorProvider):
    sections = split_bits(sec_width, sec_height, start_top_left, nr_cols, nr_rows)
    logging.info('Flushing db and initializing from scratch.')
    redis.flushdb()
    set_sections_config_values(redis, sec_width, sec_height, nr_rows, nr_cols, bits_per_color, color_provider)
    # TODO: use pipelining or scripting
    for section in sections:
        id = section.id
        redis.sadd(RedisKeys.SEC_IDS, id)
        redis.set(RedisKeys.sec_info(id), section.to_bytes())
        nr_bits = sec_width * sec_height * bits_per_color
        redis.setbit(RedisKeys.sec_pixel_data(id), nr_bits - 1, 0)


# TODO: this is not safe to use with multiple instances of the flask docker container
def on_starting(server: Arbiter):
    setup_logging()

    # A billion bits (well, not during development).
    BITS_PER_COLOR = 2
    NR_COLS = 5
    NR_ROWS = 5
    SEC_WIDTH = 1000
    SEC_HEIGHT = 1000
    START_TOP_LEFT = (0, 0)
    COLORS = [Color(255, 255, 255), Color(0, 0, 0), Color(52, 235, 168), Color(161, 52, 235)]
    color_provider = ColorProvider(BITS_PER_COLOR, COLORS)

    redis = Redis(host='redis', port=6379)
    nr_keys = redis.dbsize()
    logging.info('Currently %d keys in the database.', nr_keys)

    if nr_keys == 0:
        logging.info('Initiating db with specified values from scratch.')
        init_from_clear_db(redis, SEC_WIDTH, SEC_HEIGHT, START_TOP_LEFT, NR_COLS, NR_ROWS, BITS_PER_COLOR, color_provider)
    else:  # Assume that all values are set, but they might differ from the specified ones
        logging.info('DB already populated. Not initializing from scratch.')
        cur_bits_per_color = int(redis.get(RedisKeys.BITS_PER_COLOR))
        cur_nr_cols = int(redis.get(RedisKeys.NR_SEC_COLS))
        cur_nr_rows = int(redis.get(RedisKeys.NR_SEC_ROWS))
        cur_sec_width = int(redis.get(RedisKeys.SEC_WIDTH))
        cur_sec_height = int(redis.get(RedisKeys.SEC_HEIGHT))
        if cur_bits_per_color == BITS_PER_COLOR and cur_nr_cols == NR_COLS and cur_nr_rows == NR_ROWS and cur_sec_width == SEC_WIDTH and cur_sec_height == SEC_HEIGHT:
            logging.warning('Modifying existing db on load is not supported (yet).')
        else:
            logging.info('Specified values match current config. No need to change anything.')
    redis.close()