import { SectionCanvas } from './SectionCanvas'

export const addPanZoomToSectionCanvas = (sectionCanvas: SectionCanvas) => {
    addPanToCanvas(sectionCanvas)
    addZoomToCanvas(sectionCanvas)
}

const addPanToCanvas = (sectionCanvas: SectionCanvas) => {
    const canvas = sectionCanvas.canvas
    canvas.onmousedown = (evt) => {
        sectionCanvas.panning = true
        sectionCanvas.prevPanMousePos = [evt.x, evt.y]
        sectionCanvas.startPanMousePos = [evt.x, evt.y]
    }

    canvas.onmousemove = (evt) => {
        if (!sectionCanvas.panning) return
        const diff = [
            evt.x - sectionCanvas.prevPanMousePos[0],
            evt.y - sectionCanvas.prevPanMousePos[1],
        ]

        sectionCanvas.offset[0] += diff[0]
        sectionCanvas.offset[1] += diff[1]
        sectionCanvas.prevPanMousePos = [evt.x, evt.y]
        sectionCanvas.setCanvasTransform()
    }

    canvas.onmouseup = (evt) => {
        sectionCanvas.panning = false

        // Test whether it was a click / tap and we should center the clicked/tapped point
        const diffToStart = [
            sectionCanvas.startPanMousePos[0] - evt.x,
            sectionCanvas.startPanMousePos[1] - evt.y,
        ]
        const dist2ToStart = diffToStart[0] ** 2 + diffToStart[1] ** 2
        if (dist2ToStart > 0) return // Panned canvas

        // TODO: maybe also don't move when the reticle is already on the targeted canvas pixel? Would make it practically impossible to perfectly center, though
        const canvasPixel = sectionCanvas.screenToCanvasPixel([
            sectionCanvas.startPanMousePos[0],
            sectionCanvas.startPanMousePos[1],
        ])
        const topLeftScreenPixelOfCanvasPixel =
            sectionCanvas.canvasToScreenPixel(canvasPixel)
        // Pixel which should be centered
        const screenPixelsPerCanvasPixel =
            sectionCanvas.screenPixelsPerCanvasPixel
        const targetScreenPixel = [
            topLeftScreenPixelOfCanvasPixel[0] + screenPixelsPerCanvasPixel / 2,
            topLeftScreenPixelOfCanvasPixel[1] + screenPixelsPerCanvasPixel / 2,
        ]

        // Calculate canvas pixel which was clicked
        const diffToScreenCenter = [
            window.innerWidth / 2 - targetScreenPixel[0],
            window.innerHeight / 2 - targetScreenPixel[1],
        ]
        diffToScreenCenter[0] = Math.round(diffToScreenCenter[0])
        diffToScreenCenter[1] = Math.round(diffToScreenCenter[1])

        sectionCanvas.offset[0] += diffToScreenCenter[0]
        sectionCanvas.offset[1] += diffToScreenCenter[1]
        sectionCanvas.setCanvasTransform()
    }

    canvas.onmouseleave = (evt) => {
        sectionCanvas.panning = false
    }
}

const addZoomToCanvas = (sectionCanvas: SectionCanvas) => {
    const canvas = sectionCanvas.canvas
    canvas.onwheel = (evt) => {
        let zoomFactor = evt.deltaY < 0 ? 1.2 : 1 / 1.2
        sectionCanvas.zoomInto([evt.x, evt.y], zoomFactor)
    }
}
