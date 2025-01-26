package main

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// https://github.com/gorilla/websocket/blob/main/examples/chat/client.go
var (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 20 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

type Client struct {
	connection         *websocket.Conn
	manager            *Manager
	setPixEvtJson      chan []byte
	subscribedSections map[string]struct{}
}

type ClientList map[*Client]bool

func NewClient(conn *websocket.Conn, m *Manager) *Client {
	return &Client{
		connection:         conn,
		manager:            m,
		setPixEvtJson:      make(chan []byte),
		subscribedSections: make(map[string]struct{}),
	}
}

func (client *Client) WriteMsgs() {
	ch := make(chan SetPixelData)
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		close(ch)
		client.manager.removeClient(client)
	}()

	for {
		select {
		case json, ok := <-client.setPixEvtJson:
			client.connection.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Server closed the channel
				client.connection.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			log.Println("Client read!")
			if err := client.connection.WriteMessage(websocket.TextMessage, json); err != nil {
				log.Println("could not write message to client:", err)
			}
		case <-ticker.C:
			client.connection.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.connection.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Println("could not ping client:", err)
				return
			}
		}
	}
}

func (client *Client) ReadUserMsgs() {
	defer client.manager.removeClient(client)

	client.connection.SetReadLimit(int64(maxMessageSize))
	client.connection.SetReadDeadline(time.Now().Add(pongWait))
	client.connection.SetPongHandler(func(string) error { client.connection.SetReadDeadline(time.Now().Add(pongWait)); return nil })

	for {
		_, payload, err := client.connection.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Println("Error reading message:", err)
			}
			break
		}
		//sectionId, pixelIdx, color = data
		//      bitfield = redis.bitfield(sectionId)
		//      bitfield.set(f'u{bits_per_color}', f'#{pixelIdx}', color)
		//      bitfield.execute()
		//      redis.publish('set_pixel_channel', message=json.dumps({'sectionId': sectionId, 'pixelIdx': pixelIdx, 'color': color}))

		// Marshal data into Event
		var request SocketEvent
		if err := json.Unmarshal(payload, &request); err != nil {
			log.Println("error unmarshalling message:", err)
			continue
		}
		// Push event to manager
		client.manager.clientRequests <- ClientRequest{client, &request}
		//if err := client.manager.routeEvent(request, client); err != nil {
		//	log.Println("Error handling message:", err)
		//}
	}

	log.Println("Closing")
}
