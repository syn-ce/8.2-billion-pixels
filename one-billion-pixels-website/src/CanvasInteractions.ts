import { SectionCanvas } from './SectionCanvas'

export const addAllInteractivityToSectionCanvas = (
    sectionCanvas: SectionCanvas
) => {
    addPanZoomToSectionCanvas(sectionCanvas)
    addArrowPixelNavigation(sectionCanvas)
}

export const addPanZoomToSectionCanvas = (sectionCanvas: SectionCanvas) => {
    addMouseWheelPanToCanvas(sectionCanvas)
    addMouseWheelZoomToCanvas(sectionCanvas)
    addTouchPanZoomToCanvas(sectionCanvas)
}

const copyTouch = ({
    identifier,
    clientX,
    clientY,
}: {
    identifier: number
    clientX: number
    clientY: number
}) => ({ id: identifier, x: clientX, y: clientY })

const dist2 = (p1: [number, number], p2: [number, number]) =>
    (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2

// TODO: clicking for centering does not really work on mobile, haven't yet figured out why though
const addMouseWheelPanToCanvas = (sectionCanvas: SectionCanvas) => {
    const canvas = sectionCanvas.canvas
    canvas.onmousedown = (evt) => {
        sectionCanvas.panning = true
        sectionCanvas.prevPanMousePos = [evt.x, evt.y]
        sectionCanvas.startPanMousePos = [evt.x, evt.y]
    }

    canvas.onmousemove = (evt) => {
        if (!sectionCanvas.panning) return
        const diff: [number, number] = [
            evt.x - sectionCanvas.prevPanMousePos[0],
            evt.y - sectionCanvas.prevPanMousePos[1],
        ]

        sectionCanvas.applyOffsetDiffWithBoundsChecking(diff)
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
        // Canvas pixel which was clicked
        const canvasPixel = sectionCanvas.screenToCanvasPixel([
            sectionCanvas.startPanMousePos[0],
            sectionCanvas.startPanMousePos[1],
        ])

        sectionCanvas.centerCanvasPixel(canvasPixel)
    }

    canvas.onmouseleave = (evt) => {
        sectionCanvas.panning = false
    }
}

const addTouchPanZoomToCanvas = (sectionCanvas: SectionCanvas) => {
    const canvas = sectionCanvas.canvas
    canvas.ontouchstart = (evt) => {
        if (evt.touches.length == 1) {
            // Pan
            const touch = evt.touches[0]
            sectionCanvas.prevPanMousePos = [touch.clientX, touch.clientY]
            sectionCanvas.startPanMousePos = [touch.clientX, touch.clientY]
        } else if (evt.touches.length == 2) {
            // Zoom
            const touch1 = copyTouch(evt.touches[0])
            const touch2 = copyTouch(evt.touches[1])
            sectionCanvas.prevZoomTouch = [touch1, touch2]
            const center = {
                x: (touch1.x + touch2.x) / 2,
                y: (touch1.y + touch2.y) / 2,
            }
            sectionCanvas.startZoomTouch = { touch1, touch2, center }
        }

        console.log(evt)
    }

    canvas.ontouchmove = (evt) => {
        if (evt.touches.length == 1) {
            const touch = evt.touches[0]
            const diff: [number, number] = [
                touch.clientX - sectionCanvas.prevPanMousePos[0],
                touch.clientY - sectionCanvas.prevPanMousePos[1],
            ]
            sectionCanvas.applyOffsetDiffWithBoundsChecking(diff)
            sectionCanvas.prevPanMousePos = [touch.clientX, touch.clientY]
            sectionCanvas.setCanvasTransform()
        } else if (evt.touches.length == 2) {
            const prevTouch1 = sectionCanvas.prevZoomTouch[0]
            const prevTouch2 = sectionCanvas.prevZoomTouch[1]
            const swapTouchIdx =
                prevTouch1.id == evt.touches[0].identifier ? 0 : 1
            const touch1 = copyTouch(evt.touches[0 + swapTouchIdx])
            const touch2 = copyTouch(evt.touches[1 - swapTouchIdx])

            // TODO: use movementDeltas, make touch-interactions feel better
            const movementDelta1 = [
                touch1.x - prevTouch1.x,
                touch1.y - prevTouch1.y,
            ]
            const movementDelta2 = [
                touch2.x - prevTouch2.x,
                touch2.y - prevTouch2.y,
            ]

            const center = sectionCanvas.startZoomTouch.center
            // Determine if they go towards or away from the center
            const touch1GoesOutwards =
                dist2([touch1.x, touch1.y], [center.x, center.y]) >
                dist2([prevTouch1.x, prevTouch1.y], [center.x, center.y])
            const touch2GoesOutwards =
                dist2([touch2.x, touch2.y], [center.x, center.y]) >
                dist2([prevTouch2.x, prevTouch2.y], [center.x, center.y])
            if (touch1GoesOutwards && touch2GoesOutwards) {
                sectionCanvas.zoomInto([center.x, center.y], 1.2)
            } else if (!touch1GoesOutwards && !touch2GoesOutwards) {
                sectionCanvas.zoomInto([center.x, center.y], 1 / 1.2)
            }

            sectionCanvas.prevZoomTouch = [touch1, touch2]
        }
    }
}

const addMouseWheelZoomToCanvas = (sectionCanvas: SectionCanvas) => {
    const canvas = sectionCanvas.canvas
    canvas.onwheel = (evt) => {
        let zoomFactor = evt.deltaY < 0 ? 1.2 : 1 / 1.2
        sectionCanvas.zoomInto([evt.x, evt.y], zoomFactor)
    }
}

const addArrowPixelNavigation = (sectionCanvas: SectionCanvas) => {
    window.addEventListener('keydown', (evt) => {
        const canvasPixel = sectionCanvas.reticle.curCanvasPixel
        if (evt.code === 'ArrowLeft') {
            // Move to left
            const newCanvasPixel: [number, number] = [
                canvasPixel[0] - 1,
                canvasPixel[1],
            ]
            sectionCanvas.centerCanvasPixel(newCanvasPixel)
        } else if (evt.code === 'ArrowUp') {
            const newCanvasPixel: [number, number] = [
                canvasPixel[0],
                canvasPixel[1] - 1,
            ]
            sectionCanvas.centerCanvasPixel(newCanvasPixel)
        } else if (evt.code === 'ArrowRight') {
            const newCanvasPixel: [number, number] = [
                canvasPixel[0] + 1,
                canvasPixel[1],
            ]
            sectionCanvas.centerCanvasPixel(newCanvasPixel)
        } else if (evt.code === 'ArrowDown') {
            const newCanvasPixel: [number, number] = [
                canvasPixel[0],
                canvasPixel[1] + 1,
            ]
            sectionCanvas.centerCanvasPixel(newCanvasPixel)
        }
    })
}
