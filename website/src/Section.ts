import { SectionData } from './SectionData'
import { ColorProvider } from './ColorPicker'
import { SectionCanvas } from './SectionCanvas'
import { fetchSectionData } from './requests'

export interface SectionAttributes {
    topLeft: [number, number]
    botRight: [number, number]
    id: number
}

export interface SectionConfig {
    sections: SectionAttributes[]
    bitsPerPixel: number
    position: [number, number]
}

export class Section implements SectionAttributes {
    topLeft: [number, number]
    botRight: [number, number]
    sectionData: SectionData
    width: number
    height: number
    id: number
    bitsPerPixel: number
    imgData: ImageData | null
    colorProvider: ColorProvider
    alreadyDrawing: boolean // Indicates whether section is currently drawing itself; If so, new draw calls will be ignored

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
        this.imgData = null // Empty default
        this.alreadyDrawing = false

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
        return [x + this.topLeft[0], y + this.topLeft[1]]
    }

    // Maybe allow to manage multiple canvases and only set to null if all of them unsubscribe (?)
    // TODO: maybe rethink who manages updates etc
    resetImageData = () => {
        this.imgData = null
    }

    getImageData = async (): Promise<ImageData> => {
        if (this.imgData == null) {
            // fetch if required
            this.setData(await fetchSectionData(this.id))
        }
        return this.imgData!
    }

    // Tell it to draw itself; If required, fetches data; If it's already in the process of drawing (fetching), does nothing.
    // TODO: maybe allow cancellation
    drawOnSectionCanvas = async (sectionCanvas: SectionCanvas) => {
        if (this.alreadyDrawing) return // Avoid multiple simultaneous draws (no need/use for them); The latest one will draw up to date
        this.alreadyDrawing = true
        const data = await this.getImageData()
        const canvasPixel = sectionCanvas.sectionToCanvasCoords(this.topLeft) // Calculate position AFTER fetching data
        sectionCanvas.ctx.putImageData(data, canvasPixel[0], canvasPixel[1])
        this.alreadyDrawing = false
    }

    setData = (data: Uint8Array) => {
        const imgData = new ImageData(this.width, this.height)

        this.sectionData.data = data

        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                const colorId = this.sectionData.getPixelColorId(x, y)
                let color = this.colorProvider!.getColorById(colorId)
                if (color === undefined) {
                    console.error(
                        `ColorProvider was asked for unknown color: id=${colorId}`
                    )
                    color = this.colorProvider!.getColorById(0)! // Resort to "default" color
                }
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
