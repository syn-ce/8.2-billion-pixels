export class ColorChoice {
    rgb: [number, number, number]
    id: number
    htmlEl?: HTMLElement

    constructor(id: number, rgb: [number, number, number]) {
        this.rgb = rgb
        this.id = id
        this.htmlEl = undefined
    }

    get r() {
        return this.rgb[0]
    }
    get g() {
        return this.rgb[1]
    }
    get b() {
        return this.rgb[2]
    }
}

const createColorChoice = (
    [r, g, b]: [number, number, number],
    clickHandler: () => void
) => {
    const colorEl = document.createElement('div')
    colorEl.style.width = '20px'
    colorEl.style.height = '20px'
    colorEl.style.backgroundColor = `rgb(${r},${g},${b})`
    colorEl.style.margin = '5px'
    colorEl.onclick = clickHandler
    colorEl.classList.add('color-choice')
    return colorEl
}

export class ColorPicker {
    colorChoices: ColorChoice[]
    divEl: HTMLDivElement
    curColorChoice: ColorChoice
    constructor(
        colorChoices: ColorChoice[],
        divEl: HTMLDivElement,
        curColorChoice?: ColorChoice
    ) {
        this.colorChoices = colorChoices
        this.divEl = divEl

        if (colorChoices.length == 0) {
            throw new Error('Cannot create ColorPicker without color choices.')
        }

        if (curColorChoice === undefined) this.curColorChoice = colorChoices[0]
        else this.curColorChoice = curColorChoice

        for (let i = 0; i < this.colorChoices.length; i++) {
            const colorChoice = this.colorChoices[i]
            colorChoice.htmlEl = createColorChoice(
                colorChoices[i].rgb,
                (() => this.updateActiveColorChoice(colorChoices[i].id)).bind(
                    this
                )
            )

            divEl.appendChild(colorChoice.htmlEl!)
        }
        this.updateActiveColorChoice(this.curColorChoice.id)
    }

    updateActiveColorChoice = (id: number) => {
        const newColorChoice = this.colorChoices.find(
            (color) => color.id === id
        )
        if (newColorChoice === undefined) {
            console.error(
                `Tried to set color choice with id ${id}, but no color choice with that id was found`
            )
            return
        }
        this.curColorChoice.htmlEl!.classList.remove('active')
        this.curColorChoice = newColorChoice
        newColorChoice.htmlEl!.classList.add('active')
    }
}
