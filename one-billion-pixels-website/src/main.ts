import { ColorChoice, ColorPicker } from './ColorPicker'
import { addPanZoomToSectionCanvas } from './PanZoom'
import { fetchBits, fetchColorChoices, fetchSectionsConfig } from './requests'
import { Reticle } from './Reticle'
import { Section } from './Section'
import { SectionCanvas } from './SectionCanvas'
import { setupSocket } from './socket'
import './style.css'

const socket = setupSocket()

const allBits = await fetchBits()
console.log(`nr of bits = ${allBits.length * 8}`)

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
//console.log(screen.width)
//canvas.width = window.innerWidth //* devicePixelRatio
//canvas.height = window.innerHeight //* devicePixelRatio

const reticle = document.getElementById('reticle')!

const screenFrame = <HTMLDivElement>document.getElementById('screen-frame')
const panZoomWrapper = <HTMLDivElement>(
    document.getElementById('pan-zoom-wrapper')
)

const sections: Section[] = await fetchSectionsConfig()
const WIDTH = sections[sections.length - 1].botRight[0] // TODO: this assumes the sections to start at 0; maybe don't make this assumption
const HEIGHT = sections[sections.length - 1].botRight[1]
console.log(sections)

console.log(WIDTH)
console.log(HEIGHT)

// Start with canvas centered in middle of screen
const sectionCanvas: SectionCanvas = new SectionCanvas(
    canvas,
    1,
    new Reticle(reticle, [WIDTH / 2, HEIGHT / 2]),
    new Map(sections.map((section) => [section.id, section])),
    new Set(),
    socket,
    screenFrame,
    panZoomWrapper
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

sectionCanvas.setCanvasTransform()
sectionCanvas.drawSections()
