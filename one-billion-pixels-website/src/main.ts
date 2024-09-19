import { ColorChoice, ColorPicker } from './ColorPicker'
import { fetchColorChoices, fetchSectionsConfig } from './requests'
import { Reticle } from './Reticle'
import { Section, SectionAttributes } from './Section'
import { SectionCanvas } from './SectionCanvas'
import { setupSocket } from './socket'
import './style.css'
import { ZoomSlider } from './ZoomSlider'

const socket = setupSocket()

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
//console.log(screen.width)
//canvas.width = window.innerWidth //* devicePixelRatio
//canvas.height = window.innerHeight //* devicePixelRatio

const reticle = document.getElementById('reticle')!
const reticleWrapper = <HTMLDivElement>(
    document.getElementById('reticle-wrapper')
)

const screenFrame = <HTMLDivElement>document.getElementById('screen-frame')
const panZoomWrapper = <HTMLDivElement>(
    document.getElementById('pan-zoom-wrapper')
)

const colors: ColorChoice[] = await fetchColorChoices()
const colorPicker = new ColorPicker(
    colors,
    <HTMLDivElement>document.getElementById('color-picker')
)

const sectionConfig: { sections: SectionAttributes[]; bitsPerPixel: number } =
    await fetchSectionsConfig()

const sections = sectionConfig.sections.map(
    (sectionAttrs) =>
        new Section(
            sectionAttrs.topLeft,
            sectionAttrs.botRight,
            sectionAttrs.id,
            sectionConfig.bitsPerPixel,
            colorPicker
        )
)

const WIDTH = sections[sections.length - 1].botRight[0] // TODO: this assumes the sections to start at 0; maybe don't make this assumption
const HEIGHT = sections[sections.length - 1].botRight[1]
console.log(sections)

console.log(WIDTH)
console.log(HEIGHT)

const zoomSlider = new ZoomSlider(
    <HTMLInputElement>document.getElementById('zoom-slider'),
    <HTMLLabelElement>document.getElementById('zoom-slider-label')
)
const canvRetWrapper = <HTMLDivElement>(
    document.getElementById('canvas-reticle-wrapper')
)

// Start with canvas centered in middle of screen
const sectionCanvas: SectionCanvas = new SectionCanvas(
    canvas,
    1,
    new Reticle(reticle, reticleWrapper),
    new Map(sections.map((section) => [section.id, section])),
    new Set(),
    socket,
    screenFrame,
    panZoomWrapper,
    50,
    zoomSlider,
    canvRetWrapper,
    colorPicker
)

const setPixelBtn = <HTMLButtonElement>document.getElementById('set-pixel-btn')
setPixelBtn.onclick = async () => {
    sectionCanvas.userSetPixel(
        sectionCanvas.reticle.curCanvasPixel,
        colorPicker.curColorChoice.id
    )
}

sectionCanvas.setCanvasTransform()
sectionCanvas.drawSections()
