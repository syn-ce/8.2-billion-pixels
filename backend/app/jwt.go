package main

import (
	"encoding/json"
	"fmt"
	"image"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"image/draw"
	_ "image/png"
)

// TODO: This assumes that JWT_SECRET is set as an environment variable. If it isn't,
// os.Getenv will return an empty string. This feels a bit sketchy -> Look into this again.
var secretKey = []byte(os.Getenv("JWT_SECRET"))

func createToken(username string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"username": username,
		"exp":      time.Now().Add(time.Hour * 1).Unix(),
	})

	tokenString, err := token.SignedString(secretKey)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

func verifyToken(tokenString string) error {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return secretKey, nil // TODO: come back to this
	})

	if err != nil {
		return err
	}

	if !token.Valid {
		return fmt.Errorf("invalid token")
	}

	return nil
}

func LoginHandler(w http.ResponseWriter, r *http.Request, m *Manager) {
	w.Header().Set("Content-Type", "text/plain")

	var u User
	json.NewDecoder(r.Body).Decode(&u)
	log.Printf("user trying to log in: '%s' '%s'", u.Username, u.Password)

	userInDb, err := m.LoadUser(u.Username)

	if err == nil && u.Username == userInDb.Username && u.Password == userInDb.Password {
		tokenString, err := createToken(u.Username)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			log.Println("Could not create token for username", u.Username)
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, tokenString)
	} else {
		if err != nil {
			log.Println("error during auth:", err)
		} else {
			log.Println("error during auth: invalid credentials")
		}
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, "Invalid credentials")
	}
}

func AuthorizedHandler(w http.ResponseWriter, r *http.Request, manager *Manager, handler func(http.ResponseWriter, *http.Request, *Manager)) {
	w.Header().Set("Content-Type", "text/plain")
	tokenString := r.Header.Get("Authorization")
	if tokenString == "" {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, "Missing authorization header")
		return
	}
	tokenString = tokenString[len("Bearer "):]

	err := verifyToken(tokenString)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, "Invalid token")
		return
	}

	handler(w, r, manager)
}

type ImgLoadInstructions struct {
	Path       string `json:"path"`
	X          int    `json:"x"`
	Y          int    `json:"y"`
	W          int    `json:"w"`
	H          int    `json:"h"`
	PositionId string `json:"positionId"`
}

type PositionImageInfo struct {
	TopLeft Point `json:"topLeft"`
	W       int   `json:"w"`
	H       int   `json:"h"`
}

type PositionInfo struct {
	Center    Point             `json:"center"`
	ImageInfo PositionImageInfo `json:"imageInfo"`
}

func getImageFromFilePath(filePath string) (image.Image, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	image, _, err := image.Decode(f)
	return image, err
}

func LoadImg(w http.ResponseWriter, r *http.Request, m *Manager) {
	decoder := json.NewDecoder(r.Body)
	var payload ImgLoadInstructions
	if err := decoder.Decode(&payload); err != nil {
		log.Println("Could not decode ImgLoadInstructions", err)
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	log.Printf("Loading image %s %d %d", payload.Path, payload.X, payload.Y)

	image, err := getImageFromFilePath(payload.Path)
	if err != nil {
		log.Printf("Could not load image from path %s: %s", payload.Path, err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// resize image proportionally depending on either width or height, if specified
	if payload.W != 0 && payload.W != image.Bounds().Dx() {
		height := image.Bounds().Dy() * payload.W / image.Bounds().Dx()
		image, err = ResizeImage(image, payload.W, height)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
	} else if payload.H != 0 && payload.H != image.Bounds().Dy() {
		width := image.Bounds().Dx() * payload.H / image.Bounds().Dy()
		image, err = ResizeImage(image, width, payload.H)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
	}

	m.PutImage(image, payload.X, payload.Y)

	// register new positionId at center of img
	if payload.PositionId != "" {
		log.Println("Registering posId for loaded img:", payload.PositionId)
		center := *NewPoint(
			payload.X+image.Bounds().Dx()/2,
			payload.Y+image.Bounds().Dy()/2,
		)
		topLeft := *NewPoint(payload.X, payload.Y)
		posInfo := PositionInfo{center, PositionImageInfo{topLeft, image.Bounds().Dx(), image.Bounds().Dy()}}
		bytes, err := json.Marshal(posInfo)
		if err != nil {
			log.Println("could not marshal position", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		m.positions[payload.PositionId] = posInfo
		m.redis.Set(*m.ctx, REDIS_KEYS.POSITION(payload.PositionId), bytes, 0)
		m.redis.SAdd(*m.ctx, REDIS_KEYS.POS_IDS, payload.PositionId)
	}
}

// deletes positionId and clears the associated image (if it exists) with default color
func DeletePositionId(w http.ResponseWriter, r *http.Request, m *Manager) {
	posId := r.URL.Query().Get("pos")
	pos, posExists := m.positions[posId]

	if !posExists {
		return
	}

	delete(m.positions, posId)
	m.redis.Del(*m.ctx, REDIS_KEYS.POSITION(posId))
	m.redis.SRem(*m.ctx, REDIS_KEYS.POS_IDS, posId)

	log.Printf("Deleting position with posId=%s : %v", posId, pos)

	// clear image from canvas
	if pos.ImageInfo.W != 0 && pos.ImageInfo.H != 0 {
		img := image.NewRGBA(image.Rect(0, 0, pos.ImageInfo.W, pos.ImageInfo.H))
		draw.Draw(img, img.Bounds(), &image.Uniform{m.colorProvider.colors[0]}, image.Point{0, 0}, draw.Src)
		m.PutImage(img, pos.ImageInfo.TopLeft.X, pos.ImageInfo.TopLeft.Y)
	}
}

type ColorUpdate struct {
	Colors       []Color `json:"colors"`
	BitsPerColor int     `json:"bitsPerColor"`
	DefaultColor Color   `json:"defaultColor"`
}

func UpdateColorsHandler(w http.ResponseWriter, r *http.Request, manager *Manager) {
	var colorUpdate ColorUpdate
	if err := json.NewDecoder(r.Body).Decode(&colorUpdate); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		log.Println("could not parse json color update")
		return
	}

	manager.UpdateColors(colorUpdate)
}
