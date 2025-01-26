package main

import (
	"encoding/json"
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

func (s *Section) width() int {
	return (s.meta.BotRight.X - s.meta.TopLeft.X)
}

func (s *Section) height() int {
	return (s.meta.BotRight.Y - s.meta.TopLeft.Y)
}

func NewSection(meta *SectionMetaData, data *string) *Section {
	return &Section{*meta, data}
}

// TODO: Properly think about how to approach the ids - in case of an expansion, the current approach would rename some sections
func splitIntoSections(startTopLeft Point, sectionW, sectionH, rows, cols int) []*Section {
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
