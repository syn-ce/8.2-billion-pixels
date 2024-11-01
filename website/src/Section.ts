import { SectionData } from './SectionData'
import { ColorProvider } from './ColorPicker'
import { SectionCanvas } from './SectionCanvas'

export interface SectionAttributes {
    topLeft: [number, number]
    botRight: [number, number]
    id: number
}

export class Section implements SectionAttributes {
    topLeft: [number, number]
    botRight: [number, number]
    sectionData: SectionData
    width: number
    height: number
    id: number
    bitsPerPixel: number
    imgData: ImageData | undefined
    colorProvider: ColorProvider

    constructor(
        topLeft: [number, number],
        botRight: [number, number],
        id: number,
        bitsPerPixel: number,
        colorProvider: ColorProvider
    ) {
        this.topLeft = topLeft
        this.botRight = botRight
        this.id = id
        this.width = this.botRight[0] - this.topLeft[0]
        this.height = this.botRight[1] - this.topLeft[1]
        this.bitsPerPixel = bitsPerPixel
        this.colorProvider = colorProvider
        this.imgData = undefined // Empty default

        this.sectionData = new SectionData(
            undefined,
            this.width,
            this.height,
            this.bitsPerPixel
        )
    }

    sectionPxlToSectionPxlIdx = (sectionPixel: [number, number]) => {
        return (
            (sectionPixel[1] - this.topLeft[1]) * this.width +
            (sectionPixel[0] - this.topLeft[0])
        )
    }

    sectionPixelIdxToSectionPixel = (
        sectionPixelIdx: number
    ): [number, number] => {
        const x = sectionPixelIdx % this.width
        const y = (sectionPixelIdx - x) / this.width
        return [x, y]
    }

    drawOnSectionCanvas = (sectionCanvas: SectionCanvas) => {
        const canvasPixel = sectionCanvas.sectionToCanvasCoords(this.topLeft)
        sectionCanvas.ctx.putImageData(
            this.imgData!,
            canvasPixel[0],
            canvasPixel[1]
        )
    }

    setData = (data: Uint8Array) => {
        const imgData = new ImageData(this.width, this.height)

        this.sectionData.data = data

        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                const colorId = this.sectionData.getPixelColorId(x, y)
                const color = this.colorProvider!.getColorById(colorId)
                if (color === undefined)
                    throw Error(
                        `ColorProvider was asked for unknown color: id=${colorId}`
                    )
                const idx = y * this.width + x
                imgData.data[idx * 4 + 0] = color[0]
                imgData.data[idx * 4 + 1] = color[1]
                imgData.data[idx * 4 + 2] = color[2]
                imgData.data[idx * 4 + 3] = 255
            }
        }
        this.imgData = imgData
    }

    setPixel = (pixelIdx: number, colorId: number) => {
        const x = pixelIdx % this.width
        const y = (pixelIdx - x) / this.width

        const color = this.colorProvider.getColorById(colorId)
        if (color == undefined)
            throw new Error(
                `ColorProvider was asked for unknown color: id=${colorId}`
            )

        // TODO: put imgData into sectionData
        // Set bit in section data
        this.sectionData.setPixelColorId(x, y, colorId)

        // Set bit in image data
        this.imgData!.data[pixelIdx * 4] = color[0]
        this.imgData!.data[pixelIdx * 4 + 1] = color[1]
        this.imgData!.data[pixelIdx * 4 + 2] = color[2]
    }
}
