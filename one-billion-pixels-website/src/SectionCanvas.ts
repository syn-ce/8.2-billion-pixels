import { Socket } from 'socket.io-client'
import { Reticle } from './Reticle'
import { Section } from './Section'
import { fetchSectionsData } from './requests'

export class SectionCanvas {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    virtualCenter: [number, number]
    scale: number
    panning: boolean
    prevPanMousePos: [number, number]
    reticle: Reticle
    sections: Map<number, Section>
    subscribedSectionIds: Set<number>
    socket: Socket

    constructor(
        canvas: HTMLCanvasElement,
        virtualCenter: [number, number],
        scale: number,
        reticle: Reticle,
        sections: Map<number, Section>,
        subscribedSectionIds: Set<number>,
        socket: Socket
    ) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')!
        this.virtualCenter = virtualCenter
        this.scale = scale
        this.panning = false
        this.prevPanMousePos = [-1, -1] // Could be anything
        this.reticle = reticle
        this.sections = sections
        this.subscribedSectionIds = subscribedSectionIds
        this.socket = socket

        socket.on(
            'set-pixel',
            (data: { sectionId: number; pixelIdx: number; color: number }) => {
                console.log(`set-pixel: ${JSON.stringify(data)}`)
                this.sections
                    .get(data.sectionId)!
                    .setPixel(
                        this.sections.get(data.sectionId)!,
                        data.pixelIdx,
                        data.color
                    )
            }
        )
    }

    userSetPixel = (
        screenPixel: [number, number],
        colorId: number,
        sectionCanvas: SectionCanvas
    ) => {
        // TODO: think about what to do when this isn't a whole value;
        // The docs advise to only use integer values to improve performance
        const screenPixelsPerPixel = sectionCanvas.scale

        // Fill pixel on canvas
        sectionCanvas.ctx.fillRect(
            screenPixel[0],
            screenPixel[1],
            screenPixelsPerPixel,
            screenPixelsPerPixel
        )

        // TODO: worry about all of these bangs
        // Apply update to section's data
        // Determine correct section based on virtual pixel
        const virtualPixel = sectionCanvas.screenToVirtualSpace(
            [screenPixel],
            sectionCanvas
        )[0]
        const sectionId = Array.from(sectionCanvas.subscribedSectionIds).find(
            (id) => {
                const sec = sectionCanvas.sections.get(id)!
                return (
                    sec.topLeft[0] <= virtualPixel[0] &&
                    sec.topLeft[1] <= virtualPixel[1] &&
                    virtualPixel[0] < sec.botRight[0] &&
                    virtualPixel[1] < sec.botRight[1]
                )
            }
        )!

        // TODO: check whether flooring here is the correct thing, especially with fractional scaling
        // Now that we've found the pixel, we can floor to the actual coordinates (could also do this before, but seems safer to do it after (numerical reasons))
        virtualPixel[0] = Math.floor(virtualPixel[0])
        virtualPixel[1] = Math.floor(virtualPixel[1])
        const section = sectionCanvas.sections.get(sectionId)!

        // Set pixel in section
        const width = section.botRight[0] - section.topLeft[0]
        const idx =
            width * (virtualPixel[1] - section.topLeft[1]) +
            (virtualPixel[0] - section.topLeft[0])
        section.setPixel(section, idx, colorId)

        // Inform server
        this.socket.emit('set_pixel', [section.id, idx, colorId])
    }

    virtualToScreenSpaceIntegers = (
        points: [number, number][]
    ): [number, number][] => {
        return this.virtualToScreenSpace(points).map((point) => [
            Math.ceil(point[0]),
            Math.ceil(point[1]),
        ])
    }

    virtualToScreenSpace = (points: [number, number][]): [number, number][] => {
        let canvasCenter = [this.canvas.width / 2, this.canvas.height / 2]
        let centerVirtual = this.virtualCenter
        let ps: [number, number][] = []
        for (const point of points) {
            // Diff in virtual space
            const diff = [
                point[0] - centerVirtual[0],
                point[1] - centerVirtual[1],
            ]
            // Diff on screen
            diff[0] *= this.scale
            diff[1] *= this.scale
            ps.push([
                // TODO: verify that ceil here doesn't mess things up
                canvasCenter[0] + diff[0],
                canvasCenter[1] + diff[1],
            ])
        }
        return ps
    }

    screenToVirtualSpace = (
        points: [number, number][],
        canvasState: SectionCanvas
    ): [number, number][] => {
        //canvasState.virtualCenter
        let canvasCenter = [
            canvasState.canvas.width / 2,
            canvasState.canvas.height / 2,
        ]
        let centerVirtual = canvasState.virtualCenter
        let ps: [number, number][] = []
        for (const point of points) {
            // Diff on screen
            const diff = [
                point[0] - canvasCenter[0],
                point[1] - canvasCenter[1],
            ]
            // Diff in virtual space
            diff[0] /= canvasState.scale
            diff[1] /= canvasState.scale
            ps.push([centerVirtual[0] + diff[0], centerVirtual[1] + diff[1]])
        }
        return ps
    }

    // Determine all sections which we need to fetch
    determineRequiredSections = (): Set<number> => {
        // Determine edges in virtual space
        const [topLeft, botRight] = this.screenToVirtualSpace(
            [
                [0, 0],
                [this.canvas.width, this.canvas.height],
            ],
            this
        )

        // Filter sections
        const filteredSections = Array.from(this.sections.values()).filter(
            (section) =>
                !(
                    section.topLeft[0] >= botRight[0] ||
                    section.botRight[0] <= topLeft[0] ||
                    section.topLeft[1] >= botRight[1] ||
                    section.botRight[1] <= topLeft[1]
                )
        )
        console.log(`Req ${filteredSections.length} / ${this.sections.size}`)

        return new Set(filteredSections.map((section) => section.id))
    }

    subscribeToSections = (ids: number[]) => {
        if (ids.length == 0) return
        this.socket.emit('subscribe', ids)
    }

    unsubscribeFromSections = (ids: number[]) => {
        if (ids.length == 0) return
        this.socket.emit('unsubscribe', ids)
    }

    updateSectionsSubscriptions = async (
        requiredSections: Set<number>,
        canvasState: SectionCanvas
    ) => {
        const curSections = canvasState.subscribedSectionIds
        const sectionIdsToRemove: Set<number> = new Set()
        // Remove sections which are no longer needed
        for (const id of curSections) {
            if (!requiredSections.has(id)) {
                sectionIdsToRemove.add(id) // Mark section to be removed
            }
        }
        // Remove sections after loop so that we don't modify collection while iterating
        console.log(`Del ${sectionIdsToRemove.size} sections`)
        sectionIdsToRemove.forEach((id, _, set) => curSections.delete(id))
        this.unsubscribeFromSections(Array.from(sectionIdsToRemove))

        // Add new sections
        const sectionIdsToAdd: Set<number> = new Set()
        for (const id of requiredSections) {
            if (!curSections.has(id)) {
                sectionIdsToAdd.add(id)
                curSections.add(id)
            }
        }
        console.log(`Add ${sectionIdsToAdd.size} sections`)
        this.subscribeToSections(Array.from(sectionIdsToAdd))
        // Fetch sections data
        await fetchSectionsData(
            Array.from(sectionIdsToAdd).map(
                (id) => canvasState.sections.get(id)!
            )
        )
    }

    // TODO: panning is a bit janky because of aliasing
    drawSections = async () => {
        // Filter sections which are not in view
        const requiredSectionsIds = this.determineRequiredSections()

        // Subscribe to new, unsubscribe from old
        await this.updateSectionsSubscriptions(requiredSectionsIds, this)

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

        requiredSectionsIds.forEach((reqSectionId) =>
            this.sections.get(reqSectionId)!.drawOntoSectionCanvas(this)
        )

        // Update reticle
        this.reticle.update(this)
    }
}
