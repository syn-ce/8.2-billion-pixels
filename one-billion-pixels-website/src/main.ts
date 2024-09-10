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

type Point2D = { x: number; y: number }
type Section = { topLeft: [number, number]; botRight: [number, number] }
const sections: Section[] = await fetchSections()

function randomColor() {
    let chars = '0123456789ABCDEF'
    let color = '#'
    for (var i = 0; i < 6; i++) {
        color += chars[Math.floor(Math.random() * chars.length)]
    }
    return color
}

const colorSections = (
    sections: Section[],
    context: CanvasRenderingContext2D
) => {
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i]
        context.fillStyle = randomColor()
        context.fillRect(
            section.topLeft[0],
            section.topLeft[1],
            section.botRight[0] - section.topLeft[0] + 1,
            section.botRight[1] - section.topLeft[1] + 1
        )
    }
}

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
canvas.width = 1000
canvas.height = 1000
const context = canvas.getContext('2d')!
const canvasZoomWrapper = <HTMLDivElement>(
    document.getElementById('canvas-zoom-wrapper')
)
const canvasPanWrapper = <HTMLDivElement>(
    document.getElementById('canvas-pan-wrapper')
)

context.fillStyle = 'red'
context.fillRect(0, 0, canvas.width, canvas.height)

//canvasWrapper.style.transform = 'scale(2.0, 2.0)'

// Add scale

const applyTranslate = (curTransform: number[], x: number, y: number) => {
    curTransform[4] += curTransform[0] * x + curTransform[2] * y
    curTransform[5] += curTransform[1] * x + curTransform[3] * y
}

const applyZoom = (curTransform: number[], zoom: number) => {
    curTransform[0] *= zoom
    curTransform[1] *= zoom
    curTransform[2] *= zoom
    curTransform[3] *= zoom
}

const setTransform = (el: HTMLElement, transform: number[]) => {
    el.style.transform = `matrix(${transform.toString()})`
}

// The view port is equal to the view window

type PanState = {
    isPanning: boolean
    prevCanvasPos: { x: number; y: number }
}

type ZoomState = {
    minZoom: number
    maxZoom: number
    invMinZoom: number
    invMaxZoom: number
    curScale: number
}

const panWrapperTransform = [1, 0, 0, 1, 0, 0]

const panWrapperState: PanState = {
    isPanning: false,
    prevCanvasPos: { x: 0, y: 0 },
}

//const maxZoom = 50

const zoomWrapperState: ZoomState = {
    maxZoom: 50,
    minZoom: 1,
    invMinZoom: 1 / 50,
    invMaxZoom: 1,
    curScale: 1 / 50,
}

const zoomWrapperTransform = [1, 0, 0, 1, 0, 0]

canvas.style.transform = `scale(${zoomWrapperState.maxZoom})`
applyZoom(zoomWrapperTransform, zoomWrapperState.curScale)
setTransform(canvasZoomWrapper, zoomWrapperTransform)

const addPanToCanvas = (
    panState: PanState,
    transform: number[],
    canvas: HTMLCanvasElement,
    canvasPanWrapper: HTMLDivElement
) => {
    canvas.onmousedown = (evt) => {
        panState.isPanning = true
        panState.prevCanvasPos = { x: evt.x, y: evt.y }
    }
    canvas.onmousemove = (evt) => {
        if (!panState.isPanning) return
        //panning.curTranslate.x +=
        //panning.curTranslate.y +=
        applyTranslate(
            transform,
            evt.x - panState.prevCanvasPos.x,
            evt.y - panState.prevCanvasPos.y
        )
        panState.prevCanvasPos = { x: evt.x, y: evt.y }
        //curTransform.translate = panning.curTranslate
        setTransform(canvasPanWrapper, transform)
        //canvasPanWrapper.style.transform = `${transformState.curTransform}`
        //canvasPanWrapper.style.transform = `translate(${curTransform.translate.x}px ${curTransform.translate.y}px) scale(${curTransform.scale})`
    }
    canvas.onmouseup = (evt) => {
        panState.isPanning = false
    }
    canvas.onmouseleave = (evt) => {
        panState.isPanning = false
    }
}

addPanToCanvas(panWrapperState, panWrapperTransform, canvas, canvasPanWrapper)

// TODO: fix the zoom, i.e. keep the pixel under the cursor
canvas.onwheel = (evt) => {
    //console.log(evt.x, evt.y)
    // Move center of canvas there
    const canvasRect = canvas.getBoundingClientRect()
    //console.log('panWrapperRect')
    //console.log(canvasRect)

    const relCursorPos = {
        x: evt.x - canvasRect.left,
        y: evt.y - canvasRect.top,
    }
    console.log(`zoomCenter = ${relCursorPos.x}, ${relCursorPos.y}`)

    const curCenter = {
        x: canvas.width / 2,
        y: canvas.height / 2,
    }
    const centerDiff = {
        x: (1 / zoomWrapperState.curScale) * (relCursorPos.x - curCenter.x),
        y: (1 / zoomWrapperState.curScale) * (relCursorPos.y - curCenter.y),
    }

    // 1. Center zoom-point
    console.log(centerDiff)

    //console.log(`transform before = ${zoomWrapperTransform}`)

    //applyTranslate(zoomWrapperTransform, centerDiff.x, centerDiff.y)
    // 2. Zoom
    const oldScale = zoomWrapperState.curScale
    if (evt.deltaY > 0) zoomWrapperState.curScale -= 0.01
    else zoomWrapperState.curScale += 0.01
    zoomWrapperState.curScale = Math.max(
        zoomWrapperState.invMinZoom,
        zoomWrapperState.curScale
    )
    zoomWrapperState.curScale = Math.min(
        zoomWrapperState.invMaxZoom,
        zoomWrapperState.curScale
    )
    //console.log(`curScale = ${zoomWrapperState.curScale}`)
    //console.log(oldScale / zoomWrapperState.curScale)
    applyZoom(zoomWrapperTransform, zoomWrapperState.curScale / oldScale)
    // 3. Move back
    //applyTranslate(zoomWrapperTransform, -centerDiff.x, -centerDiff.y)
    //console.log(`transform after = ${zoomWrapperTransform}`)
    setTransform(canvasZoomWrapper, zoomWrapperTransform)
    //console.log(evt.deltaY)

    //canvasPanWrapper.style.transform = `${transformState.curTransform}`
    //curTransform.translate.x += zoomCenter.x - curCenter.x
    //curTransform.translate.y += zoomCenter.y - curCenter.y
    //canvasZoomWrapper.style.transformStyle
    //canvasZoomWrapper.style.transform = `translate(${curTransform.translate.x}px ${curTransform.translate.y}px) scale(${curTransform.scale})`

    console.log(curCenter)
}

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

colorSections(sections, context)

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
