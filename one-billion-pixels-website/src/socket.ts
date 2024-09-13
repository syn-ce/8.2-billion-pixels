import { io } from 'socket.io-client'

export const setupSocket = () => {
    // This assumes that the front is served from the same domain as the server (currently proxying through vite)
    const socket = io({
        transports: ['websocket'],
    })

    socket.on('session', () => {
        console.log('Connected')
    })

    return socket
}
