import { decompress } from 'lz4js'
import { ColorChoice } from './ColorPicker'
import { SectionAttributes } from './Section'

const URL = '/api'

export const fetchColorChoices = async () => {
    const resp = await fetch(`${URL}/colors`)
    const colorChoices: ColorChoice[] = await resp.json()

    return colorChoices.sort((a, b) => a.order - b.order)
}

export const fetchSectionsConfig = async () => {
    const res: { sections: [SectionAttributes]; bitsPerPixel: number } = await (
        await fetch(`${URL}/sections`)
    ).json()
    // We don't really need different color-depths across sections, and this implementation should make it fairly straight forward to add it if needed
    return res
}

export const fetchSectionData = async (sectionId: number) => {
    console.log(`fetch ${sectionId}`)
    const buffer = await (
        await fetch(`${URL}/section-data/${sectionId}`)
    ).arrayBuffer()

    const bytes = decompress(new Uint8Array(buffer))
    return bytes
}
