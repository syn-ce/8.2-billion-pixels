import { Socket } from 'socket.io-client'
import { Reticle } from './Reticle'
import { Section } from './Section'
import { fetchSectionsData } from './requests'
import { addAllInteractivityToSectionCanvas } from './CanvasInteractions'
import { ZoomSlider } from './ZoomSlider'
import { ColorProvider } from './ColorPicker'

export class SectionCanvas {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    panning: boolean
    prevPanMousePos: [number, number]
    prevZoomTouch: [
        { x: number; y: number; id: number },
        { x: number; y: number; id: number }
    ]
    startZoomTouch: {
        touch1: { x: number; y: number; id: number }
        touch2: { x: number; y: number; id: number }
        center: { x: number; y: number }
    }
    startPanMousePos: [number, number]
    maxZoom: number
    minZoom: number
    normScale: number
    desiredScale: number // The exact scale which should be displayed, but might differ from the actual one to mitigate aliasing
    maxNormScale: number
    minNormScale: number
    canvasDefaultOffset: [number, number]
    offset: [number, number]
    contentOffset: [number, number]
    reticle: Reticle
    sections: Map<number, Section>
    subscribedSectionIds: Set<number>
    socket: Socket
    frame: HTMLDivElement
    panZoomWrapper: HTMLDivElement
    zoomSlider: ZoomSlider
    canvRetWrapper: HTMLDivElement
    colorProvider: ColorProvider
    animationFrameIds: { updateCanvasId: number; panId: number; zoomId: number }
    canvasUpdateCallbacks: ((sectionCanvas: SectionCanvas) => void)[]
    test: number
    bufferSize: [number, number]
    canvasDefaultOffsetWrapper: HTMLDivElement

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
        canvRetWrapper: HTMLDivElement,
        colorProvider: ColorProvider,
        canvasDefaultOffsetWrapper: HTMLDivElement
    ) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')!
        this.panning = false
        this.prevPanMousePos = [-1, -1] // Could be anything
        this.startPanMousePos = [-1, -1] // As well
        this.startZoomTouch = {
            touch1: { x: -1, y: -1, id: -1 },
            touch2: { x: -1, y: -1, id: -1 },
            center: { x: -1, y: -1 },
        } // Yup
        this.prevZoomTouch = [
            { x: -1, y: -1, id: -1 },
            { x: -1, y: -1, id: -1 },
        ] // You guessed it
        this.maxZoom = maxZoom
        this.minZoom = 1
        this.normScale = scale
        this.maxNormScale = 1
        this.minNormScale = 1 / this.maxZoom
        this.zoomSlider = zoomSlider
        this.zoomSlider.min = this.minZoom
        this.zoomSlider.max = this.maxZoom
        this.zoomSlider.value = this.normScale * this.maxZoom
        this.zoomSlider.step = 1
        this.colorProvider = colorProvider
        this.desiredScale = this.normScale
        this.test = 0

        this.offset = [0, 0]
        this.contentOffset = [0, 0]
        this.reticle = reticle
        this.sections = sections
        this.subscribedSectionIds = subscribedSectionIds
        this.socket = socket
        this.frame = screenFrame
        this.panZoomWrapper = panZoomWrapper
        this.animationFrameIds = { updateCanvasId: -1, panId: -1, zoomId: -1 }
        this.canvasUpdateCallbacks = []

        const widthBufferSize = Math.ceil(screenFrame.clientWidth * 0.1)
        const heightBufferSize = Math.ceil(screenFrame.clientHeight * 0.1)
        this.bufferSize = [widthBufferSize, heightBufferSize]

        this.canvas.width = screenFrame.clientWidth + widthBufferSize * 2
        this.canvas.height = screenFrame.clientHeight + heightBufferSize * 2

        this.canvRetWrapper = canvRetWrapper
        canvRetWrapper.style.transform = `scale(${this.maxZoom})`
        this.panZoomWrapper.style.transform = `scale(${this.normScale})`

        // Position canvas in center of screenFrame
        const screenFrameBoundRect = this.frame.getBoundingClientRect()
        const canvBoundRect = this.canvas.getBoundingClientRect()
        console.log(screenFrameBoundRect)
        console.log(canvBoundRect)

        // TODO: maybe round this
        const d = [
            screenFrameBoundRect.left +
                screenFrameBoundRect.width / 2 -
                canvBoundRect.left -
                canvBoundRect.width / 2,
            screenFrameBoundRect.top +
                screenFrameBoundRect.height / 2 -
                canvBoundRect.top -
                canvBoundRect.height / 2,
        ]

        this.canvasDefaultOffset = [d[0], d[1]]
        this.canvasDefaultOffsetWrapper = canvasDefaultOffsetWrapper
        this.canvasDefaultOffsetWrapper.style.transform = `translate(${this.canvasDefaultOffset[0]}px,${this.canvasDefaultOffset[1]}px)`

        addAllInteractivityToSectionCanvas(this)

        this.zoomSlider.addInputCallback((zoomValue) => {
            const screenFrameBoundRect = this.frame.getBoundingClientRect()
            const screenCenter: [number, number] = [
                screenFrameBoundRect.left + screenFrameBoundRect.width / 2,
                screenFrameBoundRect.top + screenFrameBoundRect.height / 2,
            ]
            const factor = zoomValue / (this.normScale * this.maxZoom)
            this.zoomScreenCoords(screenCenter, factor)
            this.updateCanvas()
            //this.zoomScreenCoordsCheckScale(screenCenter, factor)
        })

        socket.on(
            'set-pixel',
            (data: { sectionId: number; pixelIdx: number; color: number }) => {
                console.log(`set-pixel: ${JSON.stringify(data)}`)
                const section = this.sections.get(data.sectionId)!
                section.setPixel(data.pixelIdx, data.color)

                const sectionPixel = section.sectionPixelIdxToSectionPixel(
                    data.pixelIdx
                )
                const canvasPixel = this.sectionToCanvasCoords(sectionPixel)

                const color = this.colorProvider.getColorById(data.color)
                if (color === undefined) return

                this.ctx.fillStyle =
                    this.colorProvider.colorToFillStyleString(color)

                this.ctx.fillRect(canvasPixel[0], canvasPixel[1], 1, 1)
            }
        )
    }

    setTransform = () => {
        this.panZoomWrapper.style.transform = `translate(${this.offset[0]}px, ${this.offset[1]}px) scale(${this.normScale})`
    }

    userSetPixel = (canvasPixel: [number, number], colorId: number) => {
        const sectionCoords = this.canvasToSectionCoords(canvasPixel)

        // TODO: maybe think about doing something more efficient here, but at the same time
        // how many concurrent subscribed sections will one have? More than 100 (even more than ~ 10)
        // for an average full hd screen seems unlikely with what I have in mind right now
        const sectionId = Array.from(this.subscribedSectionIds).find((id) => {
            const sec = this.sections.get(id)!
            return (
                sec.topLeft[0] <= sectionCoords[0] &&
                sec.topLeft[1] <= sectionCoords[1] &&
                sectionCoords[0] < sec.botRight[0] &&
                sectionCoords[1] < sec.botRight[1]
            )
        })!

        const section = this.sections.get(sectionId)!

        const sectionPixelIdx = section.sectionPxlToSectionPxlIdx(sectionCoords)

        // Set pixel in section
        section.setPixel(sectionPixelIdx, colorId)

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
        sectionIdsToRemove.forEach((id) => curSections.delete(id))
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

        //this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        this.ctx.fillStyle = this.colorProvider.colorToFillStyleString([
            100, 100, 100,
        ])
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
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
    }

    // TODO: store edges when updating active sections and remove this function
    getSectionContentEdges = () => {
        const contentTopLeft: [number, number] = [
            Number.MAX_VALUE,
            Number.MAX_VALUE,
        ]
        const contentBotRight: [number, number] = [
            Number.MIN_VALUE,
            Number.MIN_VALUE,
        ]
        this.sections.forEach((section) => {
            contentTopLeft[0] = Math.min(contentTopLeft[0], section.topLeft[0])
            contentTopLeft[1] = Math.min(contentTopLeft[1], section.topLeft[1])
            contentBotRight[0] = Math.max(
                contentBotRight[0],
                section.botRight[0]
            )
            contentBotRight[1] = Math.max(
                contentBotRight[1],
                section.botRight[1]
            )
        })

        return { contentTopLeft, contentBotRight }
    }

    sectionToCanvasPixel = (
        sectionCoords: [number, number]
    ): [number, number] => {
        const canvasCoords = this.sectionToCanvasCoords(sectionCoords)
        return [Math.floor(canvasCoords[0]), Math.floor(canvasCoords[1])]
    }

    sectionToCanvasCoords = (
        sectionCoords: [number, number]
    ): [number, number] => {
        return [
            sectionCoords[0] + this.contentOffset[0],
            sectionCoords[1] + this.contentOffset[1],
        ]
    }

    sectionToScreenCoords = (sectionCoords: [number, number]) => {
        const canvCoords = this.sectionToCanvasCoords(sectionCoords)
        return this.canvasToScreenCoords(canvCoords)
    }

    sectionToScreenPixel = (
        sectionCoords: [number, number]
    ): [number, number] => {
        const screenCoords = this.sectionToScreenCoords(sectionCoords)
        return [Math.round(screenCoords[0]), Math.round(screenCoords[1])]
    }

    canvasToSectionPixel = (canvasPixel: [number, number]) => {
        const sectionCoords = this.canvasToSectionCoords(canvasPixel)
        return [Math.floor(sectionCoords[0]), Math.floor(sectionCoords[1])]
    }

    canvasToSectionCoords = (
        canvasPixel: [number, number]
    ): [number, number] => {
        return [
            canvasPixel[0] - this.contentOffset[0],
            canvasPixel[1] - this.contentOffset[1],
        ]
    }

    // Check if we overshot
    checkContentBounds = () => {
        const { contentTopLeft, contentBotRight } =
            this.getSectionContentEdges()
        // Check whether content edge or max/min allowed scale has been reached / overstepped
        // Check edge
        // Simply check if current center is out of bounds
        const sectionPixel = this.screenToSectionPixel(this.frameCenterCoords)
        const centeredPixel = this.frameCenterCoords

        const topLeftScreenPix = this.sectionToScreenPixel(contentTopLeft)
        const botRightScreenPix = this.sectionToScreenPixel(contentBotRight)

        if (
            sectionPixel[0] < contentTopLeft[0] ||
            sectionPixel[0] >= contentBotRight[0] ||
            sectionPixel[1] < contentTopLeft[1] ||
            sectionPixel[1] >= contentBotRight[1]
        ) {
            centeredPixel[0] = Math.min(
                Math.max(centeredPixel[0], topLeftScreenPix[0]),
                botRightScreenPix[0] - 1
            )
            centeredPixel[1] = Math.min(
                Math.max(centeredPixel[1], topLeftScreenPix[1]),
                botRightScreenPix[1] - 1
            )

            this.centerScreenPixel(centeredPixel)
        }
    }

    applyOffsetDiff = (diff: [number, number]) => {
        const appliedDiff = diff //[Math.round(diff[0]), Math.round(diff[1])]

        this.offset[0] += appliedDiff[0]
        this.offset[1] += appliedDiff[1]
    }

    // TODO: add way to remove these (return unique ids)
    addUpdateCallback = (callback: (sectionCanvas: SectionCanvas) => void) => {
        this.canvasUpdateCallbacks.push(callback)
    }

    _callUpdateCallbacks = () => {
        for (const callback of this.canvasUpdateCallbacks) callback(this)
    }

    updateCanvas = () => {
        this.test++
        this.setTransform()
        this.checkContentBounds()
        this.checkOffsetBuffers()
        this.setTransform()
        this.reticle.update(this)
        this.zoomSlider.value = this.normScale * this.maxZoom
        this._callUpdateCallbacks()
    }

    checkOffsetBuffers = () => {
        const screenPixelsPerCanvasPixel = this.screenPixelsPerCanvasPixel
        const frameBoundRect = this.frame.getBoundingClientRect()

        const adjustedBufferSize = [
            this.bufferSize[0] * screenPixelsPerCanvasPixel +
                ((screenPixelsPerCanvasPixel - 1) * frameBoundRect.width) / 2,
            this.bufferSize[1] * screenPixelsPerCanvasPixel +
                ((screenPixelsPerCanvasPixel - 1) * frameBoundRect.height) / 2,
        ]

        if (
            adjustedBufferSize[0] <= Math.abs(this.offset[0]) ||
            adjustedBufferSize[1] <= Math.abs(this.offset[1])
        ) {
            // Reposition the canvas so that its center is in the center of the screenFrame again.
            // For this, we calculate the contentOffset. Because we only want to offset the content by whole pixels
            // (fractions would lead to more annoying calculations when settings pixels), we have to round here.
            const contentOffsetDiff = [
                Math.round(this.offset[0] / screenPixelsPerCanvasPixel),
                Math.round(this.offset[1] / screenPixelsPerCanvasPixel),
            ]
            this.contentOffset[0] += contentOffsetDiff[0]
            this.contentOffset[1] += contentOffsetDiff[1]

            this.drawSections()
            // In order for the panning and zooming to be smooth (without "jumps" when the canvas is repositioned),
            // we move it based on the rounded translation for the content offset
            // (Note that this avoids introducing fractional offsets)
            this.offset[0] -= contentOffsetDiff[0] * screenPixelsPerCanvasPixel
            this.offset[1] -= contentOffsetDiff[1] * screenPixelsPerCanvasPixel
        }
    }

    screenToSectionPixel = (screenPixel: [number, number]) => {
        const canvPix = this.screenToCanvasPixel(screenPixel)
        return this.canvasToSectionCoords(canvPix)
    }

    screenToSectionCoords = (screenCoords: [number, number]) => {
        return this.canvasToSectionCoords(
            this.screenToCanvasCoords(screenCoords)
        )
    }

    screenToCanvasCoords = (
        screenCoords: [number, number]
    ): [number, number] => {
        const canvBoundRect = this.canvas.getBoundingClientRect()

        const screenPixelsPerCanvasPixel = this.screenPixelsPerCanvasPixel

        const canvasCoords: [number, number] = [
            (screenCoords[0] - canvBoundRect.left) / screenPixelsPerCanvasPixel,
            (screenCoords[1] - canvBoundRect.top) / screenPixelsPerCanvasPixel,
        ]

        return canvasCoords
    }

    screenToCanvasPixel = (screenPixel: [number, number]): [number, number] => {
        const canvasCoords = this.screenToCanvasCoords(screenPixel)
        // Flooring is the correct thing to do here
        const canvasPixel: [number, number] = [
            Math.floor(canvasCoords[0]),
            Math.floor(canvasCoords[1]),
        ]
        return canvasPixel
    }

    canvasToScreenCoords = (
        canvasCoords: [number, number]
    ): [number, number] => {
        const canvBoundRect = this.canvas.getBoundingClientRect()

        const screenPixelsPerCanvasPixel = this.screenPixelsPerCanvasPixel

        const screenCoords: [number, number] = [
            canvasCoords[0] * screenPixelsPerCanvasPixel + canvBoundRect.left,
            canvasCoords[1] * screenPixelsPerCanvasPixel + canvBoundRect.top,
        ]

        return screenCoords
    }

    zoomScreenCoordsApplyEasing = (
        screenCoords: [number, number],
        factor: number,
        durationMs: number
    ) => {
        // Clear previous animation (if still active, otherwise this does nothing)
        // TODO: this assumes that all timeouts are completed before the next one is scheduled, which is actually a decently irresponsible assumption to make
        this.stopAnimation()

        // Factor to apply at every step
        const goalDesiredScale = this.desiredScale * factor

        let start = -1
        const _zoomScreenCoordsEasingRec = (time: number) => {
            if (start == -1) start = time

            const progress = Math.min(time - start, durationMs) / durationMs

            this.zoomScreenCoords(
                screenCoords,
                goalDesiredScale / factor ** (1 - progress) / this.desiredScale // (want)/(sectionCanvas.desiredScale (=have))
            )
            this.updateCanvas() // TODO: use requestAnimationFrame with this as well

            if (progress >= 1) return
            this.animationFrameIds.zoomId = requestAnimationFrame(
                _zoomScreenCoordsEasingRec
            )
        }

        requestAnimationFrame(_zoomScreenCoordsEasingRec)
    }

    zoomScreenCoords = (screenCoords: [number, number], factor: number) => {
        this.setTransform()
        const canvBoundRect = this.canvas.getBoundingClientRect()
        // Pixels from zoomPoint to canvas center
        const diffToCenter = [
            canvBoundRect.left + canvBoundRect.width / 2 - screenCoords[0],
            canvBoundRect.top + canvBoundRect.height / 2 - screenCoords[1],
        ]

        this.desiredScale = this.clampScale(this.desiredScale * factor)
        const newScale = this.clampScale(
            Math.round(this.desiredScale * this.maxZoom) / this.maxZoom
        )
        const actualFactor = newScale / this.normScale
        this.normScale = newScale

        const translation: [number, number] = [
            Math.round(diffToCenter[0] * (actualFactor - 1)),
            Math.round(diffToCenter[1] * (actualFactor - 1)),
        ]
        this.applyOffsetDiff(translation)
    }

    clampScale = (scale: number) => {
        return Math.min(Math.max(scale, this.minNormScale), this.maxNormScale)
    }

    clampZoomFactor = (factor: number) => {
        if (this.normScale * factor > this.maxNormScale)
            factor = this.maxNormScale / this.normScale
        else if (this.normScale * factor < this.minNormScale)
            factor = this.minNormScale / this.normScale
    }

    stopAnimation = () => {
        cancelAnimationFrame(this.animationFrameIds.updateCanvasId)
        cancelAnimationFrame(this.animationFrameIds.panId)
        cancelAnimationFrame(this.animationFrameIds.zoomId)
    }

    // We are using section coordinates in this function because they stay
    // "constant" throughout the interaction. Screenpixels will change
    // relative to the pixels of the canvas, and even the canvas itself (and
    // therefore the values of its pixels) might move (because of the canvas
    // offset mechanism)
    centerCanvasPixelApplyEasing = (
        canvasPixel: [number, number],
        durationMs: number
    ) => {
        // Clear previous animation (if still active, otherwise this does nothing)
        // TODO: this assumes that all timeouts are completed before the next one is scheduled, which is actually a decently irresponsible assumption to make
        this.stopAnimation()
        // TODO: does not respect screenFrame - see TODO somwhere below
        const screenFrameBoundRect = this.frame.getBoundingClientRect()
        const startSectionCoords: [number, number] = this.canvasToSectionCoords(
            this.screenToCanvasCoords([
                screenFrameBoundRect.left + screenFrameBoundRect.width / 2,
                screenFrameBoundRect.top + screenFrameBoundRect.height / 2,
            ])
        )

        const goalSectionCoords = this.canvasToSectionCoords(canvasPixel)
        goalSectionCoords[0] += 0.5 // Want to center the center of the section pixel
        goalSectionCoords[1] += 0.5

        // TODO: maybe also recalculate this diff so that we can zoom and center simultaneously
        const diff = [
            goalSectionCoords[0] - startSectionCoords[0],
            goalSectionCoords[1] - startSectionCoords[1],
        ]

        let start = -1
        const _centerCanvasPixelEasingRec = (time: number) => {
            if (start == -1) start = time
            const progress = Math.min(time - start, durationMs) / durationMs

            const next: [number, number] = [
                startSectionCoords[0] + diff[0] * progress,
                startSectionCoords[1] + diff[1] * progress,
            ]

            this.centerSectionCoords(next)
            this.updateCanvas()

            if (progress >= 1) return
            this.animationFrameIds.panId = requestAnimationFrame(
                _centerCanvasPixelEasingRec
            )
        }

        requestAnimationFrame(_centerCanvasPixelEasingRec)
    }

    centerCanvasPixel = (canvasPixel: [number, number]) => {
        //if (canvasPixel[0] < 0) return
        const topLeftScreenPixelOfCanvasPixel =
            this.canvasToScreenCoords(canvasPixel)
        // Pixel which should be centered
        const screenPixelsPerCanvasPixel = this.screenPixelsPerCanvasPixel

        const targetScreenPixel: [number, number] = [
            topLeftScreenPixelOfCanvasPixel[0] + screenPixelsPerCanvasPixel / 2,
            topLeftScreenPixelOfCanvasPixel[1] + screenPixelsPerCanvasPixel / 2,
        ]

        this.centerScreenPixel(targetScreenPixel)
    }

    centerSectionCoords = (sectionCoords: [number, number]) => {
        // Convert to screenPixel
        const screenPixel = this.canvasToScreenCoords(
            this.sectionToCanvasCoords(sectionCoords)
        )
        this.centerScreenPixel(screenPixel)
    }

    centerScreenPixel = (targetScreenPixel: [number, number]) => {
        const screenFrameBoundRect = this.frame.getBoundingClientRect()
        const diffToScreenCenter = [
            screenFrameBoundRect.left +
                screenFrameBoundRect.width / 2 -
                targetScreenPixel[0],
            screenFrameBoundRect.top +
                screenFrameBoundRect.height / 2 -
                targetScreenPixel[1],
        ]
        diffToScreenCenter[0] = Math.round(diffToScreenCenter[0])
        diffToScreenCenter[1] = Math.round(diffToScreenCenter[1])

        this.offset[0] += diffToScreenCenter[0]
        this.offset[1] += diffToScreenCenter[1]
    }

    get screenPixelsPerCanvasPixel() {
        return this.normScale * this.maxZoom
    }

    get frameCenterCoords(): [number, number] {
        const screenFrameBoundRect = this.frame.getBoundingClientRect()
        return [
            screenFrameBoundRect.left + screenFrameBoundRect.width / 2,
            screenFrameBoundRect.top + screenFrameBoundRect.height / 2,
        ]
    }
}
