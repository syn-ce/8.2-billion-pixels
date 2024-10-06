import { SectionCanvas } from './SectionCanvas'

export class Reticle {
    htmlElement: HTMLElement
    wrapper: HTMLDivElement
    curCanvasPixel: [number, number] // The coordinates of the canvas pixel the reticle is currently positioned on
    constructor(htmlElement: HTMLElement, wrapper: HTMLDivElement) {
        this.htmlElement = htmlElement
        this.wrapper = wrapper
        this.curCanvasPixel = [0, 0] // Random defaults
    }

    update(sectionCanvas: SectionCanvas) {
        // Get center
        const frameCenter = sectionCanvas.frameCenterCoords
        // Nudge towards right to avoid overshoot on left edge (will be floored (will be floored))
        frameCenter[0] += 0.00001
        frameCenter[1] += 0.00001

        const canvasCoords = sectionCanvas.screenToCanvasPixel(frameCenter)
        this.curCanvasPixel = [canvasCoords[0], canvasCoords[1]]

        const translation = [canvasCoords[0], canvasCoords[1]]

        this.wrapper.style.transform = `translate(${translation[0]}px, ${translation[1]}px)`
    }
}
