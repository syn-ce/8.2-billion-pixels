import { ColorChoice } from './ColorPicker'
import { Section, SectionAttributes } from './Section'

const URL = '/api'

// Canvas data
export const fetchBits = async () => {
    const buffer = await (await fetch(`${URL}/bits`)).arrayBuffer()
    return new Uint8Array(buffer)
}

export const fetchColorChoices = async () => {
    const colorChoices: ColorChoice[] = await (
        await fetch(`${URL}/colors`)
    ).json()
    return colorChoices
}

export const fetchSectionsConfig = async () => {
    const res: [SectionAttributes] = await (
        await fetch(`${URL}/sections`)
    ).json()

    const sections = []
    for (let i = 0; i < res.length; i++) {
        const sectionData = res[i]
        sections.push(
            new Section(
                sectionData.topLeft,
                sectionData.botRight,
                sectionData.id
            )
        )
    }

    return sections
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
