FROM golang:latest AS development

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./

RUN go install github.com/githubnemo/CompileDaemon@latest
RUN ls /bin

# RUN CGO_ENABLED=0 GOOS=linux go build -o /docker-gs-ping
CMD ["CompileDaemon", "-command=./server"]


FROM golang:latest AS build
COPY go.mod go.sum ./
RUN go mod download
COPY --from=development /app/*.go .
RUN CGO_ENABLED=0 GOOS=linux go build -o /docker-gs-ping
CMD ["/docker-gs-ping"]

FROM gcr.io/distroless/base-debian11 AS production

WORKDIR /

COPY --from=build /docker-gs-ping /docker-gs-ping

USER nonroot:nonroot

ENTRYPOINT [ "/docker-gs-ping" ]