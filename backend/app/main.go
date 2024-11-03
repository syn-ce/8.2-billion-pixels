package main

import (
	"log"
	"math"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"
)

func setupAPI() (*mux.Router, error) {
	manager, err := NewManager(&redis.Options{
		Addr: "redis:6379",
		Password: "",
		DB: 0,
	})	
	if err != nil {
		log.Println("failed to create manager", err)
		return nil, err
	}

	r := mux.NewRouter()
	r.HandleFunc("/ws", manager.serveWS)
	r.HandleFunc("/colors", manager.serveColors)
	r.HandleFunc("/sections", manager.serveSections)
	r.HandleFunc("/section-data/{secId}", manager.serveSectionData)
	
	//initRedisFromScratch(manager)
	manager.loadFromRedis()

	go manager.listenForEvents()

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
	bitsPerColor := 4
    nrCols := 5
    nrRows := 5
    secWidth := 1000
    secHeight := 1000
    totalWidth := secWidth * nrCols
    totalHeight := secHeight * nrRows
    startTopLeft := NewPoint(int(-math.Floor(float64(totalWidth) / 2.0)), int(-math.Floor(float64(totalHeight) / 2.0)))
    colors := []*Color{NewColor(255, 255, 255), NewColor(0, 0, 0), NewColor(247, 174, 248), NewColor(179, 136, 235), 
              NewColor(128, 147, 241), NewColor(114, 221, 247), NewColor(244, 244, 237), NewColor(219, 207, 176), 
              NewColor(115, 171, 132)}
    
	colorProvider := NewColorProvider(bitsPerColor, colors...)
	sections := splitIntoSections(*startTopLeft, secWidth, secHeight, nrRows, nrCols)
	log.Printf("%d sections\n", len(sections))
	log.Printf("%d colors\n", len(colorProvider.colors))

	m.colorProvider = colorProvider
	m.sections = sections
	if err := m.saveColorProvider(); err != nil {
		log.Println("failed to save color provider", err)
	}
	if err := m.saveSectionsMeta(); err != nil {
		log.Println("failed to save sections meta", err)
	}
}