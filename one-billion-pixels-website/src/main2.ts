import './style.css'

const canvas = <HTMLCanvasElement>document.getElementById('clicker-canvas')
const ctx = canvas.getContext('2d')!
const screenFrame = <HTMLDivElement>document.getElementById('screen-frame')

const canvasState = {
    panning: false,
    prevMousePos: [0, 0],
    scale: 1,
    offset: [0, 0],
    contentOffset: [0, 0],
    widthBufferSize: 0,
    heightBufferSize: 0,
}

const canvasScale = 1

canvas.onmousedown = (evt) => {
    canvasState.panning = true
    canvasState.prevMousePos = [evt.x, evt.y]
}

const setCanvasTransform = () => {
    checkBuffers()
    canvas.style.transform = `translate(${canvasState.offset[0]}px, ${canvasState.offset[1]}px) scale(${canvasState.scale})`
}

canvas.onmousemove = (evt) => {
    if (!canvasState.panning) return
    const diff = [
        evt.x - canvasState.prevMousePos[0],
        evt.y - canvasState.prevMousePos[1],
    ]

    // Difference in virtual space
    diff[0] /= canvasScale
    diff[1] /= canvasScale

    canvasState.offset[0] += diff[0]
    canvasState.offset[1] += diff[1]
    canvasState.prevMousePos = [evt.x, evt.y]
    setCanvasTransform()
}

const checkBuffers = () => {
    if (
        canvasState.widthBufferSize - canvasState.offset[0] <= 0 ||
        canvasState.widthBufferSize + canvasState.offset[0] <= 0 ||
        canvasState.heightBufferSize - canvasState.offset[1] <= 0 ||
        canvasState.heightBufferSize + canvasState.offset[1] <= 0
    ) {
        // Center canvas
        // Need to adjust content

        canvasState.contentOffset[0] += canvasState.offset[0]
        canvasState.contentOffset[1] += canvasState.offset[1]
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
    canvasState.scale *= evt.deltaY < 0 ? 1.2 : 1 / 1.2
    setCanvasTransform()
}

const drawImgWithOffset = (img: HTMLImageElement, offset: number[]) => {
    ctx.drawImage(img, offset[0], offset[1])
}

const drawImgInitial = () => {
    const img = new Image()
    img.onload = function () {
        canvasState.widthBufferSize = Math.ceil(screenFrame.clientWidth * 0.1)
        canvasState.heightBufferSize = Math.ceil(screenFrame.clientHeight * 0.1)
        canvas.width = screenFrame.clientWidth + canvasState.widthBufferSize * 2
        canvas.height =
            screenFrame.clientHeight + canvasState.heightBufferSize * 2
        ctx.drawImage(img, canvasState.offset[0], canvasState.offset[1])
    }

    img.src = '../img.png'
    return img
}

const img = drawImgInitial()
