package main

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	connection *websocket.Conn
	manager *Manager
	setPixEvtJson chan []byte
}

type ClientList map[*Client] bool

func NewClient(conn *websocket.Conn, m *Manager) *Client {
	return &Client{
		connection: conn,
		manager: m,
		setPixEvtJson: make(chan []byte),
	}
}

func (client *Client) writeMsgs() {
	ch := make(chan SetPixelData)
	defer close(ch)

	for {
		select {
		case json := <-client.setPixEvtJson:
			log.Println("Client read!")
			client.connection.WriteMessage(websocket.TextMessage, json)
		case <- time.After(1 * time.Second):
			//log.Println("Client waiting...")
		}
	}
}

func (client *Client) readUserMsgs() {
	defer client.manager.removeClient(client)

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
		log.Println("Request ", payload)
		if err := json.Unmarshal(payload, &request); err != nil {
			log.Println("error unmarshalling message:", err)
			continue
		}
		log.Println("unmarshaled:", request.Data)
		// Push event to manager
		client.manager.clientRequests <- ClientRequest{client, &request}
		//if err := client.manager.routeEvent(request, client); err != nil {
		//	log.Println("Error handling message:", err)
		//}
	}
}