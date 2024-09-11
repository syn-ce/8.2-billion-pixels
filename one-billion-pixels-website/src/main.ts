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

const subscribeToSections = (ids: number[]) => {
    if (ids.length == 0) return
    socket.emit('subscribe', ids)
}

const unsubscribeFromSections = (ids: number[]) => {
    if (ids.length == 0) return
    socket.emit('unsubscribe', ids)
}

subscribeToSections([0, 1])

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
const determineRequiredSections = (
    canvasState: CanvasState,
    sections: Section[]
): Map<number, Section> => {
    // Determine edges in virtual space
    const [topLeft, botRight] = screenToVirtualSpace(
        [
            [0, 0],
            [canvasState.canvas.width, canvasState.canvas.height],
        ],
        canvasState
    )

    // Filter sections
    const filteredSections = sections.filter(
        (section) =>
            !(
                section.topLeft[0] >= botRight[0] ||
                section.botRight[0] <= topLeft[0] ||
                section.topLeft[1] >= botRight[1] ||
                section.botRight[1] <= topLeft[1]
            )
    )
    console.log(`Req ${filteredSections.length} / ${sections.length}`)

    return new Map(filteredSections.map((section) => [section.id, section]))
}

const fetchSections = async () => {
    return (await fetch('http://localhost:5000/sections')).json()
}

type Section = {
    topLeft: [number, number]
    botRight: [number, number]
    id: number
}
const sections: Section[] = await fetchSections()
const WIDTH = sections[sections.length - 1].botRight[0] // TODO: this assumes the sections to start at 0; maybe don't make this assumption
const HEIGHT = sections[sections.length - 1].botRight[1]
const subscribedSections: Map<number, Section> = new Map()
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
    virtualCenter: [250, 250], // Point in virtual space which is initially centered in screen space
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
        ps.push([
            // TODO: verify that ceil here doesn't mess things up
            Math.ceil(canvasCenter[0] + diff[0]),
            Math.ceil(canvasCenter[1] + diff[1]),
        ])
    }
    return ps
}

const sectionsToScreenSpace = (
    canvasState: CanvasState,
    sections: Map<number, Section>
) => {
    const transformedSections: Map<number, Section> = new Map()
    for (const [id, section] of sections) {
        const [topLeft, botRight] = virtualToScreenSpace(
            [section.topLeft, section.botRight],
            canvasState
        )
        transformedSections.set(id, { topLeft, botRight, id: section.id })
    }
    return transformedSections
}

const updateSections = (
    curSections: Map<number, Section>,
    requiredSections: Map<number, Section>
) => {
    const sectionsToRemove: Map<number, Section> = new Map()
    // Remove sections which are no longer needed
    for (const [id, subscribedSection] of curSections) {
        if (!requiredSections.has(id)) {
            sectionsToRemove.set(id, subscribedSection)
        }
    }
    // Remove sections after loop so that we don't modify collection while iterating
    console.log(`Del ${sectionsToRemove.size} sections`)
    sectionsToRemove.forEach((section, id, map) => curSections.delete(id))
    unsubscribeFromSections(Array.from(sectionsToRemove.keys()))

    // Add new sections
    const sectionsToAdd: Map<number, Section> = new Map()
    for (const [id, section] of requiredSections) {
        if (!curSections.has(section.id)) {
            sectionsToAdd.set(id, section)
            curSections.set(id, section)
        }
    }
    console.log(`Add ${sectionsToAdd.size} sections`)
    subscribeToSections(Array.from(sectionsToAdd.keys()))
}

const drawSections = (canvasState: CanvasState, sections: Section[]) => {
    // Filter sections which are not in view
    const requiredSections = determineRequiredSections(canvasState, sections)

    // Subscribe to new, unsubscribe from old
    updateSections(subscribedSections, requiredSections)

    const transformedSections: Map<number, Section> = sectionsToScreenSpace(
        canvasState,
        requiredSections
    )

    canvasState.ctx.clearRect(
        0,
        0,
        canvasState.canvas.width,
        canvasState.canvas.height
    )

    for (const [id, section] of transformedSections) {
        const [topLeft, botRight] = [section.topLeft, section.botRight]
        canvasState.ctx.fillStyle = `rgb(
        ${Math.floor(255 - (255 / sections.length) * id)}
        ${Math.floor(255 - (255 / sections.length) * id)}
        0)` // randomColor()
        canvasState.ctx.fillRect(
            topLeft[0],
            topLeft[1],
            botRight[0] - topLeft[0],
            botRight[1] - topLeft[1]
        )
    }
}

window.onresize = (evt) => {
    canvas.width = window.innerWidth //* devicePixelRatio
    canvas.height = window.innerHeight //* devicePixelRatio
    drawSections(canvasState, sections)
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
        const scalingFactor = evt.deltaY < 0 ? 2.0 : 1 / 2.0
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

drawSections(canvasState, sections)
