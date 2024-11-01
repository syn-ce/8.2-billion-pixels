import { ColorChoice, ColorPicker } from './ColorPicker'
import { fetchColorChoices, fetchSectionsConfig } from './requests'
import { Reticle } from './Reticle'
import { Section, SectionAttributes } from './Section'
import { SectionCanvas } from './SectionCanvas'
import { setupSocket } from './socket'
import './style.css'
import { ZoomSlider } from './ZoomSlider'

// Allow transitions after pageload
window.onload = () => {
    document.body.classList.remove('prevent-transition-before-pageload')
    const screenFrame = <HTMLDivElement>document.getElementById('screen-frame')

    screenFrame.style.top = `0px`
    screenFrame.style.left = '0px'

    screenFrame.style.width = `${Math.round(screen.width)}px`
    screenFrame.style.height = `${Math.round(screen.height)}px`
}

const socket = setupSocket()

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
console.log(canvas.getBoundingClientRect())

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

const sectionConfig: {
    sections: SectionAttributes[]
    bitsPerPixel: number
} = await fetchSectionsConfig()

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

const canvasDefaultOffsetWrapper = <HTMLDivElement>(
    document.getElementById('canvas-default-offset-wrapper')
)

// Start with canvas centered in middle of screen
const sectionCanvas: SectionCanvas = new SectionCanvas(
    canvas,
    1 / 50,
    new Reticle(reticle, reticleWrapper),
    new Map(sections.map((section) => [section.id, section])),
    new Set(),
    socket,
    screenFrame,
    panZoomWrapper,
    50,
    zoomSlider,
    canvRetWrapper,
    colorPicker,
    canvasDefaultOffsetWrapper
)

window.onresize = () => {
    sectionCanvas.updateCanvas()
}

const initPlacePixelBtn = <HTMLButtonElement>(
    document.getElementById('initiate-place-pixel')
)
const initPlacePixelCoordsEl = <HTMLParagraphElement>(
    document.getElementById('place-pixel-coords-text')
)
const placePixelWrapper = <HTMLDivElement>(
    document.getElementById('place-pixel-wrapper')
)
const abortPlacePixelBtn = <HTMLButtonElement>(
    document.getElementById('abort-place-pixel')
)
const confirmPlacePixelBtn = <HTMLButtonElement>(
    document.getElementById('confirm-place-pixel')
)

const showPlacePixelWrapper = () =>
    (placePixelWrapper.style.transform = 'translate(0)')

const hidePlacePixelWrapper = () =>
    (placePixelWrapper.style.transform = 'translate(0px, 100%)')

initPlacePixelBtn.onclick = () => {
    showPlacePixelWrapper()
    sectionCanvas.zoomScreenCoordsApplyEasing(
        sectionCanvas.frameCenterCoords,
        0.8 / sectionCanvas.desiredScale,
        300
    )
}

abortPlacePixelBtn.onclick = () => hidePlacePixelWrapper()

confirmPlacePixelBtn.onclick = async () => {
    sectionCanvas.userSetPixel(
        sectionCanvas.reticle.curCanvasPixel,
        colorPicker.curColorChoice.id
    )
    hidePlacePixelWrapper()
}

// Update displayed coords in place pixel button
sectionCanvas.addUpdateCallback((sectionCanvas: SectionCanvas) => {
    const canvasPixel = sectionCanvas.reticle.curCanvasPixel

    const sectionPixel = sectionCanvas.canvasToSectionCoords(canvasPixel)

    const zoomLevel =
        Math.round(
            Number.parseFloat(sectionCanvas.zoomSlider.zoomSlider.value) * 100
        ) / 100
    initPlacePixelCoordsEl.innerText = `(${sectionPixel}) ${zoomLevel}x`
})

// TODO: Fix this, this is horrible
setTimeout(() => {
    sectionCanvas.centerSectionCoords([0, 0])
    sectionCanvas.updateCanvas()
}, 100)

sectionCanvas.updateCanvas()
