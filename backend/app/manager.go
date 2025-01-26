package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
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
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	ErrUnknownEvent = errors.New("unknown event type")
)

type ClientRequest struct {
	c       *Client
	request *SocketEvent
}

type Manager struct {
	sync.RWMutex
	clients        ClientList
	clientRequests chan ClientRequest
	eventHandlers  map[string]EventHandler
	redis          *redis.Client
	pubsub         *redis.PubSub
	ctx            *context.Context
	sectionSubs    map[string]map[*Client]struct{}
	sections       []*Section
	colorProvider  *ColorProvider
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
	bitsPerColor, err := m.redis.Get(*m.ctx, REDIS_KEYS.BITS_PER_COLOR).Int()
	if err != nil {
		log.Println("error when getting key ", err)
		return err
	}
	colorSet, err := m.redis.SMembers(*m.ctx, REDIS_KEYS.COLOR_SET).Result()
	if err != nil {
		log.Println("error when getting key ", err)
		return err
	}

	m.colorProvider = NewColorProvider(bitsPerColor)

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

	for err := rdb.Ping(ctx).Err(); err != nil; {
		log.Println("Can't connect to redis. Retrying in 2 seconds...: ", err)
		rdb.Close()
		time.Sleep(2 * time.Second)
		rdb = redis.NewClient(redisOptions)
	}
	log.Println("Successfully connected to redis.")

	m := &Manager{
		clients:        make(ClientList),
		clientRequests: make(chan ClientRequest, 1),
		eventHandlers:  make(map[string]EventHandler),
		redis:          rdb,
		ctx:            &ctx,
		sectionSubs:    make(map[string]map[*Client]struct{}),
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

// TODO: worry about performance (set row-wise / pipe requests?)
func (m *Manager) setPixelsInSection(secMeta SectionMetaData, secX, secY, w, h int, img image.Image, imgX int, imgY int) error {
	// set row by row
	secWidth := secMeta.BotRight.X - secMeta.TopLeft.X
	log.Printf("dimensions: %dx%d=%d", w, h, w*h)
	for row := range h {
		// Slice into image
		for col := range w {
			color := img.At(imgX+col, imgY+row)
			// Translate into closest available color
			colorIdToUse, err := m.colorProvider.ClosestAvailableColor(FromColor(color))
			//fmt.Println(colorIdToUse)
			if err != nil {
				return err
			}
			m.setPixel(SetPixelData{SecId: secMeta.Id, PixIdx: (secY+row)*secWidth + (secX + col), ColorId: colorIdToUse})
		}
		//rowY := row + secY
		//m.redis.BitField()
	}
	return nil
}

func (m *Manager) setImage(img image.Image, x int, y int) {
	// Determine all sections which need to be updated
	// TODO: improve on naive search
	intersectingSections := make([]*Section, 0, 4)
	imgBounds := img.Bounds()
	log.Printf("img: %dx%d at (x,y): (%d,%d)", imgBounds.Dx(), imgBounds.Dy(), x, y)
	for _, section := range m.sections {
		secW := section.meta.BotRight.X - section.meta.TopLeft.X
		secH := section.meta.BotRight.Y - section.meta.TopLeft.Y
		if x <= section.meta.TopLeft.X+secW &&
			x+imgBounds.Dx() >= section.meta.TopLeft.X &&
			y <= section.meta.TopLeft.Y+secH &&
			y+imgBounds.Dy() >= section.meta.TopLeft.Y {
			intersectingSections = append(intersectingSections, section)
		}
	}

	for _, section := range intersectingSections {
		log.Printf("%s: %d, %d", section.meta.Id, section.meta.TopLeft.X, section.meta.TopLeft.Y)
		// Calculate intersecting rectangle
		topLeftX := max(section.meta.TopLeft.X, x)
		topLeftY := max(section.meta.TopLeft.Y, y)
		botRightX := min(section.meta.BotRight.X, x+imgBounds.Dx())
		botRightY := min(section.meta.BotRight.Y, y+imgBounds.Dy())

		// Get the correct pixels in the section
		m.setPixelsInSection(section.meta,
			topLeftX-section.meta.TopLeft.X, topLeftY-section.meta.TopLeft.Y, // Translate into coords relative to top left of section
			botRightX-topLeftX, botRightY-topLeftY, // Width of area to draw
			img, topLeftX-x, topLeftY-y) // Translate into coords relative to top left of image

		log.Printf("(%d, %d), (%d, %d) in (%d, %d)", topLeftX, topLeftY, botRightX, botRightY, topLeftX-x, topLeftY-y)
	}

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
		var setPixData SetPixelData
		if err := json.Unmarshal(e.Data, &setPixData); err != nil {
			log.Println("error unmarshalling message:", err)
			return err
		}

		err := m.redis.Publish(*m.ctx, "set_pixel", setPixData).Err()
		if err != nil {
			log.Println("could not publish set_pixel to redis:", err)
			return err
		}
		// Set pixel in redis
		m.setPixel(setPixData)

		return nil
	}
	m.eventHandlers[EventSubscribe] = func(e SocketEvent, c *Client) error {
		var subIds SubscribeData
		if err := json.Unmarshal(e.Data, &subIds); err != nil {
			log.Println("error unmarshalling message:", err)
			return err
		}

		m.Lock()
		for _, id := range subIds {
			m.sectionSubs[id][c] = struct{}{}
			c.subscribedSections[id] = struct{}{}
		}
		m.Unlock()

		return nil
	}
	m.eventHandlers[EventUnsubscribe] = func(e SocketEvent, c *Client) error {
		var unsubIds UnsubscribeData
		if err := json.Unmarshal(e.Data, &unsubIds); err != nil {
			log.Println("error unmarshalling message:", err)
			return err
		}

		m.Lock()
		for _, id := range unsubIds {
			delete(m.sectionSubs[id], c)
			delete(c.subscribedSections, id)
		}
		m.Unlock()

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
	client := NewClient(conn, manager)
	manager.addClient(client)

	go client.readUserMsgs()
	go client.writeMsgs()
}

func (m *Manager) addClient(client *Client) {
	m.Lock()
	defer m.Unlock()

	m.clients[client] = true
	log.Println("Nr clients:", len(m.clients))
}

func (m *Manager) removeClient(client *Client) {
	m.Lock()
	defer m.Unlock()

	log.Println("Removing client!")

	if _, ok := m.clients[client]; ok {
		client.connection.Close()
		close(client.setPixEvtJson)
		delete(m.clients, client)
		for secId := range client.subscribedSections {
			delete(m.sectionSubs[secId], client)
		}
	}
	log.Println("Nr clients:", len(m.clients))
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
			log.Println("Processed client request", clientRequest.request.Type)
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
			//case <-time.After(60 * time.Second):
			//	log.Println("Waiting...")
		}
	}
}

type SectionConfig = struct {
	Sections     []SectionMetaData `json:"sections"`
	BitsPerPixel int               `json:"bitsPerPixel"`
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
	Id  int   `json:"id"`
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
		log.Println("could not marshal colors")
		w.WriteHeader(500)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write(colorsJson)
}

func (m *Manager) getCompressSectionData(secId string) ([]byte, error) {
	data, err := m.redis.Get(*m.ctx, REDIS_KEYS.SEC_PIX_DATA(secId)).Bytes()
	if err != nil {
		log.Printf("could not load section data for section %s from redis: %v\n", secId, err)
		return nil, err
	}
	compressed, err := compress(data)
	if err != nil {
		log.Printf("could not compress section data for section %s from redis: %v\n", secId, err)
		return nil, err
	}

	return compressed, nil
}

func (m *Manager) serveSectionData(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	log.Println("S", vars["secId"])

	data, err := m.getCompressSectionData(vars["secId"])
	if err != nil {
		w.WriteHeader(500)
		return
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write(data)
}

// TODO: worry about hashing and stuff
func (m *Manager) LoadUser(username string) (User, error) {
	var user User
	cmdReturn := m.redis.HGetAll(*m.ctx, fmt.Sprintf("user:%s", username))

	if err := cmdReturn.Scan(&user); err != nil {
		return User{}, err
	}

	return user, nil
}
