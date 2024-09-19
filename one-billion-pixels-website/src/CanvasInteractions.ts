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

        sectionCanvas.applyOffsetDiffCheckBounds(diff)
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

        sectionCanvas.centerCanvasPixelCheckBounds(canvasPixel)
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
    // When releasing one finger from a two-finger action (e.g. zooming), the other one will get recognised as a panning finger and
    // the previous pan position will be used as a reference; However, both fingers will likely have moved a fair distance
    // from it without updating, since it wasn't necessarily a pan- but potentially another, e.g. a zoom, -event. Setting this when
    // a finger is lifted prevents unexpected jumping around when a two-finger action comes to an end.
    canvas.ontouchend = (evt) => {
        if (evt.touches.length == 1) {
            const touch = evt.touches[0]
            sectionCanvas.prevPanMousePos = [touch.clientX, touch.clientY]
        }
    }

    canvas.ontouchmove = (evt) => {
        if (evt.touches.length == 1) {
            const touch = evt.touches[0]
            const diff: [number, number] = [
                touch.clientX - sectionCanvas.prevPanMousePos[0],
                touch.clientY - sectionCanvas.prevPanMousePos[1],
            ]
            sectionCanvas.applyOffsetDiffCheckBounds(diff)
            sectionCanvas.prevPanMousePos = [touch.clientX, touch.clientY]
            sectionCanvas.setCanvasTransform()
        } else if (evt.touches.length == 2) {
            const prevTouch1 = sectionCanvas.prevZoomTouch[0]
            const prevTouch2 = sectionCanvas.prevZoomTouch[1]
            const swapTouchIdx =
                prevTouch1.id == evt.touches[0].identifier ? 0 : 1
            const touch1 = copyTouch(evt.touches[0 + swapTouchIdx])
            const touch2 = copyTouch(evt.touches[1 - swapTouchIdx])

            const movementDelta1 = [
                touch1.x - prevTouch1.x,
                touch1.y - prevTouch1.y,
            ]
            const movementDelta2 = [
                touch2.x - prevTouch2.x,
                touch2.y - prevTouch2.y,
            ]

            // Panning by the amount both fingers moved in the same direction
            const sameDirectionMovement: [number, number] = [
                (movementDelta1[0] + movementDelta2[0]) / 2,
                (movementDelta1[1] + movementDelta2[1]) / 2,
            ]

            sectionCanvas.applyOffsetDiffCheckBounds(sameDirectionMovement)
            sectionCanvas.setCanvasTransform()

            // Zooming into the (not changing) center - Tried changing the center throughout the two-finger interaction, but
            // that feels very janky; Leaving the center unchanged feels a lot more intuitive
            const center = sectionCanvas.startZoomTouch.center
            const zoomDelta = [
                (movementDelta1[0] - movementDelta2[0]) / 2,
                (movementDelta1[1] - movementDelta2[1]) / 2,
            ]

            const centerToTouch1 = [touch1.x - center.x, touch1.y - center.y]

            // Determine whether to move in or out because we lose the sign when taking the length of zoomDelta
            const dotProduct =
                zoomDelta[0] * centerToTouch1[0] +
                zoomDelta[1] * centerToTouch1[1]

            const sign = dotProduct < 0 ? -1 : 1

            const prevTouch1Translated = [
                prevTouch1.x + sameDirectionMovement[0],
                prevTouch1.y + sameDirectionMovement[1],
            ]

            const newCenterToA = [
                prevTouch1Translated[0] - center.x,
                prevTouch1Translated[1] - center.y,
            ]
            const a = Math.sqrt(newCenterToA[0] ** 2 + newCenterToA[1] ** 2)

            const zoomDeltaLen = Math.sqrt(
                zoomDelta[0] ** 2 + zoomDelta[1] ** 2
            )
            const zoomFactor = (sign * zoomDeltaLen + a) / a

            sectionCanvas.zoomInto([center.x, center.y], zoomFactor)
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
        const curCanvasPixel = sectionCanvas.reticle.curCanvasPixel
        if (evt.code === 'ArrowLeft') {
            // Move to left
            const newCanvasPixel: [number, number] = [
                curCanvasPixel[0] - 1,
                curCanvasPixel[1],
            ]
            sectionCanvas.centerCanvasPixelCheckBounds(newCanvasPixel)
        } else if (evt.code === 'ArrowUp') {
            const newCanvasPixel: [number, number] = [
                curCanvasPixel[0],
                curCanvasPixel[1] - 1,
            ]
            sectionCanvas.centerCanvasPixelCheckBounds(newCanvasPixel)
        } else if (evt.code === 'ArrowRight') {
            const newCanvasPixel: [number, number] = [
                curCanvasPixel[0] + 1,
                curCanvasPixel[1],
            ]
            sectionCanvas.centerCanvasPixelCheckBounds(newCanvasPixel)
        } else if (evt.code === 'ArrowDown') {
            const newCanvasPixel: [number, number] = [
                curCanvasPixel[0],
                curCanvasPixel[1] + 1,
            ]
            sectionCanvas.centerCanvasPixelCheckBounds(newCanvasPixel)
        }
    })
}
