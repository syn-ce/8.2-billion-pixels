package main

import (
	"log"
	"math"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"
)

func setupAPI() (*mux.Router, error) {
	manager, err := NewManager(&redis.Options{
		Addr:     "redis:6379",
		Password: "",
		DB:       0,
	})
	if err != nil {
		log.Println("failed to create manager", err)
		return nil, err
	}

	r := mux.NewRouter()
	r.HandleFunc("/ws", manager.ServeWS)
	r.HandleFunc("/colors", manager.ServeColors)
	r.HandleFunc("/sections", manager.ServeSectionsMeta)
	r.HandleFunc("/section-data/{secId}", manager.ServeSectionData)
	r.HandleFunc("/test", manager.Test)
	r.HandleFunc("/auth", func(w http.ResponseWriter, r *http.Request) {
		LoginHandler(w, r, manager)
	})
	r.HandleFunc("/load-img", func(w http.ResponseWriter, r *http.Request) {
		AuthorizedHandler(w, r, manager, LoadImg)
	})
	r.HandleFunc("/delete-pos-id", func(w http.ResponseWriter, r *http.Request) {
		AuthorizedHandler(w, r, manager, DeletePositionId)
	})
	r.HandleFunc("/update-colors", func(w http.ResponseWriter, r *http.Request) {
		AuthorizedHandler(w, r, manager, UpdateColorsHandler)
	})

	//initRedisFromScratch(manager)
	for {
		err := manager.LoadFromRedis()
		if err == nil {
			break
		}
		log.Println(err)
		log.Println("Can't load data from redis. Retrying in 2 seconds...")
		time.Sleep(2 * time.Second)
	}
	log.Println("Successfully loaded data from redis.")

	go manager.ListenForEvents()

	return r, nil
}

func main() {
	router, err := setupAPI()
	if err != nil {
		log.Println("failed to setup api")
		return
	}
	http.Handle("/", router)
	log.Fatal(http.ListenAndServe(":5000", nil))
}

func initRedisFromScratch(m *Manager) {
	m.redis.FlushDB(*m.ctx)
	bitsPerColor := 6
	nrCols := 5
	nrRows := 5
	secWidth := 1000
	secHeight := 1000
	totalWidth := secWidth * nrCols
	totalHeight := secHeight * nrRows
	startTopLeft := NewPoint(int(-math.Floor(float64(totalWidth)/2.0)), int(-math.Floor(float64(totalHeight)/2.0)))
	colors := []*Color{
		FromHex("#ffffff"), FromHex("#5ba675"), FromHex("#6bc96c"), FromHex("#abdd64"),
		FromHex("#fcef8d"), FromHex("#ffb879"), FromHex("#ea6262"), FromHex("#cc425e"),
		FromHex("#a32858"), FromHex("#751756"), FromHex("#390947"), FromHex("#611851"),
		FromHex("#873555"), FromHex("#a6555f"), FromHex("#c97373"), FromHex("#f2ae99"),
		FromHex("#ffc3f2"), FromHex("#ee8fcb"), FromHex("#d46eb3"), FromHex("#873e84"),
		FromHex("#1f102a"), FromHex("#4a3052"), FromHex("#7b5480"), FromHex("#a6859f"),
		FromHex("#d9bdc8"), FromHex("#aee2ff"), FromHex("#8db7ff"), FromHex("#6d80fa"),
		FromHex("#8465ec"), FromHex("#834dc4"), FromHex("#7d2da0"), FromHex("#4e187c"),
	}

	sections := SplitIntoSections(*startTopLeft, secWidth, secHeight, nrRows, nrCols)
	colorProvider := NewColorProvider(bitsPerColor, colors...)
	positions := make(map[string]PositionInfo)
	positions["example"] = PositionInfo{*NewPoint(100, 200), PositionImageInfo{}}
	log.Printf("%d sections\n", len(sections))
	log.Printf("%d colors\n", len(colorProvider.colors))
	log.Printf("%d positions\n", len(positions))

	m.sections = sections
	m.colorProvider = colorProvider
	m.positions = positions
	if err := m.SaveSectionsMeta(); err != nil {
		log.Println("failed to save sections meta", err)
	}
	if err := m.SaveColorProvider(); err != nil {
		log.Println("failed to save color provider", err)
	}
	if err := m.SavePositions(); err != nil {
		log.Println("failed to save positions", err)
	}
	initSectionData(m)
}

func initSectionData(m *Manager) {
	for _, section := range m.sections {
		nrPixels := (section.meta.BotRight.X - section.meta.TopLeft.X) * (section.meta.BotRight.Y - section.meta.TopLeft.Y)
		nrBits := nrPixels * m.colorProvider.bitsPerColor
		m.redis.SetBit(*m.ctx, REDIS_KEYS.SEC_PIX_DATA(section.meta.Id), int64(nrBits-1), 0)
	}
}
