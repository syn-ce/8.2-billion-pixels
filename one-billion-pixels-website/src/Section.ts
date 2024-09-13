import { SectionCanvas } from './SectionCanvas'

export interface SectionAttributes {
    topLeft: [number, number]
    botRight: [number, number]
    id: number
    data: Uint8Array
}

export class Section implements SectionAttributes {
    topLeft: [number, number]
    botRight: [number, number]
    id: number
    data: Uint8Array
    topLeftScreenSpace: [number, number]
    botRightScreenSpace: [number, number]

    constructor(
        topLeft: [number, number],
        botRight: [number, number],
        id: number,
        data: Uint8Array
    ) {
        this.topLeft = topLeft
        this.botRight = botRight
        this.id = id
        this.data = data
        this.topLeftScreenSpace = [-1, -1]
        this.botRightScreenSpace = [-1, -1]
    }

    setPixel = (section: Section, pixelIdx: number, color: number) => {
        const byteIdx = Math.floor(pixelIdx / 8)
        const bitIdx = pixelIdx % 8

        if (color == 0) section.data[byteIdx] &= 255 ^ ((1 << 7) >> bitIdx)
        else section.data[byteIdx] |= (1 << 7) >> bitIdx
    }

    updateSectionScreenSpace = (sectionCanvas: SectionCanvas) => {
        const [topLeft, botRight] = sectionCanvas.virtualToScreenSpaceIntegers([
            this.topLeft,
            this.botRight,
        ])
        this.botRightScreenSpace = botRight
        this.topLeftScreenSpace = topLeft
    }

    drawOntoSectionCanvas = (sectionCanvas: SectionCanvas) => {
        let section: Section = this
        const virtualSectionWidth = section.botRight[0] - section.topLeft[0]
        const virtualSectionHeight = section.botRight[1] - section.topLeft[1]

        this.updateSectionScreenSpace(sectionCanvas)
        const bytes = section.data
        if (bytes === undefined)
            console.error(
                `You are trying to draw section ${section.id}, but its data is undefined. Fetch it before drawing the section.`
            )

        const widthOnScreen =
            section.botRightScreenSpace[0] - section.topLeftScreenSpace[0] //* devicePixelRatio
        const heightOnScreen =
            section.botRightScreenSpace[1] - section.topLeftScreenSpace[1] //* devicePixelRatio

        const imgData = sectionCanvas.ctx.createImageData(
            widthOnScreen,
            heightOnScreen
        )
        const screenPixelsPerPixel = sectionCanvas.scale // Makes assumption about relation between scale and pixels
        let idxOffset = 7
        let bytesIdx = 0
        let count = 0

        const counts = []
        for (let i = 0; i < 10000; i++) counts.push(0)
        let bit = 0
        for (let row = 0; row < virtualSectionHeight; row++) {
            for (let col = 0; col < virtualSectionWidth; col++) {
                let bits = bytes[bytesIdx]
                bit = (bits >> idxOffset) & 1
                counts[bytesIdx]++
                idxOffset--
                if (idxOffset == -1) {
                    idxOffset = 7
                    bytesIdx++
                }
                let color = bit == 1 ? 255 : 0
                for (let i = 0; i < screenPixelsPerPixel; i++) {
                    //if (row + i >= rows) break
                    for (let j = 0; j < screenPixelsPerPixel; j++) {
                        count++
                        //if (col + j >= cols) break
                        let idx =
                            (row * virtualSectionWidth * screenPixelsPerPixel +
                                col) *
                                4 *
                                screenPixelsPerPixel +
                            j * 4 +
                            i * virtualSectionWidth * 4 * screenPixelsPerPixel
                        imgData.data[idx] = color
                        imgData.data[idx + 1] = color + section.id * 10
                        imgData.data[idx + 2] = color + section.id * 10
                        imgData.data[idx + 3] = 255
                    }
                }
            }
        }

        sectionCanvas.ctx.putImageData(
            imgData,
            section.topLeftScreenSpace[0],
            section.topLeftScreenSpace[1]
        )
    }
}
