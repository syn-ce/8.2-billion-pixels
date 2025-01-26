package main

import (
	"bytes"
	"log"

	"github.com/pierrec/lz4/v4"
)

func Compress(data []byte) ([]byte, error) {
	var compressed bytes.Buffer
	writer := lz4.NewWriter(&compressed)

	_, err := writer.Write(data)
	if err != nil {
		log.Println("could not compress section data:", err)
		return nil, err
	}

	err = writer.Close()
	if err != nil {
		log.Println("could not close writer after compressing section data:", err)
		return nil, err
	}

	return compressed.Bytes(), nil
}
