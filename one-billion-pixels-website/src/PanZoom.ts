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
    }

    canvas.onmouseleave = (evt) => {
        sectionCanvas.panning = false
    }
}

const addZoomToCanvas = (sectionCanvas: SectionCanvas) => {
    const canvas = sectionCanvas.canvas
    canvas.onwheel = (evt) => {
        const zoomFactor = evt.deltaY < 0 ? 1.2 : 1 / 1.2
        const canvBoundRect = canvas.getBoundingClientRect()

        // Pixels from zoomPoint to canvas center
        const diffToCenter = [
            canvBoundRect.left + canvBoundRect.width / 2 - evt.x,
            canvBoundRect.top + canvBoundRect.height / 2 - evt.y,
        ]

        // Difference in pixels from zoomPoint to canvas center after zoom (compared to before)
        const translation = [
            diffToCenter[0] * (zoomFactor - 1),
            diffToCenter[1] * (zoomFactor - 1),
        ]

        sectionCanvas.scale *= zoomFactor
        sectionCanvas.offset[0] += translation[0]
        sectionCanvas.offset[1] += translation[1]
        sectionCanvas.setCanvasTransform()
    }
}
