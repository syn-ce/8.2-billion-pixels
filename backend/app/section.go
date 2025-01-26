package main

import (
	"encoding/json"
	"iter"
	"strconv"
)

type Point struct {
	X, Y int
}

func (p *Point) MarshalJSON() ([]byte, error) {
	return json.Marshal(&[]int{p.X, p.Y})
}

func NewPoint(x, y int) *Point {
	return &Point{x, y}
}

type SectionMetaData struct {
	TopLeft  Point  `json:"topLeft"`
	BotRight Point  `json:"botRight"`
	Id       string `json:"id"`
}

type Section struct {
	meta SectionMetaData
	data *string
}

func (s *Section) Width() int {
	return (s.meta.BotRight.X - s.meta.TopLeft.X)
}

func (s *Section) Height() int {
	return (s.meta.BotRight.Y - s.meta.TopLeft.Y)
}

func NewSection(meta *SectionMetaData, data *string) *Section {
	return &Section{*meta, data}
}

// TODO: Properly think about how to approach the ids - in case of an expansion, the current approach would rename some sections
func SplitIntoSections(startTopLeft Point, sectionW, sectionH, rows, cols int) []*Section {
	sections := make([]*Section, rows*cols)
	for row := range rows {
		for col := range cols {
			topLeft := NewPoint(col*sectionW+startTopLeft.X, row*sectionH+startTopLeft.Y)
			botRight := NewPoint((col+1)*sectionW+startTopLeft.X, (row+1)*sectionH+startTopLeft.Y)
			id := row*cols + col
			sections[id] = NewSection(&SectionMetaData{*topLeft, *botRight, strconv.Itoa(id)}, nil)
		}
	}
	return sections
}

// Define iterator which iterates over section data in batches of size `bitsPerPixel`
// (will still return ints (-> limits to 32 bits), but the extra bits will be ignored by redis)
func IterateSectionData(data []byte, nrBits int, bitsPerPixel int) iter.Seq[int] {
	return func(yield func(int) bool) {
		// The last byte will get padded with zeros if necessary; This makes sure we only go as far as we want to
		byteIdx := 0
		bitIdx := 0
		val := 0
		for i := 0; i < nrBits; i++ {
			val = val*2 + int(((data[byteIdx] >> (7 - bitIdx)) & 1))
			bitIdx++
			if (i+1)%8 == 0 {
				byteIdx++
				bitIdx = 0
			}

			if (i+1)%int(bitsPerPixel) == 0 {
				if !yield(val) { // This should never be reached
					return
				}
				val = 0
			}
		}
	}
}
