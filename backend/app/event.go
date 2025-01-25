package main

import "encoding/json"

type SocketEvent struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// [section.id, sectionPixelIdx, colorId]
type SetPixelData struct {
	SecId   string `json:"secId"`
	PixIdx  int    `json:"pixIdx"`
	ColorId int    `json:"colorId"`
}

// [secId1, secId2, ...]
type SubscribeData []string

// [secId1, secId2, ...]
type UnsubscribeData []string

type EventHandler func(event SocketEvent, c *Client) error

const (
	EventSetPixel    = "set_pixel"
	EventSubscribe   = "subscribe"
	EventUnsubscribe = "unsubscribe"
)
