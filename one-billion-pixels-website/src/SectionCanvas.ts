import { Socket } from 'socket.io-client'
import { Reticle } from './Reticle'
import { Section } from './Section'
import { fetchSectionsData } from './requests'
import { addPanZoomToSectionCanvas } from './PanZoom'
import { ZoomSlider } from './ZoomSlider'

export class SectionCanvas {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    panning: boolean
    prevPanMousePos: [number, number]
    startPanMousePos: [number, number]
    maxZoom: number
    minZoom: number
    scale: number
    maxScale: number
    minScale: number
    offset: [number, number]
    contentOffset: [number, number]
    reticle: Reticle
    sections: Map<number, Section>
    subscribedSectionIds: Set<number>
    socket: Socket
    screenFrame: HTMLDivElement
    panZoomWrapper: HTMLDivElement
    zoomSlider: ZoomSlider
    canvRetWrapper: HTMLDivElement

    constructor(
        canvas: HTMLCanvasElement,
        scale: number,
        reticle: Reticle,
        sections: Map<number, Section>,
        subscribedSectionIds: Set<number>,
        socket: Socket,
        screenFrame: HTMLDivElement,
        panZoomWrapper: HTMLDivElement,
        maxZoom: number,
        zoomSlider: ZoomSlider,
        canvRetWrapper: HTMLDivElement
    ) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')!
        this.panning = false
        this.prevPanMousePos = [-1, -1] // Could be anything
        this.startPanMousePos = [-1, -1] // As well
        this.maxZoom = maxZoom
        this.minZoom = 1
        this.scale = 1 / this.maxZoom
        this.maxScale = 1
        this.minScale = 1 / this.maxZoom
        this.zoomSlider = zoomSlider
        this.zoomSlider.min = 1
        this.zoomSlider.max = this.maxZoom
        this.zoomSlider.value = this.scale * this.maxZoom
        this.zoomSlider.step = 0.01

        this.offset = [0, 0]
        this.contentOffset = [0, 0]
        this.reticle = reticle
        this.sections = sections
        this.subscribedSectionIds = subscribedSectionIds
        this.socket = socket
        this.screenFrame = screenFrame
        this.panZoomWrapper = panZoomWrapper

        const widthBufferSize = Math.ceil(screenFrame.clientWidth * 0.1)
        const heightBufferSize = Math.ceil(screenFrame.clientHeight * 0.1)

        //this.canvas.style.width = `${
        //    screenFrame.clientWidth + widthBufferSize * 2
        //}px`
        //this.canvas.style.height = `${
        //    screenFrame.clientHeight + heightBufferSize * 2
        //}px`
        this.canvas.width = screenFrame.clientWidth + widthBufferSize * 2 //* devicePixelRatio
        this.canvas.height = screenFrame.clientHeight + heightBufferSize * 2 //* devicePixelRatio

        this.canvRetWrapper = canvRetWrapper
        canvRetWrapper.style.transform = `scale(${this.maxZoom})`

        addPanZoomToSectionCanvas(this)

        this.zoomSlider.addInputCallback((zoomValue) => {
            const screenCenter: [number, number] = [
                window.innerWidth / 2,
                window.innerHeight / 2,
            ]
            const factor = zoomValue / (this.scale * this.maxZoom)
            this.zoomInto(screenCenter, factor)
        })

        socket.on(
            'set-pixel',
            (data: { sectionId: number; pixelIdx: number; color: number }) => {
                console.log(`set-pixel: ${JSON.stringify(data)}`)
                this.sections
                    .get(data.sectionId)!
                    .setPixel(
                        this.sections.get(data.sectionId)!,
                        data.pixelIdx,
                        data.color
                    )
            }
        )
    }

    userSetPixel = (
        canvasPixel: [number, number],
        colorId: number,
        sectionCanvas: SectionCanvas
    ) => {
        const sectionCoords = [
            canvasPixel[0] - this.contentOffset[0],
            canvasPixel[1] - this.contentOffset[1],
        ]

        // TODO: maybe think about doing something more efficient here, but at the same time
        // how many concurrent subscribed sections will one have? More than 100 (even more than ~ 10)
        // for an average full hd screen seems unlikely with what I have in mind right now
        const sectionId = Array.from(sectionCanvas.subscribedSectionIds).find(
            (id) => {
                const sec = sectionCanvas.sections.get(id)!
                return (
                    sec.topLeft[0] <= sectionCoords[0] &&
                    sec.topLeft[1] <= sectionCoords[1] &&
                    sectionCoords[0] < sec.botRight[0] &&
                    sectionCoords[1] < sec.botRight[1]
                )
            }
        )!

        const section = sectionCanvas.sections.get(sectionId)!

        const sectionPixelIdx =
            (sectionCoords[1] - section.topLeft[1]) * section.width +
            (sectionCoords[0] - section.topLeft[0])

        // Set pixel in section
        section.setPixel(section, sectionPixelIdx, colorId)

        // Redraw section onto canvas
        section.drawOnSectionCanvas(this)

        // Inform server
        this.socket.emit('set_pixel', [section.id, sectionPixelIdx, colorId])
    }

    subscribeToSections = (ids: number[]) => {
        if (ids.length == 0) return
        this.socket.emit('subscribe', ids)
    }

    unsubscribeFromSections = (ids: number[]) => {
        if (ids.length == 0) return
        this.socket.emit('unsubscribe', ids)
    }

    // Returns an array of the old subscriptions
    updateSectionsSubscriptions = (requiredSections: Set<number>) => {
        const curSections = this.subscribedSectionIds
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
        this.unsubscribeFromSections(Array.from(sectionIdsToRemove))

        const oldRemainingIds = new Set(curSections)

        // Add new sections
        const sectionIdsToAdd: Set<number> = new Set()
        for (const id of requiredSections) {
            if (!curSections.has(id)) {
                sectionIdsToAdd.add(id)
                curSections.add(id)
            }
        }
        console.log(`Add ${sectionIdsToAdd.size} sections`)
        this.subscribeToSections(Array.from(sectionIdsToAdd))
        this.subscribedSectionIds = curSections
        return [sectionIdsToAdd, oldRemainingIds]
    }

    determineRequiredSections = () => {
        // We can simply determine whether the section intersects with the canvas.
        // For further optimization (taking zoom into account) we could then also test which part of the canvas is actually displayed on screen.
        // A contentOffset of [-100, -150] means that the content will be moved 100 to the left and 150 to the top of the screen,
        // effectively moving the area which is visible 100 to the right and 150 to the bottom of the screen
        const sectionBufferSize = [0, 0]
        const contentTopLeft = [
            -this.contentOffset[0] - sectionBufferSize[0],
            -this.contentOffset[1] - sectionBufferSize[1],
        ]

        const reqSectionsIds: Set<number> = new Set()
        for (const [id, section] of this.sections) {
            // TODO: verify that <= is correct (and not <)
            if (
                contentTopLeft[0] <=
                    section.topLeft[0] + section.width + sectionBufferSize[0] &&
                contentTopLeft[0] + this.canvas.width + sectionBufferSize[0] >=
                    section.topLeft[0] &&
                contentTopLeft[1] <=
                    section.topLeft[1] +
                        section.height +
                        sectionBufferSize[1] &&
                contentTopLeft[1] + this.canvas.height + sectionBufferSize[1] >=
                    section.topLeft[1]
            ) {
                reqSectionsIds.add(id)
            }
        }

        console.log(`Required sections: ${Array.from(reqSectionsIds)}`)

        return reqSectionsIds
    }

    // TODO: panning is a bit janky because of aliasing
    drawSections = async () => {
        // Filter sections which should not be active
        const requiredSectionsIds = this.determineRequiredSections()

        const [newlyAddedIds, oldRemainingIds] =
            this.updateSectionsSubscriptions(requiredSectionsIds)

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        // Draw remaining old ones
        oldRemainingIds.forEach((sectionId) => {
            const section = this.sections.get(sectionId)!
            section.drawOnSectionCanvas(this)
        })

        // Fetch data of newly added ones
        fetchSectionsData(
            Array.from(newlyAddedIds).map((id) => this.sections.get(id)!),
            (section) => section.drawOnSectionCanvas(this)
        )

        //// Update reticle
        //this.reticle.update(this)
    }

    setCanvasTransform = () => {
        this.checkBuffers()
        this.panZoomWrapper.style.transform = `translate(${this.offset[0]}px, ${this.offset[1]}px) scale(${this.scale})`
        this.reticle.update(this)
        this.zoomSlider.value = this.scale * this.maxZoom
    }

    checkBuffers = () => {
        const canvas = this.canvas
        const bufferMultiplier = this.scale * this.maxZoom

        if (
            (bufferMultiplier * canvas.width) / 2 -
                this.screenFrame.clientWidth / 2 -
                this.offset[0] <=
                0 ||
            (bufferMultiplier * canvas.width) / 2 -
                this.screenFrame.clientWidth / 2 +
                this.offset[0] <=
                0 ||
            (bufferMultiplier * canvas.height) / 2 -
                this.screenFrame.clientHeight / 2 -
                this.offset[1] <=
                0 ||
            (bufferMultiplier * canvas.height) / 2 -
                this.screenFrame.clientHeight / 2 +
                this.offset[1] <=
                0
        ) {
            // Center canvas
            // Need to adjust content
            this.contentOffset[0] += this.offset[0] / bufferMultiplier
            this.contentOffset[1] += this.offset[1] / bufferMultiplier
            //drawImgWithOffset(img, sectionCanvas.contentOffset)
            this.drawSections()
            this.offset = [0, 0]
        }
    }

    screenToCanvasPixel = (screenPixel: [number, number]): [number, number] => {
        const canvBoundRect = this.canvas.getBoundingClientRect()

        const screenPixelsPerCanvasPixel = this.screenPixelsPerCanvasPixel

        const canvasCoords: [number, number] = [
            (screenPixel[0] - canvBoundRect.left) / screenPixelsPerCanvasPixel,
            (screenPixel[1] - canvBoundRect.top) / screenPixelsPerCanvasPixel,
        ]

        // Flooring is the correct thing to do here
        canvasCoords[0] = Math.floor(canvasCoords[0])
        canvasCoords[1] = Math.floor(canvasCoords[1])

        return canvasCoords
    }

    canvasToScreenPixel = (canvasPixel: [number, number]): [number, number] => {
        const canvBoundRect = this.canvas.getBoundingClientRect()

        const screenPixelsPerCanvasPixel = this.screenPixelsPerCanvasPixel

        const screenCoords: [number, number] = [
            canvasPixel[0] * screenPixelsPerCanvasPixel + canvBoundRect.left,
            canvasPixel[1] * screenPixelsPerCanvasPixel + canvBoundRect.top,
        ]

        return screenCoords
    }

    zoomInto = (screenCoords: [number, number], factor: number) => {
        if (this.scale * factor > this.maxScale)
            factor = this.maxScale / this.scale
        else if (this.scale * factor < this.minScale)
            factor = this.minScale / this.scale
        const canvBoundRect = this.canvas.getBoundingClientRect()

        // Pixels from zoomPoint to canvas center
        const diffToCenter = [
            canvBoundRect.left + canvBoundRect.width / 2 - screenCoords[0],
            canvBoundRect.top + canvBoundRect.height / 2 - screenCoords[1],
        ]

        // Difference in pixels from zoomPoint to canvas center after zoom (compared to before)
        const translation = [
            diffToCenter[0] * (factor - 1),
            diffToCenter[1] * (factor - 1),
        ]

        translation[0] = Math.round(translation[0])
        translation[1] = Math.round(translation[1])

        this.scale *= factor
        this.offset[0] += translation[0]
        this.offset[1] += translation[1]
        this.setCanvasTransform()
    }

    get screenPixelsPerCanvasPixel() {
        return this.scale * this.maxZoom
    }
}
