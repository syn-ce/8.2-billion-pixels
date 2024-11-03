export type EventHandler = (evt: SocketEvent) => void

export type SocketEvent = {
    type: string
    data: EvtData
}

export interface EvtData {}

export interface SetPixelData extends EvtData {
    timestamp: number
    secId: number
    pixIdx: number
    colorId: number
}

export class EvtSocket {
    websocket: WebSocket
    handlers: Map<string, EventHandler>

    constructor() {
        this.websocket = new WebSocket('/ws')
        this.handlers = new Map()

        this.websocket.onmessage = (ev: MessageEvent) => {
            console.log(`Message: ${ev.data}`)

            const evt = this.parseEvt(ev)
            if (!this.handlers.has(evt.type)) {
                console.error(`Event of unknown type ${evt.type}`)
                return
            }
            this.handlers.get(evt.type)!(evt)
        }
    }

    addEvtHandler = (type: string, handler: EventHandler) =>
        this.handlers.set(type, handler)

    parseEvt = (msgEvt: MessageEvent) => <SocketEvent>JSON.parse(msgEvt.data)

    sendEvt = (type: string, data: any) => {
        console.log(JSON.stringify({ type, data }))
        this.websocket.send(JSON.stringify({ type, data }))
    }
}

export const setupSocket = () => {
    return new EvtSocket()
}
