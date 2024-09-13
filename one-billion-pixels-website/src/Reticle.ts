import { SectionCanvas } from './SectionCanvas'

export class Reticle {
    screenPixel: [number, number]
    htmlElement: HTMLElement
    constructor(
        htmlElement: HTMLElement,
        virtualPixel: [number, number] = [0, 0]
    ) {
        this.screenPixel = virtualPixel
        this.htmlElement = htmlElement
    }

    // TODO: think about making reticle a bit more "sticky"
    // Update size of reticle and snap reticle's position to pixel closest to screen center
    update = (sectionCanvas: SectionCanvas) => {
        const screenCenter: [number, number] = [
            sectionCanvas.canvas.width / 2,
            sectionCanvas.canvas.height / 2,
        ]
        const pixelValues = sectionCanvas.screenToVirtualSpace(
            [screenCenter],
            sectionCanvas
        )[0]
        // Round to nearest
        pixelValues[0] = Math.round(pixelValues[0])
        pixelValues[1] = Math.round(pixelValues[1])

        // Convert coordinates of that virtual pixel to screen space
        const screenPixelCoords = sectionCanvas.virtualToScreenSpaceIntegers([
            pixelValues,
        ])[0]
        screenPixelCoords[0] = screenPixelCoords[0] - sectionCanvas.scale
        screenPixelCoords[1] = screenPixelCoords[1] - sectionCanvas.scale
        this.screenPixel = screenPixelCoords
        // Update size of reticle and move it to this position
        this.htmlElement.style.width = `${sectionCanvas.scale}px`
        this.htmlElement.style.height = `${sectionCanvas.scale}px`
        this.htmlElement.style.left = `${screenPixelCoords[0]}px`
        this.htmlElement.style.top = `${screenPixelCoords[1]}px`
    }
}
