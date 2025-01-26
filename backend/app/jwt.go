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

	_ "image/png"
)

// TODO: This assumes that JWT_SECRET is set as an environment variable. If it isn't,
// os.Getenv will return an empty string. This feels a bit sketchy -> Look into this again.
var secretKey = []byte(os.Getenv("JWT_SECRET"))

func CreateToken(username string) (string, error) {
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
		tokenString, err := CreateToken(u.Username)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Errorf("Could not create token for username %s", u.Username)
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, tokenString)
	} else {
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
	Path string `json:"path"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
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

func LoadImg(w http.ResponseWriter, r *http.Request, manager *Manager) {
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

	manager.setImage(image, payload.X, payload.Y)
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
