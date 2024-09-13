import { ColorChoice, ColorPicker } from './ColorPicker'
import { addPanZoomToSectionCanvas } from './PanZoom'
import { fetchBits, fetchColorChoices, fetchSections } from './requests'
import { Reticle } from './Reticle'
import { Section } from './Section'
import { SectionCanvas } from './SectionCanvas'
import { setupSocket } from './socket'
import './style.css'

const socket = setupSocket()

const allBits = await fetchBits()
console.log(`nr of bits = ${allBits.length * 8}`)

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
console.log(screen.width)
canvas.width = window.innerWidth //* devicePixelRatio
canvas.height = window.innerHeight //* devicePixelRatio

const reticle = document.getElementById('reticle')!

const sections: Section[] = await fetchSections()
const WIDTH = sections[sections.length - 1].botRight[0] // TODO: this assumes the sections to start at 0; maybe don't make this assumption
const HEIGHT = sections[sections.length - 1].botRight[1]
console.log(WIDTH)
console.log(HEIGHT)

// Start with canvas centered in middle of screen
const sectionCanvas: SectionCanvas = new SectionCanvas(
    canvas,
    [WIDTH / 2, HEIGHT / 2], // Point in virtual space which is initially centered in screen space
    1,
    new Reticle(reticle, [WIDTH / 2, HEIGHT / 2]),
    new Map(sections.map((section) => [section.id, section])),
    new Set(),
    socket
)

const colors: ColorChoice[] = await fetchColorChoices()
const colorPicker = new ColorPicker(
    colors,
    <HTMLDivElement>document.getElementById('color-picker')
)

const setPixelBtn = <HTMLButtonElement>document.getElementById('set-pixel-btn')
setPixelBtn.onclick = async () => {
    sectionCanvas.userSetPixel(
        sectionCanvas.reticle.screenPixel,
        colorPicker.curColorChoice.id,
        sectionCanvas
    )
}

window.onresize = (evt) => {
    canvas.width = window.innerWidth //* devicePixelRatio
    canvas.height = window.innerHeight //* devicePixelRatio
    sectionCanvas.drawSections()
}

addPanZoomToSectionCanvas(sectionCanvas)

sectionCanvas.drawSections()

const sectionsToScreenSpace = (
    canvasState: SectionCanvas,
    sections: Map<number, Section>
) => {
    const transformedSections: Map<number, Section> = new Map()
    for (const [id, section] of sections) {
        section.updateSectionScreenSpace(canvasState)
        transformedSections.set(id, section)
    }
    return transformedSections
}
