export class ColorChoice {
    rgb: [number, number, number]
    id: number // Uniquely identifies this color
    order: number // Assigns a unique position to this color (where to display it in color picker)
    htmlEl?: HTMLElement

    constructor(id: number, rgb: [number, number, number], order: number) {
        this.rgb = rgb
        this.id = id
        this.order = order
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
    colorEl.style.width = '35px'
    colorEl.style.height = '35px'
    colorEl.style.backgroundColor = `rgb(${r},${g},${b})`
    colorEl.style.margin = '5px'
    colorEl.onclick = clickHandler
    colorEl.classList.add('color-choice')
    return colorEl
}

export interface ColorProvider {
    getColorById(colorId: number): [number, number, number] | undefined
    getIdForColor(color: [number, number, number]): number | undefined
    colorToFillStyleString(color: [number, number, number]): string
}

export class ColorPicker implements ColorProvider {
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

    getColorById(colorId: number): [number, number, number] | undefined {
        for (let i = 0; i < this.colorChoices.length; i++) {
            if (this.colorChoices[i].id === colorId)
                return this.colorChoices[i].rgb
        }
        return undefined
    }

    getIdForColor(color: [number, number, number]): number | undefined {
        for (const c of this.colorChoices) {
            if (c.r === color[0] && c.g === color[1] && c.b === color[2])
                return c.id
        }
        return undefined
    }

    colorToFillStyleString(color: [number, number, number]): string {
        return `rgb(${color[0]} ${color[1]} ${color[2]})`
    }
}
