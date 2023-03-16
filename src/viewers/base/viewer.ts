/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Viewport } from "./viewport";
import { Renderer } from "../../graphics/renderer";
import { Vec2 } from "../../base/math/vec2";
import { BBox } from "../../base/math/bbox";
import { Color } from "../../base/color";
import { ViewLayerSet } from "./view-layers";
import { Polygon, Polyline } from "../../graphics/shapes";
import {
    type KiCanvasEventMap,
    KiCanvasSelectEvent,
    KiCanvasLoadEvent,
    KiCanvasMouseMoveEvent,
} from "./events";
import { Disposables, type IDisposable } from "../../base/disposable";
import { listen } from "../../base/events";
import { later } from "../../base/async";

export abstract class Viewer extends EventTarget {
    public canvas: HTMLCanvasElement;
    public renderer: Renderer;
    public viewport: Viewport;
    public layers: ViewLayerSet;
    public mouse_position: Vec2 = new Vec2(0, 0);

    protected disposables = new Disposables();

    #selected: BBox | null;
    #loaded_promise: Promise<boolean>;
    #loaded_promise_resolve_reject: [
        (result: boolean) => void,
        (result: boolean) => void,
    ];

    constructor(canvas: HTMLCanvasElement) {
        super();
        this.canvas = canvas;
        this.renderer = this.disposables.add(this.create_renderer(canvas));
        this.#loaded_promise = new Promise((resolve, reject) => {
            this.#loaded_promise_resolve_reject = [resolve, reject];
        });
    }

    dispose() {
        this.disposables.dispose();
    }

    override addEventListener<K extends keyof KiCanvasEventMap>(
        type: K,
        listener:
            | ((this: Viewer, ev: KiCanvasEventMap[K]) => void)
            | { handleEvent: (ev: KiCanvasEventMap[K]) => void }
            | null,
        options?: boolean | AddEventListenerOptions,
    ): IDisposable;
    override addEventListener(
        type: string,
        listener: EventListener | null,
        options?: boolean | AddEventListenerOptions,
    ): IDisposable {
        super.addEventListener(type, listener, options);
        return {
            dispose: () => {
                this.removeEventListener(type, listener, options);
            },
        };
    }

    protected abstract create_renderer(canvas: HTMLCanvasElement): Renderer;

    async setup() {
        await this.renderer.setup();

        this.viewport = this.disposables.add(
            new Viewport(this.renderer, () => {
                this.on_viewport_change();
            }),
        );

        this.viewport.enable_pan_and_zoom(0.5, 190);

        this.disposables.add(
            listen(this.canvas, "mousemove", (e) => {
                this.on_mouse_change(e);
            }),
        );

        this.disposables.add(
            listen(this.canvas, "panzoom", (e) => {
                this.on_mouse_change(e as MouseEvent);
            }),
        );

        this.disposables.add(
            listen(this.canvas, "click", (e) => {
                const items = this.layers.query_point(this.mouse_position);
                this.on_pick(this.mouse_position, items);
            }),
        );
    }

    protected on_viewport_change() {
        this.draw();
    }

    protected on_mouse_change(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const new_position = this.viewport.camera.screen_to_world(
            new Vec2(e.clientX - rect.left, e.clientY - rect.top),
        );

        if (
            this.mouse_position.x != new_position.x ||
            this.mouse_position.y != new_position.y
        ) {
            this.mouse_position.set(new_position);
            this.dispatchEvent(new KiCanvasMouseMoveEvent(this.mouse_position));
        }
    }

    public abstract load(src: any): Promise<void>;

    public get loaded() {
        return this.#loaded_promise;
    }

    protected set_loaded(value: boolean) {
        if (value) {
            this.#loaded_promise_resolve_reject[0](true);
            this.dispatchEvent(new KiCanvasLoadEvent());
        } else {
            this.#loaded_promise_resolve_reject[1](false);
        }
    }

    protected on_draw() {
        this.renderer.clear_canvas();

        if (!this.layers) {
            return;
        }

        // Render all layers in display order (back to front)
        let depth = 0.01;
        const camera = this.viewport.camera.matrix;
        const should_dim = this.layers.is_any_layer_highlighted();

        for (const layer of this.layers.in_display_order()) {
            if (layer.visible && layer.graphics) {
                let alpha = layer.opacity;

                if (should_dim && !layer.highlighted) {
                    alpha = 0.25;
                }

                layer.graphics.render(camera, depth, alpha);
                depth += 0.01;
            }
        }
    }

    public draw() {
        if (!this.viewport) {
            return;
        }

        window.requestAnimationFrame(() => {
            this.on_draw();
        });
    }

    protected on_pick(
        mouse: Vec2,
        items: ReturnType<ViewLayerSet["query_point"]>,
    ) {
        let selected = null;

        for (const { bbox } of items) {
            selected = bbox;
            break;
        }

        this.select(selected);
    }

    public select(item: BBox | null) {
        this.selected = item;
    }

    public get selected(): BBox | null {
        return this.#selected;
    }

    public set selected(bb: BBox | null) {
        const previous = this.#selected;
        this.#selected = bb?.copy() || null;

        // Notify event listeners
        this.dispatchEvent(
            new KiCanvasSelectEvent({
                item: this.#selected?.context,
                previous: previous?.context,
            }),
        );

        later(() => this.paint_selected());
    }

    public get selection_color() {
        return Color.white;
    }

    protected paint_selected() {
        const layer = this.layers.overlay;

        layer.clear();

        if (this.#selected) {
            const bb = this.#selected.copy().grow(this.#selected.w * 0.1);
            this.renderer.start_layer(layer.name);

            this.renderer.line(
                Polyline.from_BBox(bb, 0.254, this.selection_color),
            );

            this.renderer.polygon(Polygon.from_BBox(bb, this.selection_color));

            layer.graphics = this.renderer.end_layer();

            layer.graphics.composite_operation = "overlay";
        }

        this.draw();
    }

    abstract zoom_to_page(): void;

    zoom_to_selection() {
        if (!this.selected) {
            return;
        }
        this.viewport.camera.bbox = this.selected.grow(10);
        this.draw();
    }
}