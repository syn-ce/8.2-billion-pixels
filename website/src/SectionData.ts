export class SectionData {
    data: Uint8Array | undefined
    width: number
    height: number
    bitsPerPixel: number

    constructor(
        data: Uint8Array | undefined,
        width: number,
        height: number,
        bitsPerPixel: number
    ) {
        this.data = data
        this.width = width
        this.height = height
        this.bitsPerPixel = bitsPerPixel
    }

    // TODO: optimize this
    getPixelColorId(xIdx: number, yIdx: number): number {
        const bitIdx = (yIdx * this.width + xIdx) * this.bitsPerPixel
        // Take bitsPerPixel bits, starting at bitIdx
        let num = 0
        for (let i = bitIdx; i < bitIdx + this.bitsPerPixel; i++) {
            const byteIdx = Math.floor(i / 8)
            const bitInByteIdx = i % 8
            const bit = (this.data![byteIdx] >> (7 - bitInByteIdx)) & 1

            num = num * 2 + bit
        }
        return num
    }

    setPixelColorId(xIdx: number, yIdx: number, colorId: number) {
        const bitIdx = (yIdx * this.width + xIdx) * this.bitsPerPixel
        // Take bitsPerPixel bits, starting at bitIdx

        for (let i = bitIdx + this.bitsPerPixel - 1; i > bitIdx - 1; i--) {
            const byteIdx = Math.floor(bitIdx / 8)
            const bitInByteIdx = i % 8
            const bit = (colorId >> (bitIdx + this.bitsPerPixel - 1 + i)) & 1 // (this.data![byteIdx] >> (7 - bitInByteIdx)) & 1

            if (bit == 0)
                this.data![byteIdx] &= 255 ^ ((1 << 7) >> bitInByteIdx)
            else this.data![byteIdx] |= (1 << 7) >> bitInByteIdx
        }
    }
}
