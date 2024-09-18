from collections.abc import Iterable
import heapq


class Color:
    r: int
    g: int
    b: int

    def __init__(self, r: int, g: int, b: int):
        self.r = r
        self.g = g
        self.b = b
    
    @classmethod
    def from_rgb(cls, rgb: tuple[int, int, int]):
        return cls(rgb[0], rgb[1], rgb[2])
    
    def rgb(self):
        return tuple([self.r, self.g, self.b])
    
    def __hash__(self):
        return hash(tuple([self.r, self.g, self.b]))
    
    def __eq__(self, other):
        if type(other) is type(self):
            return self.r == other.r and self.g == other.g and self.b == other.b
        return False
    
    def __repr__(self):
        return f'Color({self.r},{self.g},{self.b})'


class ColorProvider:
    _bits_per_color: int
    _id_to_color: dict[int, Color]
    _color_to_id: dict[Color, int]
    _id_heap: list[int] # TODO: the current implementation does not allow the heap to shrink, even when all colors except (for instance) the first two have been removed
    def __init__(self, bits_per_color: int, colors: Iterable[Color]):
        self._bits_per_color = bits_per_color # TODO: this should probably come from somewhere else
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
        if color in self._color_to_id:
            return
        id = len(self._id_to_color) # Assume continuous indexing
        if len(self._id_heap) != 0: # There's an earlier unused index
            id = heapq.heappop(self._id_heap)
        self._id_to_color[id] = color
        self._color_to_id[color] = id
    
    def get_id_colors(self):
        return self._id_to_color