import { SectionCanvas } from './SectionCanvas'

export interface SectionAttributes {
    topLeft: [number, number]
    botRight: [number, number]
    id: number
}

export class Section implements SectionAttributes {
    topLeft: [number, number]
    botRight: [number, number]
    width: number
    height: number
    id: number
    data: Uint8Array
    imgData: ImageData

    constructor(
        topLeft: [number, number],
        botRight: [number, number],
        id: number
    ) {
        this.topLeft = topLeft
        this.botRight = botRight
        this.id = id
        this.width = this.botRight[0] - this.topLeft[0]
        this.height = this.botRight[1] - this.topLeft[1]
        this.data = new Uint8Array(1) // Empty default
        this.imgData = new ImageData(1, 1) // Empty default
    }

    sectionPxlToSectionPxlIdx = (sectionPixel: [number, number]) => {
        return (
            (sectionPixel[1] - this.topLeft[1]) * this.width +
            (sectionPixel[0] - this.topLeft[0])
        )
    }

    sectionPixelIdxToSectionPixel = (sectionPixelIdx: number) => {
        const x = sectionPixelIdx % this.width
        const y = (sectionPixelIdx - x) / this.width
        return [x, y]
    }

    drawOnSectionCanvas = (sectionCanvas: SectionCanvas) => {
        sectionCanvas.ctx.putImageData(
            this.imgData,
            this.topLeft[0] + sectionCanvas.contentOffset[0],
            this.topLeft[1] + sectionCanvas.contentOffset[1]
        )
    }

    setData = (data: Uint8Array) => {
        this.data = data
        const imgData = new ImageData(this.width, this.height)

        let imgDataIdx = 0
        //console.log(data.length)

        let white = 0
        let black = 0
        for (let i = 0; i < this.data.length; i++) {
            const byte = this.data[i]
            for (let j = 0; j < 8; j++) {
                const bit = (byte >> (7 - j)) & 1
                const color = bit == 1 ? 255 : 0
                if (color == 0) black++
                else white++
                imgData.data[imgDataIdx] = color
                imgData.data[imgDataIdx + 1] = color + this.id * 2 // Color offset for debugging purposes
                imgData.data[imgDataIdx + 2] = color + this.id * 2
                imgData.data[imgDataIdx + 3] = 255
                imgDataIdx += 4
            }
        }
        //console.log(`white: ${white}, black: ${black}`)
        this.imgData = imgData
    }

    // TODO: work with color provider here, make this flexible, i.e. allow for colors with variable nr of bits
    setPixel = (section: Section, pixelIdx: number, colorId: number) => {
        // Set bit in data
        const byteIdx = Math.floor(pixelIdx / 8)
        const bitIdx = pixelIdx % 8
        if (colorId == 0) section.data[byteIdx] &= 255 ^ ((1 << 7) >> bitIdx)
        else section.data[byteIdx] |= (1 << 7) >> bitIdx
        // Set bit in imgData
        if (colorId == 1) colorId = 255
        this.imgData.data[pixelIdx * 4] = colorId
        this.imgData.data[pixelIdx * 4 + 1] = colorId
        this.imgData.data[pixelIdx * 4 + 2] = colorId
    }
}
