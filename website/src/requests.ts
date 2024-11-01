import { ColorChoice } from './ColorPicker'
import { Section, SectionAttributes } from './Section'

const URL = '/api'

export const fetchColorChoices = async () => {
    const colorChoices: ColorChoice[] = await (
        await fetch(`${URL}/colors`)
    ).json()
    return colorChoices
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

    const bytes = new Uint8Array(buffer)
    return bytes
}

export const fetchSectionsData = async (
    sections: Section[],
    callback: (section: Section) => void
) => {
    return Promise.all(
        Array.from(
            sections.map(async (section) => {
                const data = await fetchSectionData(section.id)
                section.setData(data)
                callback(section)
            })
        )
    )
}