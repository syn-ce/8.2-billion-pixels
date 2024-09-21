from collections.abc import Iterable
import os
import struct

from redis import Redis
from gunicorn.arbiter import Arbiter
import logging

from colors import Color
from sections import Point2D, Section, split_bits

workers = int(os.environ.get('GUNICORN_PROCESSES', '4'))

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

def intersects(section1: Section, section2: Section):
    top_left1 = section1['topLeft']
    bot_right1 = section1['botRight']
    top_left2 = section2['topLeft']
    bot_right2 = section2['botRight']

    return top_left1[0] < bot_right2[0] and top_left2[0] < bot_right1[0] and top_left1[1] < bot_right2[1] and top_left2[1] < bot_right1[1]

def determine_intersections(section1: Section):
    pass

# Put into one big array

def set_sections_config_values(redis: Redis, section_width: int, section_height: int, nr_rows: int, nr_cols: int, bits_per_color: int, colors: Iterable[Color]):
    redis.set('sections_total_nr_pixels', section_width * section_height * nr_rows * nr_cols)
    redis.set('sections_bits_per_color', bits_per_color)
    redis.set('sections_nr_cols', nr_cols)
    redis.set('sections_nr_rows', nr_rows)
    redis.set('sections_sec_width', section_width)
    redis.set('sections_sec_height', section_height)
    redis.sadd('color_set', *[color.value24bit for color in colors])

def add_section(redis: Redis, sections: list[Section], bits_per_color: int, top_left: Point2D, bot_right: Point2D):
    section = Section(top_left, bot_right, len(sections)) #{'topLeft': top_left, 'botRight': bot_right, 'id': len(sections)}
    width = bot_right[0] - top_left[0]
    height = bot_right[1] - top_left[1]
    sections.append(section)
    redis.set(f'sec_{section.id}', section.to_bytes())
    redis.setbit(sections[-1].id, width * height * bits_per_color - 1, 0)
    return sections

def init_from_clear_db(redis: Redis, sec_width: int, sec_height: int, start_top_left: int, nr_cols: int, nr_rows: int, bits_per_color: int, colors: Iterable[Color]):
    sections = split_bits(sec_width, sec_height, start_top_left, nr_cols, nr_rows)
    logging.info('Flushing db and initializing from scratch.')
    redis.flushdb()
    set_sections_config_values(redis, sec_width, sec_height, nr_rows, nr_cols, bits_per_color, colors)
    # TODO: use pipelining or scripting
    for section in sections:
        id = section.id
        redis.sadd('sec_ids', id)
        redis.set(f'sec_{id}', section.to_bytes())
        nr_bits = sec_width * sec_height * bits_per_color
        redis.setbit(id, nr_bits - 1, 0)
    return
    

    #if init_new or old_section_width != section_width or old_section_height != section_height:  # Delete everything and start fresh

def setup_redis(redis: Redis, init_new: bool, old_bits_per_color: int, bits_per_color: int, nr_cols: int,
                nr_rows: int, section_width: int, section_height: int, old_section_width: int, old_section_height: int,
                start_top_left: Point2D, colors: list[Color]):
    if old_bits_per_color != bits_per_color:
        logging.info(f'Nr of bits per color mismatch: old={old_bits_per_color}, new={bits_per_color}. Updating.')
        raise NotImplementedError('Up-/Downgrading the number of bits per color is yet to be implemented.')
    


    logging.info('Doing nothing')
    # This will assume that all sections are non-overlapping
    #set_sections_config_values(redis, section_width, section_height, nr_rows, nr_cols, bits_per_color)



def on_starting(server: Arbiter):
    setup_logging()

    # A billion bits (well, not during development).
    BITS_PER_COLOR = 2
    NR_COLS = 10
    NR_ROWS = 10
    SEC_WIDTH = 1000
    SEC_HEIGHT = 1000
    START_TOP_LEFT = (0, 0)
    COLORS = [Color(255, 255, 255), Color(0, 0, 0), Color(52, 235, 168), Color(161, 52, 235)]

    redis = Redis(host='redis', port=6379)
    cur_total_nr_bits = redis.get('sections_total_nr_pixels')
    cur_total_nr_bits = None
    if cur_total_nr_bits is None:
        init_from_clear_db(redis, SEC_WIDTH, SEC_HEIGHT, START_TOP_LEFT, NR_COLS, NR_ROWS, BITS_PER_COLOR, COLORS)
    else:  # Assume that all values are set, but they might differ from the specified ones
        cur_total_nr_bits = int(cur_total_nr_bits)
        cur_bits_per_color = int(redis.get('sections_bits_per_color'))
        cur_nr_cols = int(redis.get('sections_nr_cols'))
        cur_nr_rows = int(redis.get('sections_nr_rows'))
        cur_sec_width = int(redis.get('sections_sec_width'))
        cur_sec_height = int(redis.get('sections_sec_height'))
        if cur_bits_per_color != BITS_PER_COLOR or cur_nr_cols != NR_COLS or cur_nr_rows != NR_ROWS:
            setup_redis(redis, True, cur_bits_per_color, BITS_PER_COLOR, NR_COLS, NR_ROWS, 
                        SEC_WIDTH, SEC_HEIGHT, cur_sec_width, cur_sec_height, START_TOP_LEFT, COLORS)

    # color_provider = ColorProvider(bits_per_color, [Color(255, 255, 255), Color(0, 0, 0), Color(52, 235, 168), Color(161, 52, 235)])
    # colors = [{'id': id, 'rgb': color.rgb()} for id, color in color_provider.get_id_colors().items()]
    # app.logger.info(colors)

    # sections: list[Section] = split_bits(NR_BITS, ASP_RATIO_REL_W, ASP_RATIO_REL_H, 40, 25)
    # print(len(sections))
    # print(sections[0])
    ## Store the sections as bits in redis
    ## TODO: use pipelining or scripting
    # for section in sections:
    #    width = int(section['botRight'][0] -  section['topLeft'][0])
    #    height = int(section['botRight'][1] - section['topLeft'][1])
    #    nr_bits = width * height * bits_per_color
    #    #remainder = total % 8
    #    # TODO: reconsider remainder
    #    #redis.set(section['id'], '') # Clear (for development)
    #    redis.setbit(section['id'], nr_bits - 1, 0)
