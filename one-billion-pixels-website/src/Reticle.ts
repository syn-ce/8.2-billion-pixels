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
        const frameBoundRect = sectionCanvas.screenFrame.getBoundingClientRect()

        const frameCenter: [number, number] = [
            frameBoundRect.left + frameBoundRect.width / 2,
            frameBoundRect.top + frameBoundRect.height / 2,
        ]

        // Get Canvas pixel coordinates
        const canvasCoords = sectionCanvas.screenToCanvasPixel(frameCenter)
        this.curCanvasPixel = [canvasCoords[0], canvasCoords[1]]

        const translation = [canvasCoords[0], canvasCoords[1]]

        this.wrapper.style.transform = `translate(${translation[0]}px, ${translation[1]}px)`
    }
}
