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
    colorProvider: ColorProvider

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
        colorProvider: ColorProvider
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
        this.minZoom = 1 / devicePixelRatio
        this.scale = scale / devicePixelRatio
        this.maxScale = 1
        this.minScale = 1 / (this.maxZoom * devicePixelRatio)
        this.zoomSlider = zoomSlider
        this.zoomSlider.min = this.minZoom
        this.zoomSlider.max = this.maxZoom
        this.zoomSlider.value = this.scale * this.maxZoom
        this.zoomSlider.step = 0.01
        this.colorProvider = colorProvider

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

        this.canvas.width =
            (screenFrame.clientWidth + widthBufferSize * 2) * devicePixelRatio
        this.canvas.height =
            (screenFrame.clientHeight + heightBufferSize * 2) * devicePixelRatio

        this.canvRetWrapper = canvRetWrapper
        canvRetWrapper.style.transform = `scale(${this.maxZoom})`

        addAllInteractivityToSectionCanvas(this)

        this.zoomSlider.addInputCallback((zoomValue) => {
            const screenFrameBoundRect =
                this.screenFrame.getBoundingClientRect()
            const screenCenter: [number, number] = [
                screenFrameBoundRect.left + screenFrameBoundRect.width / 2,
                screenFrameBoundRect.top + screenFrameBoundRect.height / 2,
            ]
            const factor = zoomValue / (this.scale * this.maxZoom)
            this.zoomInto(screenCenter, factor)
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

        //// Update reticle
        //this.reticle.update(this)
    }

    getSectionContentEdges = () => {
        // Get topleft active section
        const activeSections = Array.from(this.subscribedSectionIds).map(
            (id) => this.sections.get(id)!
        )

        const contentTopLeft: [number, number] = [
            Number.MAX_VALUE,
            Number.MAX_VALUE,
        ]
        const contentBotRight: [number, number] = [
            Number.MIN_VALUE,
            Number.MIN_VALUE,
        ]
        activeSections.forEach((section) => {
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

    sectionToCanvasCoords = (
        sectionCoords: [number, number]
    ): [number, number] => {
        return [
            sectionCoords[0] + this.contentOffset[0],
            sectionCoords[1] + this.contentOffset[1],
        ]
    }

    canvasToSectionCoords = (
        canvasPixel: [number, number]
    ): [number, number] => {
        return [
            canvasPixel[0] - this.contentOffset[0],
            canvasPixel[1] - this.contentOffset[1],
        ]
    }

    applyOffsetDiffCheckBounds = (diff: [number, number]) => {
        const { contentTopLeft, contentBotRight } =
            this.getSectionContentEdges()

        const canvBoundRect = this.canvas.getBoundingClientRect()
        const screenFrameBoundRect = this.screenFrame.getBoundingClientRect()

        const screenFrameToCanvasTopLeft = [
            canvBoundRect.left - screenFrameBoundRect.left,
            canvBoundRect.top - screenFrameBoundRect.top,
        ]
        const screenFrameToCanvasBotRight = [
            canvBoundRect.right - screenFrameBoundRect.right,
            canvBoundRect.bottom - screenFrameBoundRect.bottom,
        ]

        const canvasToSectionTopLeft =
            this.sectionToCanvasCoords(contentTopLeft)
        canvasToSectionTopLeft[0] *= this.screenPixelsPerCanvasPixel // Convert to screen pixel units
        canvasToSectionTopLeft[1] *= this.screenPixelsPerCanvasPixel

        const canvasToSectionBotRight =
            this.sectionToCanvasCoords(contentBotRight)
        canvasToSectionBotRight[0] -= this.canvas.width // In this approach we effectively make the canvas' bottom right the origin
        canvasToSectionBotRight[1] -= this.canvas.height // TODO: look at this again
        canvasToSectionBotRight[0] *= this.screenPixelsPerCanvasPixel
        canvasToSectionBotRight[1] *= this.screenPixelsPerCanvasPixel

        const screenFrameToSectionTopLeft = [
            screenFrameToCanvasTopLeft[0] + canvasToSectionTopLeft[0],
            screenFrameToCanvasTopLeft[1] + canvasToSectionTopLeft[1],
        ]
        const screenFrameToSectionBotRight = [
            screenFrameToCanvasBotRight[0] + canvasToSectionBotRight[0],
            screenFrameToCanvasBotRight[1] + canvasToSectionBotRight[1],
        ]

        // This reflects the maximum (screen pixel) size that the boundary around the canvas can take up on the screen
        // - 0.1 to avoid overshoot when panning/zooming at the edges of the section content. Note that on displays
        // with a ridiculously high devicePixelRatio (suspect 5 and above) this might lead to issues, namely that
        // when zoomed out to minZoom (i.e. as far as possible) the pixels on the edges could not be centered
        // anymore; Similarly, zooming out from an edge-pixel and then zooming in again would lead to the pixel
        // next to it (towards the screen center) being focused, rather than the original edge pixel
        // If this becomes a serious issue give it a look again, for now this appears to be an adequate fix
        const canvasBoundarySize = [
            screenFrameBoundRect.width / 2 - 0.1,
            screenFrameBoundRect.height / 2 - 0.1,
        ]

        // TODO: this overshoots a bit when at the edge, probably because of numerical inaccuracies
        // This can probably be fixed by introducing a 1 pixel "inset" towards the canvas center
        // or something along those lines
        if (screenFrameToSectionTopLeft[0] + diff[0] >= canvasBoundarySize[0])
            diff[0] = canvasBoundarySize[0] - screenFrameToSectionTopLeft[0]
        if (screenFrameToSectionTopLeft[1] + diff[1] >= canvasBoundarySize[1])
            diff[1] = canvasBoundarySize[1] - screenFrameToSectionTopLeft[1]
        if (screenFrameToSectionBotRight[0] + diff[0] <= -canvasBoundarySize[0])
            diff[0] = -canvasBoundarySize[0] - screenFrameToSectionBotRight[0]
        if (screenFrameToSectionBotRight[1] + diff[1] <= -canvasBoundarySize[1])
            diff[1] = -canvasBoundarySize[1] - screenFrameToSectionBotRight[1]

        this.offset[0] += diff[0]
        this.offset[1] += diff[1]
    }

    setCanvasTransform = () => {
        this.checkBuffers()
        this.panZoomWrapper.style.transform = `translate(${this.offset[0]}px, ${this.offset[1]}px) scale(${this.scale})`
        this.reticle.update(this)
        this.zoomSlider.value = this.scale * this.maxZoom
    }

    checkBuffers = () => {
        const canvas = this.canvas
        const screenPixelsPerCanvasPixel = this.screenPixelsPerCanvasPixel

        if (
            (screenPixelsPerCanvasPixel * canvas.width) / 2 -
                this.screenFrame.clientWidth / 2 -
                this.offset[0] <=
                0 ||
            (screenPixelsPerCanvasPixel * canvas.width) / 2 -
                this.screenFrame.clientWidth / 2 +
                this.offset[0] <=
                0 ||
            (screenPixelsPerCanvasPixel * canvas.height) / 2 -
                this.screenFrame.clientHeight / 2 -
                this.offset[1] <=
                0 ||
            (screenPixelsPerCanvasPixel * canvas.height) / 2 -
                this.screenFrame.clientHeight / 2 +
                this.offset[1] <=
                0
        ) {
            // Reposition the canvas so that it's center is in the center of the screenFrame again.
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
            this.offset[0] -= contentOffsetDiff[0] * screenPixelsPerCanvasPixel
            this.offset[1] -= contentOffsetDiff[1] * screenPixelsPerCanvasPixel
        }
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
        canvasPixel: [number, number]
    ): [number, number] => {
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
        const translation: [number, number] = [
            diffToCenter[0] * (factor - 1),
            diffToCenter[1] * (factor - 1),
        ]

        translation[0] = translation[0]
        translation[1] = translation[1]

        this.scale *= factor
        this.setCanvasTransform() // TODO: Clean this up. Because we are using clientBoundingRects
        // in the applyOffsetDiff function, they have to be up to date -> the scale has to be set.
        this.applyOffsetDiffCheckBounds(translation)
        this.setCanvasTransform()
    }

    get screenPixelsPerCanvasPixel() {
        return this.scale * this.maxZoom
    }

    centerCanvasPixelCheckBounds = (canvasPixel: [number, number]) => {
        this.centerCanvasPixelCheckBoundsApplyEasing(canvasPixel, 0, 1)
    }

    centerCanvasPixelCheckBoundsApplyEasing = (
        canvasPixel: [number, number],
        easingDuration: number,
        easingSteps: number
    ) => {
        const { contentTopLeft, contentBotRight } =
            this.getSectionContentEdges()

        const topLeftInCanvasCoords = this.sectionToCanvasCoords(contentTopLeft)
        const botRightInCanvasCoords =
            this.sectionToCanvasCoords(contentBotRight)

        canvasPixel[0] = Math.max(canvasPixel[0], topLeftInCanvasCoords[0])
        canvasPixel[1] = Math.max(canvasPixel[1], topLeftInCanvasCoords[1])
        canvasPixel[0] = Math.min(canvasPixel[0], botRightInCanvasCoords[0] - 1) // Remember that botRight is exclusive
        canvasPixel[1] = Math.min(canvasPixel[1], botRightInCanvasCoords[1] - 1)
        this.centerCanvasPixelApplyEasing(
            canvasPixel,
            easingDuration,
            easingSteps
        )
    }

    // We are using section coordinates in this function because they stay
    // "constant" throughout the interaction. Screenpixels will change
    // relative to the pixels of the canvas, and even the canvas itself (and
    // therefore the values of its pixels) might move (because of the canvas
    // offset mechanism)
    centerCanvasPixelApplyEasing = (
        canvasPixel: [number, number],
        durationMs: number,
        steps: number
    ) => {
        // TODO: does not respect screenFrame - see TODO somwhere below
        const screenFrameBoundRect = this.screenFrame.getBoundingClientRect()
        const startSectionCoords: [number, number] = this.canvasToSectionCoords(
            this.screenToCanvasCoords([
                screenFrameBoundRect.left + screenFrameBoundRect.width / 2,
                screenFrameBoundRect.top + screenFrameBoundRect.height / 2,
            ])
        )

        const goalSectionCoords = this.canvasToSectionCoords(canvasPixel)
        goalSectionCoords[0] += 0.5 // Want to center the center of the section pixel
        goalSectionCoords[1] += 0.5

        const diff = [
            goalSectionCoords[0] - startSectionCoords[0],
            goalSectionCoords[1] - startSectionCoords[1],
        ]

        const delay = durationMs / steps

        const _centerCanvasPixelEasingRec = (step: number) => {
            if (step > steps) return

            const next: [number, number] = [
                startSectionCoords[0] + (diff[0] * step) / steps,
                startSectionCoords[1] + (diff[1] * step) / steps,
            ]

            this.centerSectionCoords(next)

            setTimeout(() => _centerCanvasPixelEasingRec(step + 1), delay)
        }

        _centerCanvasPixelEasingRec(1) // Step from 1 to steps
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
        screenPixel[0]
        screenPixel[1]
        this.centerScreenPixel(screenPixel)
    }

    centerScreenPixel = (targetScreenPixel: [number, number]) => {
        const screenFrameBoundRect = this.screenFrame.getBoundingClientRect()
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
        this.setCanvasTransform()
    }
}
