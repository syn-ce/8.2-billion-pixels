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

type User struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

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

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")

	var u User
	json.NewDecoder(r.Body).Decode(&u)
	log.Printf("The user request value %v", u)

	if u.Username == "Check" && u.Password == "123456" {
		tokenString, err := CreateToken(u.Username)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Errorf("No username found")
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
	log.Println("We're in")

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
