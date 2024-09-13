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
        // Difference on screen
        const diff = [
            evt.x - sectionCanvas.prevPanMousePos[0],
            evt.y - sectionCanvas.prevPanMousePos[1],
        ]

        // Difference in virtual space
        diff[0] /= sectionCanvas.scale
        diff[1] /= sectionCanvas.scale
        // Adjust center
        sectionCanvas.virtualCenter[0] -= diff[0]
        sectionCanvas.virtualCenter[1] -= diff[1]
        // Update
        sectionCanvas.prevPanMousePos = [evt.x, evt.y]
        sectionCanvas.drawSections()
    }
    canvas.onmouseup = (evt) => {
        sectionCanvas.panning = false
    }
    canvas.onmouseleave = (evt) => {
        sectionCanvas.panning = false
    }
}

const addZoomToCanvas = (sectionCanvas: SectionCanvas) => {
    sectionCanvas.canvas.onwheel = (evt) => {
        // Diff from canvas (screen) center to zoom point in screen space
        const scalingFactor = evt.deltaY < 0 ? 2.0 : 1 / 2.0
        const virtualCenter = sectionCanvas.virtualCenter
        const diff = [
            evt.x - sectionCanvas.canvas.width / 2,
            evt.y - sectionCanvas.canvas.height / 2,
        ]
        // Difference in virtual space
        diff[0] /= sectionCanvas.scale
        diff[1] /= sectionCanvas.scale
        // Move virtual center to 0, then move zoom point to 0
        let movedVirtualCenter: [number, number] = [-diff[0], -diff[1]]
        // Scale up
        movedVirtualCenter[0] /= scalingFactor
        movedVirtualCenter[1] /= scalingFactor
        // Move back
        movedVirtualCenter[0] += virtualCenter[0] + diff[0]
        movedVirtualCenter[1] += virtualCenter[1] + diff[1]
        sectionCanvas.scale *= scalingFactor

        sectionCanvas.virtualCenter = movedVirtualCenter
        sectionCanvas.drawSections()
    }
}
