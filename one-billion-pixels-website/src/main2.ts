import './style.css'

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
const ctx = canvas.getContext('2d')!
const screenFrame = <HTMLDivElement>document.getElementById('screen-frame')
const panZoomWrapper = <HTMLDivElement>(
    document.getElementById('pan-zoom-wrapper')
)

const canvasState = {
    panning: false,
    maxZoom: 50,
    minZoom: 1,
    prevMousePos: [0, 0],
    scale: 1 / 50,
    offset: [0, 0],
    contentOffset: [0, 0],
}

canvas.style.transform = `scale(${canvasState.maxZoom})`

canvas.onmousedown = (evt) => {
    canvasState.panning = true
    canvasState.prevMousePos = [evt.x, evt.y]
}

const setCanvasTransform = () => {
    checkBuffers()
    panZoomWrapper.style.transform = `translate(${canvasState.offset[0]}px, ${canvasState.offset[1]}px) scale(${canvasState.scale})`
}

canvas.onmousemove = (evt) => {
    if (!canvasState.panning) return
    const diff = [
        evt.x - canvasState.prevMousePos[0],
        evt.y - canvasState.prevMousePos[1],
    ]

    canvasState.offset[0] += diff[0]
    canvasState.offset[1] += diff[1]
    canvasState.prevMousePos = [evt.x, evt.y]
    setCanvasTransform()
}

const checkBuffers = () => {
    const bufferMultiplier = canvasState.scale * canvasState.maxZoom

    if (
        (bufferMultiplier * canvas.width) / 2 -
            screenFrame.clientWidth / 2 -
            canvasState.offset[0] <=
            0 ||
        (bufferMultiplier * canvas.width) / 2 -
            screenFrame.clientWidth / 2 +
            canvasState.offset[0] <=
            0 ||
        (bufferMultiplier * canvas.height) / 2 -
            screenFrame.clientHeight / 2 -
            canvasState.offset[1] <=
            0 ||
        (bufferMultiplier * canvas.height) / 2 -
            screenFrame.clientHeight / 2 +
            canvasState.offset[1] <=
            0
    ) {
        // Center canvas
        // Need to adjust content
        canvasState.contentOffset[0] += canvasState.offset[0] / bufferMultiplier
        canvasState.contentOffset[1] += canvasState.offset[1] / bufferMultiplier
        drawImgWithOffset(img, canvasState.contentOffset)
        canvasState.offset = [0, 0]
    }
}

canvas.onmouseup = (evt) => {
    canvasState.panning = false
}

canvas.onmouseleave = (evt) => {
    canvasState.panning = false
}

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

    canvasState.scale *= zoomFactor
    canvasState.offset[0] += translation[0]
    canvasState.offset[1] += translation[1]
    setCanvasTransform()
}

const drawImgWithOffset = (img: HTMLImageElement, offset: number[]) => {
    ctx.drawImage(img, offset[0], offset[1])
}

const drawImgInitial = () => {
    const img = new Image()
    img.onload = function () {
        const widthBufferSize = Math.ceil(screenFrame.clientWidth * 0.1)
        const heightBufferSize = Math.ceil(screenFrame.clientHeight * 0.1)
        canvas.width = screenFrame.clientWidth + widthBufferSize * 2
        canvas.height = screenFrame.clientHeight + heightBufferSize * 2
        ctx.drawImage(img, canvasState.offset[0], canvasState.offset[1])
        setCanvasTransform()
    }

    img.src = '../img.png'
    return img
}

const img = drawImgInitial()
