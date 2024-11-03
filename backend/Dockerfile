FROM golang:latest AS development

WORKDIR /app

COPY app/go.mod app/go.sum ./
RUN go mod download

COPY app/*.go ./

RUN go install github.com/githubnemo/CompileDaemon@latest
RUN ls /bin

CMD ["CompileDaemon", "-command=./server"]


FROM golang:latest AS build
COPY /app/go.mod /app/go.sum ./
RUN go mod download
COPY --from=development /app/*.go .
RUN CGO_ENABLED=0 GOOS=linux go build -o /go-serv
CMD ["/go-serv"]

FROM gcr.io/distroless/base-debian11 AS production

WORKDIR /

COPY --from=build /go-serv /go-serv

USER nonroot:nonroot

ENTRYPOINT [ "/go-serv" ]