export class ZoomSlider {
    zoomSlider: HTMLInputElement
    zoomSliderLabel: HTMLLabelElement

    constructor(
        zoomSlider: HTMLInputElement,
        zoomSliderLabel: HTMLLabelElement
    ) {
        this.zoomSlider = zoomSlider
        this.zoomSliderLabel = zoomSliderLabel
        this.addInputCallback(
            (zoomValue) => (this.zoomSliderLabel.textContent = `${zoomValue}`)
        )
    }

    addInputCallback = (callback: (zoomValue: number) => void) => {
        this.zoomSlider.addEventListener('input', (evt) => {
            const value = (<HTMLInputElement>evt.target).value
            callback(Number(value))
        })
    }

    set min(min: number) {
        this.zoomSlider.min = `${min}`
    }

    set max(max: number) {
        this.zoomSlider.max = `${max}`
    }

    set value(value: number) {
        this.zoomSlider.value = `${value}`
        this.zoomSliderLabel.textContent = `${value.toFixed(2)}`
    }

    set step(step: number) {
        this.zoomSlider.step = `${step}`
    }
}
