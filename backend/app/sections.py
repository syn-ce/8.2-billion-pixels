from typing import TypedDict
from math import sqrt

type Point2D = tuple[int, int]
Section = TypedDict('Section', {'topLeft': Point2D, 'botRight': Point2D, 'id': int})

# TODO: Actually think about how to approach the ids - in case of an expansion, the current approach would rename some sections
def split_bits(n: int, rel_width: int, rel_height: int, rows: int, cols: int) -> list[Section]:
    width = int(sqrt(n / (rel_width * rel_height)) * rel_width)
    height = int(n / width)
    
    if width * height != n or width % cols != 0 or height % rows != 0: # Verify that dimensions check out
        raise ValueError()
    
    section_w = width / cols
    section_h = height / rows

    sections: list[Section] = []
    for row in range(rows):
        for col in range(cols):
            topLeft = (col * section_w, row * section_h)
            botRight = (col + 1) * section_w, (row + 1) * section_h
            sections.append({'topLeft': topLeft, 'botRight': botRight, 'id': row * cols + col})
    
    return sections