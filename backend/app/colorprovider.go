package main

import (
	"container/heap"
	"fmt"
	"log"
)

type Color struct {
	R, G, B byte
}

func NewColor(r, g, b byte) *Color {
	return &Color{r, g, b}
}

type ColorProvider struct {
	bitsPerColor int
	colors map[int]*Color
	idHeap IntHeap
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
	if len(cp.colors) == 1 << cp.bitsPerColor {
		return fmt.Errorf("can't add more than %d colors to colorprovider with %d bits per color", 1 << cp.bitsPerColor, cp.bitsPerColor)
	}

	id := len(cp.colors)
	if len(cp.idHeap) > 0 { // earlier unused index
		id = heap.Pop(&cp.idHeap).(int)
	}

	cp.colors[id] = c
	log.Printf("%d: %v\n", id, c)

	return nil
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