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

export const fetchSections = async () => {
    const res: [SectionAttributes] = await (
        await fetch(`${URL}/sections`)
    ).json()

    return res.map(
        (res) => new Section(res.topLeft, res.botRight, res.id, res.data)
    )
}

export const fetchSectionData = async (sectionId: number) => {
    console.log(`fetch ${sectionId}`)
    const buffer = await (
        await fetch(`${URL}/section-data/${sectionId}`)
    ).arrayBuffer()

    const bytes = new Uint8Array(buffer)
    return bytes
}

export const fetchSectionsData = async (sections: Section[]) => {
    return Promise.all(
        Array.from(
            sections.map(async (section) => {
                section.data = await fetchSectionData(section.id)
            })
        )
    )
}
