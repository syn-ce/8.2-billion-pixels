package main

type User struct {
	Username string `json:"username" redis:"username"`
	Password string `json:"password" redis:"password"`
}
