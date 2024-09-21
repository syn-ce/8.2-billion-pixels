from collections.abc import Iterable
import heapq
import logging
import struct

class Color:
    value24bit: int
    r: int
    g: int
    b: int

    def __init__(self, r: int, g: int, b: int):
        self.r = r
        self.g = g
        self.b = b
        self.value24bit = self.r
        self.value24bit = (self.value24bit << 8) + self.g
        self.value24bit = (self.value24bit << 8) + self.b
    
    @classmethod
    def from_rgb(cls, rgb: tuple[int, int, int]):
        return cls(rgb[0], rgb[1], rgb[2])
    
    @classmethod
    def from_24bit(cls, val: int):
        r = (val >> 16) & 0xFF
        g = (val >> 8) & 0xFF
        b = val & 0xFF
        return cls(r, g, b)
    
    def rgb(self):
        return tuple([self.r, self.g, self.b])

    def __hash__(self):
        return hash(self.value24bit)
    
    def __eq__(self, other):
        if type(other) is type(self):
            return self.r == other.r and self.g == other.g and self.b == other.b
        return False
    
    def __repr__(self):
        return f'Color({self.r},{self.g},{self.b})'


class ColorProvider:
    _color_s = struct.Struct('II')
    _id_to_color: dict[int, Color]
    _color_to_id: dict[Color, int]
    _id_heap: list[int] # TODO: the current implementation does not allow the heap to shrink, even when all colors except (for instance) the first two have been removed
    _capacity: int
    def __init__(self, bits_per_color: int, colors: Iterable[Color]):
        self._capacity = 2 ** bits_per_color # TODO: this should probably come from somewhere else
        self._id_to_color = {}
        self._color_to_id = {}
        self._id_heap = []
        for color in colors:
            self.add_color(color)
    
    def remove_color(self, color: Color):
        id = self._color_to_id.pop(color, None)
        if id is None:
            return
        self._id_to_color.pop(id)
        heapq.heappush(self._id_heap, id) # Re-add id to heap

    def add_color(self, color: Color):
        if len(self._color_to_id) == self._capacity:
            raise Exception(f"Cannot add color to ColorProvider with capacity {self._capacity} because its capacity has already been reached.")
        if color in self._color_to_id:
            return
        id = len(self._id_to_color) # Assume continuous indexing
        if len(self._id_heap) != 0: # There's an earlier unused index
            id = heapq.heappop(self._id_heap)
        self.add_color_with_id(color, id)
    
    def add_color_with_id(self, color: Color, id: int):
        self._id_to_color[id] = color
        self._color_to_id[color] = id

    def get_id_colors(self):
        return self._id_to_color
    
    def size(self):
        return len(self._color_to_id)
    
    def colors_to_bytes(self):
        return [self._color_to_bytes(color, id) for id, color in self._id_to_color.items()]
    
    def _color_to_bytes(self, color: Color, id: int):
        return self._color_s.pack(color.value24bit, id)
    
    def _color_from_bytes(self, color_bytes):
        [value_24bit, id] = self._color_s.unpack(color_bytes)
        return Color.from_24bit(value_24bit), id
    
    def add_colors_from_bytes(self, colors_bytes: Iterable[bytes]):
        for color_bytes in colors_bytes:
            color, id = self._color_from_bytes(color_bytes)
            self.add_color_with_id(color, id)
