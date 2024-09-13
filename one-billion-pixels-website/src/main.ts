import { Reticle } from './Reticle'
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
): Set<number> => {
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

    return new Set(filteredSections.map((section) => section.id))
}

const fetchSections = async () => {
    return (await fetch('http://localhost:5000/sections')).json()
}

type Section = {
    topLeft: [number, number]
    botRight: [number, number]
    id: number
    data: Uint8Array
}

type CanvasState = {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    virtualCenter: [number, number]
    scale: number
    panning: boolean
    prevPanMousePos: [number, number]
    reticle: Reticle
    sections: Map<number, Section>
    subscribedSectionIds: Set<number>
}

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
console.log(screen.width)
canvas.width = window.innerWidth //* devicePixelRatio
canvas.height = window.innerHeight //* devicePixelRatio
const ctx = canvas.getContext('2d')!

const reticle = document.getElementById('reticle')!

// Start with canvas centered in middle of screen
const canvasState: CanvasState = {
    canvas: canvas,
    ctx: ctx,
    virtualCenter: [250, 250], // Point in virtual space which is initially centered in screen space
    scale: 1,
    panning: false,
    prevPanMousePos: [0, 0],
    reticle: new Reticle(reticle, [250, 250]),
    sections: new Map(),
    subscribedSectionIds: new Set(),
}

const sections: Section[] = await fetchSections()
const WIDTH = sections[sections.length - 1].botRight[0] // TODO: this assumes the sections to start at 0; maybe don't make this assumption
const HEIGHT = sections[sections.length - 1].botRight[1]
//const subscribedSections: Map<number, Section> = new Map()
console.log(WIDTH)
console.log(HEIGHT)
canvasState.sections = new Map(sections.map((section) => [section.id, section]))

const fetchSectionData = async (section: Section) => {
    console.log(`fetch ${section.id}`)
    const buffer = await (
        await fetch(`http://localhost:5000/section-data/${section.id}`)
    ).arrayBuffer()

    const bytes = new Uint8Array(buffer)
    return bytes
}

const drawSection = (sectionId: number, canvasState: CanvasState) => {
    let section = canvasState.sections.get(sectionId)!
    const virtualSectionWidth = section.botRight[0] - section.topLeft[0]
    const virtualSectionHeight = section.botRight[1] - section.topLeft[1]

    section = sectionToScreenSpace(canvasState, section)
    const bytes = section.data
    if (bytes === undefined)
        console.error(
            `You are trying to draw section ${section.id}, but its data is undefined. Fetch it before drawing the section.`
        )

    const widthOnScreen = section.botRight[0] - section.topLeft[0] //* devicePixelRatio
    const heightOnScreen = section.botRight[1] - section.topLeft[1] //* devicePixelRatio

    const imgData = canvasState.ctx.createImageData(
        widthOnScreen,
        heightOnScreen
    )
    const screenPixelsPerPixel = canvasState.scale // Makes assumption about relation between scale and pixels
    let idxOffset = 7
    let bytesIdx = 0
    let count = 0

    const counts = []
    for (let i = 0; i < 10000; i++) counts.push(0)
    let bit = 0
    for (let row = 0; row < virtualSectionHeight; row++) {
        for (let col = 0; col < virtualSectionWidth; col++) {
            let bits = bytes[bytesIdx]
            bit = (bits >> idxOffset) & 1
            counts[bytesIdx]++
            idxOffset--
            if (idxOffset == -1) {
                idxOffset = 7
                bytesIdx++
            }
            let color = bit == 1 ? 255 : 0
            for (let i = 0; i < screenPixelsPerPixel; i++) {
                //if (row + i >= rows) break
                for (let j = 0; j < screenPixelsPerPixel; j++) {
                    count++
                    //if (col + j >= cols) break
                    let idx =
                        (row * virtualSectionWidth * screenPixelsPerPixel +
                            col) *
                            4 *
                            screenPixelsPerPixel +
                        j * 4 +
                        i * virtualSectionWidth * 4 * screenPixelsPerPixel
                    imgData.data[idx] = color
                    imgData.data[idx + 1] = color + section.id * 10
                    imgData.data[idx + 2] = color + section.id * 10
                    imgData.data[idx + 3] = 255
                }
            }
        }
    }

    canvasState.ctx.putImageData(
        imgData,
        section.topLeft[0],
        section.topLeft[1]
    )
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

const virtualToScreenSpaceIntegers = (
    points: [number, number][],
    canvasState: CanvasState
): [number, number][] => {
    return virtualToScreenSpace(points, canvasState).map((point) => [
        Math.ceil(point[0]),
        Math.ceil(point[1]),
    ])
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
            canvasCenter[0] + diff[0],
            canvasCenter[1] + diff[1],
        ])
    }
    return ps
}

const sectionToScreenSpace = (
    canvasState: CanvasState,
    section: Section
): Section => {
    const [topLeft, botRight] = virtualToScreenSpaceIntegers(
        [section.topLeft, section.botRight],
        canvasState
    )
    return {
        topLeft,
        botRight,
        id: section.id,
        data: section.data,
    }
}

const sectionsToScreenSpace = (
    canvasState: CanvasState,
    sections: Map<number, Section>
) => {
    const transformedSections: Map<number, Section> = new Map()
    for (const [id, section] of sections) {
        transformedSections.set(id, sectionToScreenSpace(canvasState, section))
    }
    return transformedSections
}

const updateSections = async (
    requiredSections: Set<number>,
    canvasState: CanvasState
) => {
    const curSections = canvasState.subscribedSectionIds
    const sectionIdsToRemove: Set<number> = new Set()
    // Remove sections which are no longer needed
    for (const id of curSections) {
        if (!requiredSections.has(id)) {
            sectionIdsToRemove.add(id) // Mark section to be removed
        }
    }
    // Remove sections after loop so that we don't modify collection while iterating
    console.log(`Del ${sectionIdsToRemove.size} sections`)
    sectionIdsToRemove.forEach((id, _, set) => curSections.delete(id))
    unsubscribeFromSections(Array.from(sectionIdsToRemove))

    // Add new sections
    const sectionIdsToAdd: Set<number> = new Set()
    for (const id of requiredSections) {
        if (!curSections.has(id)) {
            sectionIdsToAdd.add(id)
            curSections.add(id)
        }
    }
    console.log(`Add ${sectionIdsToAdd.size} sections`)
    subscribeToSections(Array.from(sectionIdsToAdd))
    // Fetch sections data
    await fetchSectionsData(
        Array.from(sectionIdsToAdd).map((id) => canvasState.sections.get(id)!)
    )
}

const fetchSectionsData = async (sections: Section[]) => {
    return Promise.all(
        Array.from(
            sections.map(async (section) => {
                section.data = await fetchSectionData(section)
            })
        )
    )
}

const setPixelBtn = <HTMLButtonElement>document.getElementById('set-pixel-btn')

setPixelBtn.onclick = async () => {
    setPixel(canvasState.reticle.screenPixel, 0, canvasState)
}

const setPixelInSection = (
    section: Section,
    virtualPixel: [number, number],
    color: number
) => {
    const width = section.botRight[0] - section.topLeft[0]
    const idx =
        width * (virtualPixel[1] - section.topLeft[1]) +
        (virtualPixel[0] - section.topLeft[0])

    socket.emit('set_pixel', [section.id, idx, color])
    const byteIdx = Math.floor(idx / 8)
    const bitIdx = idx % 8

    if (color == 0) section.data[byteIdx] &= 255 ^ ((1 << 7) >> bitIdx)
    else section.data[byteIdx] |= (1 << 7) >> bitIdx
}

const setPixel = (
    screenPixel: [number, number],
    color: number,
    canvasState: CanvasState
) => {
    // TODO: think about what to do when this isn't a whole value;
    // The docs advise to only use integer values to improve performance
    const screenPixelsPerPixel = canvasState.scale

    // Fill pixel on canvas
    canvasState.ctx.fillRect(
        screenPixel[0],
        screenPixel[1],
        screenPixelsPerPixel,
        screenPixelsPerPixel
    )

    // TODO: worry about all of these bangs
    // Apply update to section's data
    // Determine correct section based on virtual pixel
    const virtualPixel = screenToVirtualSpace([screenPixel], canvasState)[0]
    const sectionId = Array.from(canvasState.subscribedSectionIds).find(
        (id) => {
            const sec = canvasState.sections.get(id)!
            return (
                sec.topLeft[0] <= virtualPixel[0] &&
                sec.topLeft[1] <= virtualPixel[1] &&
                virtualPixel[0] < sec.botRight[0] &&
                virtualPixel[1] < sec.botRight[1]
            )
        }
    )!

    // TODO: check whether flooring here is the correct thing, especially with fractional scaling
    // Now that we've found the pixel, we can floor to the actual coordinates (could also do this before, but seems safer to do it after (numerical reasons))
    virtualPixel[0] = Math.floor(virtualPixel[0])
    virtualPixel[1] = Math.floor(virtualPixel[1])
    const section = canvasState.sections.get(sectionId)!
    setPixelInSection(section, virtualPixel, color)
}

// TODO: think about making reticle a bit more "sticky"
// Update size of reticle and snap reticle's position to pixel closest to screen center
const updateReticle = (canvasState: CanvasState) => {
    const screenCenter: [number, number] = [
        canvasState.canvas.width / 2,
        canvasState.canvas.height / 2,
    ]
    const pixelValues = screenToVirtualSpace([screenCenter], canvasState)[0]
    // Round to nearest
    pixelValues[0] = Math.round(pixelValues[0])
    pixelValues[1] = Math.round(pixelValues[1])

    // Convert coordinates of that virtual pixel to screen space
    const screenPixelCoords = virtualToScreenSpaceIntegers(
        [pixelValues],
        canvasState
    )[0]
    const reticle = canvasState.reticle
    screenPixelCoords[0] = screenPixelCoords[0] - canvasState.scale
    screenPixelCoords[1] = screenPixelCoords[1] - canvasState.scale
    reticle.screenPixel = screenPixelCoords
    // Update size of reticle and move it to this position
    reticle.htmlElement.style.width = `${canvasState.scale}px`
    reticle.htmlElement.style.height = `${canvasState.scale}px`
    reticle.htmlElement.style.left = `${screenPixelCoords[0]}px`
    reticle.htmlElement.style.top = `${screenPixelCoords[1]}px`
}

// TODO: panning is a bit janky because of aliasing
const drawSections = async (canvasState: CanvasState, sections: Section[]) => {
    // Filter sections which are not in view
    const requiredSectionsIds = determineRequiredSections(canvasState, sections)

    // Subscribe to new, unsubscribe from old
    await updateSections(requiredSectionsIds, canvasState)

    canvasState.ctx.clearRect(
        0,
        0,
        canvasState.canvas.width,
        canvasState.canvas.height
    )

    requiredSectionsIds.forEach((reqSectionId) =>
        drawSection(reqSectionId, canvasState)
    )

    // Update reticle
    updateReticle(canvasState)
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

drawSections(canvasState, sections)
