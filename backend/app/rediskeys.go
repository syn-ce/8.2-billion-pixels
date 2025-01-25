package main

import "fmt"

var REDIS_KEYS = struct {
	TOTAL_NR_PIXELS string
	BITS_PER_COLOR  string
	NR_SEC_COLS     string
	NR_SEC_ROWS     string
	SEC_WIDTH       string
	SEC_HEIGHT      string
	COLOR_SET       string
	SEC_IDS         string
	SEC_META        func(string) string
	SEC_PIX_DATA    func(string) string
}{
	"total_nr_pixels",
	"bits_per_color",
	"sections_nr_cols",
	"sections_nr_rows",
	"section_width",
	"sections_height",
	"color_set",
	"sec_ids",
	func(id string) string {
		return fmt.Sprint("sec_", id)
	},
	func(id string) string {
		return id
	},
}
