import struct
from typing import TypedDict
from math import sqrt
import logging

type Point2D = tuple[int, int]
SectionJson = TypedDict('SectionJson', {'topLeft': Point2D, 'botRight': Point2D, 'id': int})

class Section:
    s = struct.Struct('iiiiI')
    top_left:  Point2D
    bot_right: Point2D
    id: int
    def __init__(self, top_left: Point2D, bot_right: Point2D, id: int):
        self.top_left = top_left
        self.bot_right = bot_right
        self.id = id
    
    def to_bytes(self):
        return self.s.pack(self.top_left[0], self.top_left[1], self.bot_right[0], self.bot_right[1], self.id)
    
    @classmethod
    def from_bytes(cls, sec_bytes):
        vals = cls.s.unpack(sec_bytes)
        return cls((vals[0], vals[1]), (vals[2], vals[3]), vals[4])
    
    def to_json(self) -> SectionJson :
        return {'topLeft': self.top_left, 'botRight': self.bot_right, 'id': self.id}

    def __repr__(self):
        return f'Section(tl={self.top_left},br={self.bot_right},id={self.id})'


# TODO: Actually think about how to approach the ids - in case of an expansion, the current approach would rename some sections
def split_bits(section_w: int, section_h: int, start_top_left: Point2D, rows: int, cols: int) -> list[Section]:
    sections: list[Section] = []
    for row in range(rows):
        for col in range(cols):
            top_left = (col * section_w + start_top_left[0], row * section_h + start_top_left[1])
            bot_right = (col + 1) * section_w + start_top_left[0], (row + 1) * section_h + start_top_left[1]
            sections.append(Section(top_left, bot_right, row * cols + col))

    return sections
