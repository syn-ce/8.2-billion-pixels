import { SectionCanvas } from './SectionCanvas'

export class Reticle {
    screenPixel: [number, number]
    htmlElement: HTMLElement
    wrapper: HTMLDivElement
    constructor(
        htmlElement: HTMLElement,
        virtualPixel: [number, number] = [0, 0],
        wrapper: HTMLDivElement
    ) {
        this.screenPixel = virtualPixel
        this.htmlElement = htmlElement
        this.wrapper = wrapper
    }

    update(sectionCanvas: SectionCanvas) {
        // Get center
        const canvBoundRect = sectionCanvas.canvas.getBoundingClientRect()
        const frameBoundRect = sectionCanvas.screenFrame.getBoundingClientRect()

        const screenPixelsPerCanvasPixel =
            sectionCanvas.scale * sectionCanvas.maxZoom

        const frameCenter = [
            frameBoundRect.left + frameBoundRect.width / 2,
            frameBoundRect.top + frameBoundRect.height / 2,
        ]

        // Translate frame center into canvas coordinates (not section-coords, but actual canvas coords)
        const canvasCoords = [
            (frameCenter[0] - canvBoundRect.left) / screenPixelsPerCanvasPixel,
            (frameCenter[1] - canvBoundRect.top) / screenPixelsPerCanvasPixel,
        ]

        // Round to nearest pixel
        canvasCoords[0] = Math.round(canvasCoords[0])
        canvasCoords[1] = Math.round(canvasCoords[1])

        const screenCoords = [
            (canvasCoords[0] * screenPixelsPerCanvasPixel -
                canvBoundRect.width / 2) /
                sectionCanvas.scale +
                sectionCanvas.canvas.width / 2,
            (canvasCoords[1] * screenPixelsPerCanvasPixel -
                canvBoundRect.height / 2) /
                sectionCanvas.scale -
                sectionCanvas.canvas.height / 2,
        ]

        // Need to offset by half of a canvas-pixel's size (which will equal half of reticle's size)
        // TODO: this assumes that the minZoom is 1 and the scale is adjusted accordingly (minScale 1 / maxZoom, maximum 1)
        screenCoords[0] += sectionCanvas.maxZoom / 2
        screenCoords[1] += sectionCanvas.maxZoom / 2

        this.wrapper.style.transform = `translate(${screenCoords[0]}px, ${screenCoords[1]}px)`
    }
}
