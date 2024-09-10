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
    logicalCenter: [number, number]
    logicalZoom: number
    logicalTransform: number[]
    panning: boolean
    prevPanMousePos: [number, number]
}

// Start with canvas centered in middle of screen
const canvasState: CanvasState = {
    canvas: canvas,
    ctx: context,
    logicalCenter: [WIDTH / 2, HEIGHT / 2],
    logicalZoom: 1,
    logicalTransform: [1, 0, 0, 1, 0, 0],
    panning: false,
    prevPanMousePos: [0, 0],
}

const transformSectionsToCanvasCoords = (
    canvasState: CanvasState,
    sections: Section[]
) => {
    const transformedSections: Section[] = []
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i]
        // First apply logical transform (i.e. pan, zoom)
        // Then transform so that logical center is displayed in the middle of the screen
        const [topLeft, botRight] = applyTransform(
            applyTransform(
                [section.topLeft, section.botRight],
                canvasState.logicalTransform
            ),
            [
                1,
                0,
                0,
                1,
                -canvasState.logicalCenter[0] + canvasState.canvas.width / 2,
                -canvasState.logicalCenter[1] + canvasState.canvas.height / 2,
            ]
        )
        transformedSections[i] = { topLeft, botRight }
    }
    return transformedSections
}

const drawSections = (canvasState: CanvasState, sections: Section[]) => {
    const transformedSections: Section[] = transformSectionsToCanvasCoords(
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
    canvas.width = window.innerWidth * devicePixelRatio
    canvas.height = window.innerHeight * devicePixelRatio
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
        //panning.curTranslate.x +=
        //panning.curTranslate.y +=
        applyTranslate(
            canvasState.logicalTransform,
            evt.x - canvasState.prevPanMousePos[0],
            evt.y - canvasState.prevPanMousePos[1]
        )
        canvasState.prevPanMousePos = [evt.x, evt.y]
        //curTransform.translate = panning.curTranslate
        // TODO: refactor global sections here
        drawSections(canvasState, sections)
        //canvasPanWrapper.style.transform = `${transformState.curTransform}`
        //canvasPanWrapper.style.transform = `translate(${curTransform.translate.x}px ${curTransform.translate.y}px) scale(${curTransform.scale})`
    }
    canvas.onmouseup = (evt) => {
        canvasState.panning = false
    }
    canvas.onmouseleave = (evt) => {
        canvasState.panning = false
    }
}

addPanToCanvas(canvasState)

// TODO: fix the zoom, i.e. keep the pixel under the cursor
//canvas.onwheel = (evt) => {
//    //console.log(evt.x, evt.y)
//    // Move center of canvas there
//    const canvasRect = canvas.getBoundingClientRect()
//    //console.log('panWrapperRect')
//    //console.log(canvasRect)
//
//    const relCursorPos = {
//        x: evt.x - canvasRect.left,
//        y: evt.y - canvasRect.top,
//    }
//    console.log(`zoomCenter = ${relCursorPos.x}, ${relCursorPos.y}`)
//
//    const curCenter = {
//        x: canvas.width / 2,
//        y: canvas.height / 2,
//    }
//    const centerDiff = {
//        x: (1 / zoomWrapperState.curScale) * (relCursorPos.x - curCenter.x),
//        y: (1 / zoomWrapperState.curScale) * (relCursorPos.y - curCenter.y),
//    }
//
//    // 1. Center zoom-point
//    console.log(centerDiff)
//
//    //console.log(`transform before = ${zoomWrapperTransform}`)
//
//    //applyTranslate(zoomWrapperTransform, centerDiff.x, centerDiff.y)
//    // 2. Zoom
//    const oldScale = zoomWrapperState.curScale
//    if (evt.deltaY > 0) zoomWrapperState.curScale -= 0.01
//    else zoomWrapperState.curScale += 0.01
//    zoomWrapperState.curScale = Math.max(
//        zoomWrapperState.invMinZoom,
//        zoomWrapperState.curScale
//    )
//    zoomWrapperState.curScale = Math.min(
//        zoomWrapperState.invMaxZoom,
//        zoomWrapperState.curScale
//    )
//    //console.log(`curScale = ${zoomWrapperState.curScale}`)
//    //console.log(oldScale / zoomWrapperState.curScale)
//    applyZoom(zoomWrapperTransform, zoomWrapperState.curScale / oldScale)
//    // 3. Move back
//    //applyTranslate(zoomWrapperTransform, -centerDiff.x, -centerDiff.y)
//    //console.log(`transform after = ${zoomWrapperTransform}`)
//    setTransform(canvasZoomWrapper, zoomWrapperTransform)
//    //console.log(evt.deltaY)
//
//    //canvasPanWrapper.style.transform = `${transformState.curTransform}`
//    //curTransform.translate.x += zoomCenter.x - curCenter.x
//    //curTransform.translate.y += zoomCenter.y - curCenter.y
//    //canvasZoomWrapper.style.transformStyle
//    //canvasZoomWrapper.style.transform = `translate(${curTransform.translate.x}px ${curTransform.translate.y}px) scale(${curTransform.scale})`
//
//    console.log(curCenter)
//}

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
