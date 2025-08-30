package main

import (
	"image"

	"golang.org/x/image/draw"
)

// http://golang.org/doc/articles/image_draw.html
func ResizeImage(old image.Image, w, h int) (image.Image, error) {
	new := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.BiLinear.Scale(new, new.Bounds(), old, old.Bounds(), draw.Over, nil)

	return new, nil
}
