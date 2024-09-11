import './style.css'
import { io } from 'socket.io-client'

const socket = io('http://localhost:5000', { transports: ['websocket'] })
socket.on('connect', () => {
    socket.emit('my event', { data: "I'm connected!" })
})
//
socket.on('message', () => {
    socket.send()
})
//
socket.on('poll', (data) => {
    socket.emit('active')
})

// Canvas data
const fetchBits = async () => {
    const buffer = await (
        await fetch('http://localhost:5000/bits')
    ).arrayBuffer()
    return new Uint8Array(buffer)
}
const allBits = await fetchBits()
console.log(`nr of bits = ${allBits.length * 8}`)

// Determine all sections which we need to fetch
//const determineRequiredSections = (canvas: HTMLCanvasElement) => {
//    canvas.
//}
const fetchSections = async () => {
    return (await fetch('http://localhost:5000/sections')).json()
}

type Section = { topLeft: [number, number]; botRight: [number, number] }
const sections: Section[] = await fetchSections()
const WIDTH = sections[sections.length - 1].botRight[0] + 1
const HEIGHT = sections[sections.length - 1].botRight[1] + 1
console.log(WIDTH)
console.log(HEIGHT)

function randomColor() {
    let chars = '0123456789ABCDEF'
    let color = '#'
    for (var i = 0; i < 6; i++) {
        color += chars[Math.floor(Math.random() * chars.length)]
    }
    return color
}

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
console.log(screen.width)
canvas.width = window.innerWidth //* devicePixelRatio
canvas.height = window.innerHeight //* devicePixelRatio
const context = canvas.getContext('2d')!

type CanvasState = {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    virtualCenter: [number, number]
    scale: number
    panning: boolean
    prevPanMousePos: [number, number]
}

// Start with canvas centered in middle of screen
const canvasState: CanvasState = {
    canvas: canvas,
    ctx: context,
    virtualCenter: [500, 500], // Point in virtual space which is initially centered in screen space
    scale: 1,
    panning: false,
    prevPanMousePos: [0, 0],
}

const screenToVirtualSpace = (
    points: [number, number][],
    canvasState: CanvasState
): [number, number][] => {
    //canvasState.virtualCenter
    let canvasCenter = [
        canvasState.canvas.width / 2,
        canvasState.canvas.height / 2,
    ]
    let centerVirtual = canvasState.virtualCenter
    let ps: [number, number][] = []
    for (const point of points) {
        // Diff on screen
        const diff = [point[0] - canvasCenter[0], point[1] - canvasCenter[1]]
        // Diff in virtual space
        diff[0] /= canvasState.scale
        diff[1] /= canvasState.scale
        ps.push([centerVirtual[0] + diff[0], centerVirtual[1] + diff[1]])
    }
    return ps
}

const virtualToScreenSpace = (
    points: [number, number][],
    canvasState: CanvasState
): [number, number][] => {
    let canvasCenter = [
        canvasState.canvas.width / 2,
        canvasState.canvas.height / 2,
    ]
    let centerVirtual = canvasState.virtualCenter
    let ps: [number, number][] = []
    for (const point of points) {
        // Diff in virtual space
        const diff = [point[0] - centerVirtual[0], point[1] - centerVirtual[1]]
        // Diff on screen
        diff[0] *= canvasState.scale
        diff[1] *= canvasState.scale
        ps.push([canvasCenter[0] + diff[0], canvasCenter[1] + diff[1]])
    }
    return ps

    //return points.map((point) => [
    //    point[0] / canvasState.scale - canvasState.xOffset,
    //    point[1] / canvasState.scale - canvasState.yOffset,
    //])
}

const sectionsToScreenSpace = (
    canvasState: CanvasState,
    sections: Section[]
) => {
    const transformedSections: Section[] = []
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i]
        const [topLeft, botRight] = virtualToScreenSpace(
            [section.topLeft, section.botRight],
            canvasState
        )
        transformedSections[i] = { topLeft, botRight }
    }
    return transformedSections
}

const drawSections = (canvasState: CanvasState, sections: Section[]) => {
    const transformedSections: Section[] = sectionsToScreenSpace(
        canvasState,
        sections
    )

    canvasState.ctx.clearRect(
        0,
        0,
        canvasState.canvas.width,
        canvasState.canvas.height
    )

    for (let i = 0; i < transformedSections.length; i++) {
        const section = transformedSections[i]
        const [topLeft, botRight] = [section.topLeft, section.botRight]
        canvasState.ctx.fillStyle = `rgb(
        ${Math.floor(255 - (255 / transformedSections.length) * i)}
        ${Math.floor(255 - (255 / transformedSections.length) * i)}
        0)` // randomColor()
        canvasState.ctx.fillRect(
            topLeft[0],
            topLeft[1],
            botRight[0] - topLeft[0] + 1,
            botRight[1] - topLeft[1] + 1
        )
    }
}

const applyTransform = (points: [number, number][], transform: number[]) => {
    const ps: [number, number][] = []
    for (const point of points) {
        const x =
            point[0] * transform[0] + point[1] * transform[2] + transform[4]
        const y =
            point[0] * transform[1] + point[1] * transform[3] + transform[5]
        ps.push([x, y])
    }
    return ps
}

window.onresize = (evt) => {
    canvas.width = window.innerWidth //* devicePixelRatio
    canvas.height = window.innerHeight //* devicePixelRatio
    drawSections(canvasState, sections)
}

context.fillStyle = 'red'
context.fillRect(0, 0, canvas.width, canvas.height)

//canvasWrapper.style.transform = 'scale(2.0, 2.0)'

// Add scale

const applyTranslate = (transform: number[], x: number, y: number) => {
    transform[4] += transform[0] * x + transform[2] * y
    transform[5] += transform[1] * x + transform[3] * y
}

const applyZoom = (transform: number[], zoom: number) => {
    transform[0] *= zoom
    transform[1] *= zoom
    transform[2] *= zoom
    transform[3] *= zoom
}

const addPanToCanvas = (canvasState: CanvasState) => {
    const canvas = canvasState.canvas
    canvas.onmousedown = (evt) => {
        canvasState.panning = true
        canvasState.prevPanMousePos = [evt.x, evt.y]
    }
    canvas.onmousemove = (evt) => {
        if (!canvasState.panning) return
        // Difference on screen
        const diff = [
            evt.x - canvasState.prevPanMousePos[0],
            evt.y - canvasState.prevPanMousePos[1],
        ]

        // Difference in virtual space
        diff[0] /= canvasState.scale
        diff[1] /= canvasState.scale
        // Adjust center
        canvasState.virtualCenter[0] -= diff[0]
        canvasState.virtualCenter[1] -= diff[1]
        // Update
        canvasState.prevPanMousePos = [evt.x, evt.y]
        drawSections(canvasState, sections)
    }
    canvas.onmouseup = (evt) => {
        canvasState.panning = false
    }
    canvas.onmouseleave = (evt) => {
        canvasState.panning = false
    }
}

const addZoomToCanvas = (canvasState: CanvasState) => {
    canvas.onwheel = (evt) => {
        // Diff from canvas (screen) center to zoom point in screen space
        const scalingFactor = evt.deltaY < 0 ? 1.2 : 1 / 1.2
        const virtualCenter = canvasState.virtualCenter
        const diff = [
            evt.x - canvasState.canvas.width / 2,
            evt.y - canvasState.canvas.height / 2,
        ]
        // Difference in virtual space
        diff[0] /= canvasState.scale
        diff[1] /= canvasState.scale
        // Move virtual center to 0, then move zoom point to 0
        let movedVirtualCenter: [number, number] = [-diff[0], -diff[1]]
        // Scale up
        movedVirtualCenter[0] /= scalingFactor
        movedVirtualCenter[1] /= scalingFactor
        // Move back
        movedVirtualCenter[0] += virtualCenter[0] + diff[0]
        movedVirtualCenter[1] += virtualCenter[1] + diff[1]
        canvasState.scale *= scalingFactor

        canvasState.virtualCenter = movedVirtualCenter
        drawSections(canvasState, sections)
    }
}

addPanToCanvas(canvasState)
addZoomToCanvas(canvasState)

// Current aspect ratio

const fetchImageData = async (context: CanvasRenderingContext2D) => {
    const buffer = await (
        await fetch('http://localhost:5000/bits')
    ).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    const imgData = context.createImageData(canvas.width, canvas.height)
    for (let i = 0; i < bytes.length; i++) {
        let bits = bytes[i]
        for (let j = 0; j < 8; j++) {
            const color = (bits & 1) == 1 ? 255 : 0
            imgData.data[i * 32 + j * 4] = color
            imgData.data[i * 32 + j * 4 + 1] = color
            imgData.data[i * 32 + j * 4 + 2] = color
            imgData.data[i * 32 + j * 4 + 3] = 255
            bits >>= 1
        }
    }
    context.putImageData(imgData, 0, 0)
}

//await fetchImageData(context)

drawSections(canvasState, sections)

//window.addEventListener('resize', (_) => {
//    //canvas.width = window.innerWidth * window.devicePixelRatio
//    //canvas.height = window.innerHeight * window.devicePixelRatio
//    const imgData = context.createImageData(canvas.width, canvas.height)
//
//    let white = false
//    for (let i = 0; i < imgData.width * imgData.height * 4; i++) {
//        if (i % 4 == 0) white = !white
//        if (white) imgData.data[i] = 255
//    }
//
//    createImageBitmap(imgData).then((s) => {
//        context.drawImage(s, 0, 0)
//    })
//})
//
//window.dispatchEvent(new Event('resize'))
