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
}
