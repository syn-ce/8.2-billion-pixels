package main

import (
	"container/heap"
	"encoding/json"
	"errors"
	"fmt"
	"image/color"
	"log"
	"math"
)

type Color struct {
	R, G, B byte
}

func NewColor(r, g, b byte) *Color {
	return &Color{r, g, b}
}

func FromColor(c color.Color) *Color {
	r, g, b, _ := c.RGBA()
	return NewColor(byte(r), byte(g), byte(b))
}

// https://stackoverflow.com/questions/54197913/parse-hex-string-to-image-color
var errInvalidFormat = errors.New("invalid format")

func ParseHexColorFast(s string) (c Color, err error) {
	if s[0] != '#' {
		return c, errInvalidFormat
	}

	hexToByte := func(b byte) byte {
		switch {
		case b >= '0' && b <= '9':
			return b - '0'
		case b >= 'a' && b <= 'f':
			return b - 'a' + 10
		case b >= 'A' && b <= 'F':
			return b - 'A' + 10
		}
		err = errInvalidFormat
		return 0
	}

	switch len(s) {
	case 7:
		c.R = hexToByte(s[1])<<4 + hexToByte(s[2])
		c.G = hexToByte(s[3])<<4 + hexToByte(s[4])
		c.B = hexToByte(s[5])<<4 + hexToByte(s[6])
	case 4:
		c.R = hexToByte(s[1]) * 17
		c.G = hexToByte(s[2]) * 17
		c.B = hexToByte(s[3]) * 17
	default:
		err = errInvalidFormat
	}
	return c, err
}

func (c *Color) MarshalJSON() ([]byte, error) {
	return json.Marshal(&[]byte{c.R, c.G, c.B})
}

func TryParseRGB(data []byte, color *Color) error {
	var rgb []int
	if err := json.Unmarshal(data, &rgb); err != nil {
		log.Println("error while trying to unmarshal json color as rgb list")
		return err
	}
	if len(rgb) != 3 {
		return fmt.Errorf("cannot unmarshal color from json: array needs 3 integer values but has %d", len(rgb))
	}
	*color = *NewColor(byte(rgb[0]), byte(rgb[1]), byte(rgb[2]))
	return nil
}

func TryParseHex(data []byte, color *Color) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		log.Println("error while trying to unmarshal json color as string")
		return err
	}

	c, err := ParseHexColorFast(s)
	if err != nil {
		return fmt.Errorf("json color cannot be parsed as hex")
	}

	*color = c

	return nil
}

func (c *Color) UnmarshalJSON(data []byte) error {
	if err := TryParseRGB(data, c); err != nil {
		log.Println("could not parse json color as rgb list")
		if err := TryParseHex(data, c); err != nil {
			return fmt.Errorf("could not parse json color")
		}
	}

	return nil
}

type ColorProvider struct {
	bitsPerColor int
	colors       map[int]*Color
	idHeap       IntHeap
}

func NewColorProvider(bitsPerColor int, colors ...*Color) *ColorProvider {
	cp := &ColorProvider{
		bitsPerColor,
		make(map[int]*Color),
		make(IntHeap, 0),
	}

	for _, color := range colors {
		cp.addColor(color)
	}

	return cp
}

func (cp *ColorProvider) addColor(c *Color) error {
	if len(cp.colors) == 1<<cp.bitsPerColor {
		return fmt.Errorf("can't add more than %d colors to colorprovider with %d bits per color", 1<<cp.bitsPerColor, cp.bitsPerColor)
	}

	id := len(cp.colors)
	if len(cp.idHeap) > 0 { // earlier unused index
		id = heap.Pop(&cp.idHeap).(int)
	}

	cp.colors[id] = c
	log.Printf("%d: %v\n", id, c)

	return nil
}

func (cp *ColorProvider) ClosestAvailableColor(c *Color) (int, error) {
	if len(cp.colors) == 0 {
		return -1, fmt.Errorf("colorprovider can't determine color closest to %+v because colorprovider doesn't have any colors", *c)
	}
	minDistance := math.MaxInt
	var minColorId int
	for id, color := range cp.colors {
		distance := IntPow(int(c.R)-int(color.R), 2) + IntPow(int(c.G)-int(color.G), 2) + IntPow(int(c.B)-int(color.B), 2)
		if distance < minDistance {
			minDistance = distance
			minColorId = id
		}
	}

	return minColorId, nil
}

// https://pkg.go.dev/container/heap
// An IntHeap is a min-heap of ints.
type IntHeap []int

func (h IntHeap) Len() int           { return len(h) }
func (h IntHeap) Less(i, j int) bool { return h[i] < h[j] }
func (h IntHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }

func (h *IntHeap) Push(x any) {
	*h = append(*h, x.(int))
}

func (h *IntHeap) Pop() any {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[0 : n-1]
	return x
}
