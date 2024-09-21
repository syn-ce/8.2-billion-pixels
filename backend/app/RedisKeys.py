class RedisKeys:
    TOTAL_NR_PIXELS = 'total_nr_pixels'
    BITS_PER_COLOR = 'bits_per_color'
    NR_SEC_COLS = 'sections_nr_cols'
    NR_SEC_ROWS = 'sections_nr_rows'
    SEC_WIDTH = 'section_width'
    SEC_HEIGHT = 'sections_height'
    COLOR_SET = 'color_set'
    SEC_IDS = 'sec_ids'

    @staticmethod
    def sec_info(id):
        return f'sec_{id}'
    
    @staticmethod
    def sec_pixel_data(id):
        return id