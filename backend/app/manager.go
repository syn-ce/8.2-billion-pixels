package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var (
	websocketUpgrader = websocket.Upgrader{
		ReadBufferSize: 1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("origin")
			return origin == "http://website.localhost:9876"
		},
	}
	ErrUnknownEvent = errors.New("unknown event type")
)



type ClientRequest struct {
	c *Client
	request *SocketEvent
}

type Manager struct {
	sync.RWMutex
	clients ClientList
	clientRequests chan ClientRequest
	eventHandlers map[string]EventHandler
	redis *redis.Client
	pubsub *redis.PubSub
	ctx *context.Context
	sectionSubs map[string]map[*Client]struct{}
	sections []*Section
	colorProvider *ColorProvider
}

func (m *Manager) loadSectionsMeta() error {
	// Section Ids
	sectionIds, err := m.redis.SMembers(*m.ctx, REDIS_KEYS.SEC_IDS).Result()
	if err != nil {
		log.Printf("error when getting key %s %v\n", REDIS_KEYS.SEC_IDS, err)
		return err
	}
	log.Println("Ids: ", sectionIds)
	sections := make([]*Section, len(sectionIds))
	// Section meta data
	for i, id := range sectionIds {
		binary, err := m.redis.Get(*m.ctx, REDIS_KEYS.SEC_META(id)).Bytes()
		if err != nil {
			log.Printf("error when getting key %s %v\n", REDIS_KEYS.SEC_META(id), err)
			return err
		}
		var sectionMeta = SectionMetaData{}
		if err := json.Unmarshal(binary, &sectionMeta); err != nil {
			log.Println("could not unmarshal", err)
			return err
		}
		section := NewSection(&sectionMeta, nil)
		sections[i] = section
		m.sectionSubs[section.meta.Id] = make(map[*Client]struct{})
	}

	m.sections = sections

	return nil
}

func (m *Manager) saveSectionsMeta() error {
	m.redis.Del(*m.ctx, REDIS_KEYS.SEC_IDS)
	for _, section := range m.sections {
		bytes, err := json.Marshal(section.meta)
		if err != nil {
			log.Println("could not marshal section meta data", err)
			return err
		}
		m.redis.Set(*m.ctx, REDIS_KEYS.SEC_META(section.meta.Id), bytes, 0)
		m.redis.SAdd(*m.ctx, REDIS_KEYS.SEC_IDS, section.meta.Id)
	}
	return nil
}

func (m *Manager) loadColorProvider() error {
	bitsPerColor, err := m.redis.Get(*m.ctx, REDIS_KEYS.BITS_PER_COLOR).Int64()
	if err != nil {
		log.Println("error when getting key ", err)
		return err
	}
	colorSet, err := m.redis.SMembers(*m.ctx, REDIS_KEYS.COLOR_SET).Result()
	if err != nil {
		log.Println("error when getting key ", err)
		return err
	}

	m.colorProvider = NewColorProvider(int(bitsPerColor))

	for _, binary := range colorSet {
		var colorChoice ColorChoice
		if err := json.Unmarshal([]byte(binary), &colorChoice); err != nil {
			log.Println("Could not unmarshal color:", err)
			continue
		}
		m.colorProvider.colors[colorChoice.Id] = &Color{byte(colorChoice.Rgb[0]), byte(colorChoice.Rgb[1]), byte(colorChoice.Rgb[2])}
	}

	return nil
}

func (m *Manager) saveColorProvider() error {
	m.redis.Del(*m.ctx, REDIS_KEYS.COLOR_SET)
	m.redis.Set(*m.ctx, REDIS_KEYS.BITS_PER_COLOR, m.colorProvider.bitsPerColor, 0)
	for id, color := range m.colorProvider.colors {
		colorChoice := ColorChoice{id, []int{int(color.R), int(color.G), int(color.B)}}
		bytes, err := json.Marshal(colorChoice)
		if err != nil {
			log.Println("could not marshal color", err)
			return err
		}
		m.redis.SAdd(*m.ctx, REDIS_KEYS.COLOR_SET, bytes)
	}
	
	return nil
}

func NewManager(redisOptions *redis.Options) (*Manager, error) {
	rdb := redis.NewClient(redisOptions)

	ctx := context.Background()

	m := &Manager{
		clients: make(ClientList),
		clientRequests: make(chan ClientRequest, 1),
		eventHandlers: make(map[string]EventHandler),
		redis: rdb,
		ctx: &ctx,
		sectionSubs: make(map[string]map[*Client]struct{}),
	}

	m.pubsub = m.redis.Subscribe(*m.ctx, "set_pixel")

//def load_sections(redis: Redis):
//    sec_ids = [int(sec_id) for sec_id in redis.smembers(RedisKeys.SEC_IDS)]
//    return [Section.from_bytes(redis.get(RedisKeys.sec_info(sec_id))) for sec_id in sec_ids]

//	bits_per_color = int(redis.get(RedisKeys.BITS_PER_COLOR))
//
//    color_provider = ColorProvider(bits_per_color, [])
//    colorset = redis.smembers(RedisKeys.COLOR_SET)
//    color_provider.add_colors_from_bytes(colorset)
//    colors_json = [{'id': id, 'rgb': color.rgb()} for id, color in color_provider.get_id_colors().items()]
//
//    #sections: list[Section] = split_bits(NR_BITS, ASP_RATIO_REL_W, ASP_RATIO_REL_H, 5, 2)
//    sections = load_sections(redis)
//    sections_json = [section.to_json() for section in sections]

	m.setupEventHandlers()
	return m, nil
}

func (m *Manager) loadFromRedis() error {
	if err := m.loadSectionsMeta(); err != nil {
		log.Println("could not load sections", err)
		return err
	}

	if err := m.loadColorProvider(); err != nil {
		log.Println("could not load color provider", err)
		return err
	}

	return nil
}

func (m *Manager) setPixel(setPixData SetPixelData) {
	t := fmt.Sprintf("u%d", m.colorProvider.bitsPerColor)
	offset := fmt.Sprintf("#%d", setPixData.PixIdx)
	m.redis.BitField(*m.ctx, setPixData.SecId, "set", t, offset, setPixData.ColorId)
}

func (setPixData SetPixelData) MarshalBinary() ([]byte, error) {
	return json.Marshal(setPixData)
}

func (m *Manager) setupEventHandlers() {
	m.eventHandlers[EventSetPixel] = func(e SocketEvent, c *Client) error {
		log.Println(e)
		var setPixData SetPixelData
		if err := json.Unmarshal(e.Data, &setPixData); err != nil {
			log.Println("error unmarshalling message:", err)
			return err
		}

		log.Println("publishing")
		err := m.redis.Publish(*m.ctx, "set_pixel", setPixData).Err()
		if err != nil {
			fmt.Println("could not publish set_pixel to redis:", err)
			return err
		}
		// Set pixel in redis
		m.setPixel(setPixData)
		
		return nil
	}
	m.eventHandlers[EventSubscribe] = func(e SocketEvent, c *Client) error {
		log.Println(e)
		var subIds SubscribeData
		if err := json.Unmarshal(e.Data, &subIds); err != nil {
			log.Println("error unmarshalling message:", err)
			return err
		}
		log.Println("marshalled", subIds)
		for _, id := range subIds {
			m.sectionSubs[id][c] = struct{}{}
		}
		
		return nil
	}
	m.eventHandlers[EventUnsubscribe] = func(e SocketEvent, c *Client) error {
		log.Println(e)
		var unsubIds UnsubscribeData
		if err := json.Unmarshal(e.Data, &unsubIds); err != nil {
			log.Println("error unmarshalling message:", err)
			return err
		}
		log.Println("marshalled", unsubIds)
		for _, id := range unsubIds {
			delete(m.sectionSubs[id], c)
		}

		return nil
	}
}


func (manager *Manager) serveWS(w http.ResponseWriter, r *http.Request) {
	log.Println("New connection")
	// Upgrade http request
	conn, err := websocketUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Could not upgrade request:", err)
		return
	}

	// Create new client
	log.Println("New client")
	client := NewClient(conn, manager)
	manager.addClient(client)

	go client.readUserMsgs()
	go client.writeMsgs()
}

func (m *Manager) addClient(client *Client) {
	m.Lock()
	defer m.Unlock()

	m.clients[client] = true
}

func (m *Manager) removeClient(client *Client) {
	m.Lock()
	defer m.Unlock()

	if _, ok := m.clients[client]; ok {
		client.connection.Close()
		delete(m.clients, client)
	}
}

func (m *Manager) routeEvent(event SocketEvent, c *Client) error {
	log.Println(event.Type)
	if handler, ok := m.eventHandlers[event.Type]; ok {
		if err := handler(event, c); err != nil {
			return err
		}
		return nil
	} else {
		return ErrUnknownEvent
	}
}


// Establishes the connection to redis and sets up the event processing loop
func (m *Manager) listenForEvents() {
	pubsubCh := m.pubsub.Channel()
	for {
		select {
		case clientRequest := <-m.clientRequests:
			go m.routeEvent(*clientRequest.request, clientRequest.c)
			log.Println("Processed event (read from clientRequests)", clientRequest.request.Type)
		case msg := <-pubsubCh:
			log.Println("Read evt from pubsub-queue:", msg.Payload)
			if msg.Channel == "set_pixel" {
				var setPixData SetPixelData
				b := []byte(msg.Payload)
				if err := json.Unmarshal(b, &setPixData); err != nil {
					log.Println("could not unmarshal payload of pubsub evt", err)
					continue
				}

				evt := SocketEvent{"set_pixel", b}
				evtBytes, err := json.Marshal(evt)
				if err != nil {
					log.Println("could not marshal socket event:", err)
				}
				for client := range m.sectionSubs[setPixData.SecId] {
					client.setPixEvtJson <- evtBytes
				}
			} else {
				log.Println("unknown channel", msg.Channel)
			}
			log.Println("Read evt!")
		case <-time.After(5 * time.Second):
			log.Println("Waiting...")
		}
	}
}

type SectionConfig = struct {
	Sections []SectionMetaData `json:"sections"`
	BitsPerPixel int `json:"bitsPerPixel"`
}

func (m *Manager) serveSections(w http.ResponseWriter, r *http.Request) {
	log.Println("Sections request")
	log.Println(r.Header)
	sectionsMeta := make([]SectionMetaData, len(m.sections))
	for id, section := range m.sections {
		sectionsMeta[id] = section.meta
	}
	sectionConfig := SectionConfig{sectionsMeta, m.colorProvider.bitsPerColor}
	sectionsMetaJson, err := json.Marshal(sectionConfig)
	if err != nil {
		log.Println("Could not marshal sections meta data:", err)
		w.WriteHeader(500)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write(sectionsMetaJson)
}

type ColorChoice = struct {
	Id int `json:"id"`
	Rgb []int `json:"rgb"`
}

func (m *Manager) serveColors(w http.ResponseWriter, r *http.Request) {
	log.Println("Color request")
	colorChoices := make([]ColorChoice, len(m.colorProvider.colors))

	idx := 0
	for id, color := range m.colorProvider.colors {
		colorChoices[idx] = ColorChoice{id, []int{int(color.R), int(color.G), int(color.B)}}
		idx++
	}
	colorsJson, err := json.Marshal(colorChoices)
	if err != nil {
		fmt.Println("could not marshal colors")
		w.WriteHeader(500)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write(colorsJson)
}

func (m *Manager) serveSectionData(w http.ResponseWriter, r *http.Request) {
	log.Println("sec data req")
	vars := mux.Vars(r)
	log.Println("Req S", vars["secId"])
	data, err := m.redis.Get(*m.ctx, REDIS_KEYS.SEC_PIX_DATA(vars["secId"])).Bytes()
	if err != nil {
		log.Printf("could not load section data for section %s from redis: %v\n", vars["secId"], err)
		w.WriteHeader(500)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write(data)
}