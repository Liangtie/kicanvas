/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Color } from "../gfx/color";
import { Polygon, Polyline, Arc, Circle } from "../gfx/primitives";
import { Renderer } from "../gfx/renderer";
import { ShapedParagraph, TextOptions } from "../gfx/text";
import * as sch_items from "../kicad/sch_items";
import { Angle } from "../math/angle";
import { Arc as MathArc } from "../math/arc";
import { BBox } from "../math/bbox";
import { Matrix3 } from "../math/matrix3";
import { Vec2 } from "../math/vec2";
import { Layer } from "./layers";

function color_maybe(
    color: Color,
    fallback_color: Color,
    fail_color: Color = new Color(1, 0, 0, 1)
) {
    if (!color.is_transparent) {
        return color;
    }
    if (fallback_color) {
        return fallback_color;
    }
    return fail_color;
}

/**
 * Base class for all painters responsible for drawing a schematic item.
 */
class ItemPainter {
    /**
     * List of item classes this painter can draw
     */
    static classes = [];

    static layers(item: unknown) {
        return [":Overlay"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        item: unknown
    ) {}
}

class RectanglePainter extends ItemPainter {
    static classes = [sch_items.Rectangle];

    static layers(item: sch_items.Rectangle) {
        return [":Notes"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        r: sch_items.Rectangle
    ) {
        const color = color_maybe(
            r.stroke.color,
            gfx.state.stroke,
            gfx.theme.note
        );

        const pts = [
            r.start,
            new Vec2(r.end.x, r.start.y),
            r.end,
            new Vec2(r.start.x, r.end.y),
            r.start,
        ];

        if (r.fill !== "none") {
            gfx.polygon(new Polygon(pts, gfx.state.fill));
        }

        gfx.line(
            new Polyline(pts, r.stroke.width || gfx.state.stroke_width, color)
        );
    }
}

class PolylinePainter extends ItemPainter {
    static classes = [sch_items.Polyline];

    static layers(item: sch_items.Polyline) {
        return [":Notes"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        pl: sch_items.Polyline
    ) {
        const color = color_maybe(
            pl.stroke.color,
            gfx.state.stroke,
            gfx.theme.note
        );

        gfx.line(
            new Polyline(
                pl.pts,
                pl.stroke.width || gfx.state.stroke_width,
                color
            )
        );

        if (pl.fill !== "none") {
            gfx.polygon(new Polygon(pl.pts, color));
        }
    }
}

class WirePainter extends ItemPainter {
    static classes = [sch_items.Wire];

    static layers(item: sch_items.Wire) {
        return [":Wire"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        w: sch_items.Wire
    ) {
        gfx.line(new Polyline(w.pts, gfx.state.stroke_width, gfx.theme.wire));
    }
}

class CirclePainter extends ItemPainter {
    static classes = [sch_items.Circle];

    static layers(item: sch_items.Circle) {
        return [":Notes"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        c: sch_items.Circle
    ) {
        const color = gfx.state.stroke ?? gfx.theme.note;

        gfx.arc(
            new Arc(
                c.center,
                c.radius,
                new Angle(0),
                new Angle(Math.PI * 2),
                c.stroke.width || gfx.state.stroke_width,
                color
            )
        );

        if (c.fill != "none") {
            gfx.circle(new Circle(c.center, c.radius, color));
        }
    }
}

class ArcPainter extends ItemPainter {
    static classes = [sch_items.Arc];

    static layers(item: sch_items.Arc) {
        return [":Notes"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        a: sch_items.Arc
    ) {
        const color = gfx.state.stroke ?? gfx.theme.note;

        const arc = MathArc.from_three_points(
            a.start,
            a.mid,
            a.end,
            a.stroke.width
        );

        gfx.arc(
            new Arc(
                arc.center,
                arc.radius,
                arc.start_angle,
                arc.end_angle,
                a.stroke.width || gfx.state.stroke_width,
                color
            )
        );
    }
}

class JunctionPainter extends ItemPainter {
    static classes = [sch_items.Junction];

    static layers(item: sch_items.Junction) {
        return [":Junction"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        j: sch_items.Junction
    ) {
        const color = gfx.theme.junction;
        gfx.circle(new Circle(j.at.position, (j.diameter || 1) / 2, color));
    }
}

class TextPainter extends ItemPainter {
    static classes = [sch_items.Text];

    static layers(item: sch_items.Text) {
        if (item.parent) {
            return [":Symbol:Foreground"];
        } else {
            return [":Notes"];
        }
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        t: sch_items.Text
    ) {
        if (t.effects.hide) {
            return;
        }

        const rotation = Angle.from_degrees(t.at.rotation).normalize();

        if (rotation.degrees == 180) {
            rotation.degrees = 0;
        } else if (rotation.degrees == 270) {
            rotation.degrees = 90;
        }

        const pos = t.at.position.copy();

        const options = new TextOptions(
            gfx.text_shaper.default_font,
            t.effects.size,
            t.effects.thickness,
            t.effects.bold,
            t.effects.italic,
            t.effects.v_align,
            t.effects.h_align,
            t.effects.mirror
        );

        pos.y -=
            t.effects.size.y * 0.15 + options.get_effective_thickness(0.1524);

        const shaped = gfx.text_shaper.paragraph(
            t.text,
            pos,
            rotation,
            options
        );

        for (const line of shaped.to_polylines(gfx.state.stroke)) {
            gfx.line(line);
        }
    }
}

class LabelPainter extends ItemPainter {
    static readonly default_thickness = 0.1524;
    static readonly text_offset_ratio = 0.15;
    static readonly label_size_ratio = 0.375;

    static classes = [sch_items.Label];

    static layers(
        item:
            | sch_items.Label
            | sch_items.HierarchicalLabel
            | sch_items.GlobalLabel
    ) {
        return [":Label"];
    }

    static color(gfx) {
        return gfx.theme.label_local;
    }

    static get_text_baseline_offset_dist(
        l:
            | sch_items.Label
            | sch_items.HierarchicalLabel
            | sch_items.GlobalLabel,
        options: TextOptions
    ) {
        return (
            l.effects.size.y * this.text_offset_ratio +
            options.get_effective_thickness(this.default_thickness)
        );
    }

    static get_text_offset(
        l:
            | sch_items.Label
            | sch_items.HierarchicalLabel
            | sch_items.GlobalLabel,
        options: TextOptions
    ) {
        const offset = new Vec2(0, 0);
        const offset_dist = this.get_text_baseline_offset_dist(l, options);

        if (l.at.rotation == 0 || l.at.rotation == 180) {
            offset.y = -offset_dist;
        } else {
            offset.x = -offset_dist;
        }

        return offset;
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        l: sch_items.Label | sch_items.HierarchicalLabel
    ) {
        if (l.effects.hide) {
            return;
        }

        const color = this.color(gfx);
        const rotation = Angle.from_degrees(l.at.rotation).normalize();

        if (rotation.degrees == 180) {
            rotation.degrees = 0;
        } else if (rotation.degrees == 270) {
            rotation.degrees = 90;
        }

        const options = new TextOptions(
            gfx.text_shaper.default_font,
            l.effects.size,
            l.effects.thickness,
            l.effects.bold,
            l.effects.italic,
            l.effects.v_align,
            l.effects.h_align,
            l.effects.mirror
        );

        const pos_offset = this.get_text_offset(l, options);
        const pos = l.at.position.add(pos_offset);

        const shaped = gfx.text_shaper.paragraph(
            l.name,
            pos,
            rotation,
            options
        );

        for (const line of shaped.to_polylines(color)) {
            gfx.line(line);
        }

        this.paint_shape(gfx, l, shaped);

        this.paint_debug(gfx, l, shaped);
    }

    static paint_shape(
        gfx: Renderer,
        l:
            | sch_items.Label
            | sch_items.GlobalLabel
            | sch_items.HierarchicalLabel,
        shaped: ShapedParagraph
    ) {}

    static paint_debug(
        gfx: Renderer,
        l:
            | sch_items.Label
            | sch_items.GlobalLabel
            | sch_items.HierarchicalLabel,
        shaped: ShapedParagraph
    ) {
        gfx.circle(new Circle(l.at.position, 0.2, new Color(1, 0.2, 0.2, 1)));
        const bb = shaped.bbox;
        gfx.line(
            new Polyline(
                [
                    bb.top_left,
                    bb.top_right,
                    bb.bottom_right,
                    bb.bottom_left,
                    bb.top_left,
                ],
                0.1,
                new Color(1, 0.2, 0.2, 0.2)
            )
        );
    }
}

class GlobalLabelPainter extends LabelPainter {
    // magic number from KiCAD's SCH_GLOBALLABEL::GetSchematicTextOffset
    // that centers the text so there's room for the overbar.
    static baseline_offset_ratio = 0.0715;
    static triangle_offset_ratio = 0.75;

    static classes = [sch_items.GlobalLabel];

    static color(gfx) {
        return gfx.theme.label_global;
    }

    static get_text_offset(l: sch_items.GlobalLabel, options: TextOptions) {
        let horz = LabelPainter.label_size_ratio * options.size.y;
        const vert = options.size.y * this.baseline_offset_ratio;

        if (["input", "bidirectional", "tri_state"].includes(l.shape)) {
            // accommodate triangular shaped tail
            horz += options.size.y * this.triangle_offset_ratio;
        }

        const offset = new Vec2(horz, vert).rotate(
            Angle.from_degrees(l.at.rotation)
        );

        return offset;
    }

    static paint_shape(
        gfx: Renderer,
        l: sch_items.GlobalLabel,
        shaped: ShapedParagraph
    ) {
        const color = this.color(gfx);
        const margin = shaped.options.size.y * this.label_size_ratio;
        const half_size = shaped.options.size.y / 2 + margin;
        const thickness = shaped.options.get_effective_thickness(
            this.default_thickness
        );

        let length =
            l.at.rotation == 90 || l.at.rotation == 270
                ? shaped.bbox.h
                : shaped.bbox.w;
        length += 2 * margin;

        // hack: I'm not yet sure how kicad adds this extra length to the bbox.
        length += half_size * 0.5;

        const x = length + thickness + 0.03;
        const y = half_size + thickness + 0.03;

        const line = new Polyline(
            [
                new Vec2(0, 0),
                new Vec2(0, -y),
                new Vec2(-x, -y),
                new Vec2(-x, 0),
                new Vec2(-x, y),
                new Vec2(0, y),
                new Vec2(0, 0),
            ],
            thickness,
            color
        );

        let x_offset = 0;

        switch (l.shape) {
            case "input":
                x_offset = -half_size;
                line.points[0].x += half_size;
                line.points[6].x += half_size;
                break;
            case "output":
                line.points[3].x -= half_size;
                break;
            case "bidirectional":
            case "tri_state":
                x_offset = -half_size;
                line.points[0].x += half_size;
                line.points[6].x += half_size;
                line.points[3].x -= half_size;
                break;
            default:
                break;
        }

        for (const pt of line.points) {
            pt.x += x_offset;
        }

        const rotation = Angle.from_degrees(l.at.rotation + 180);

        gfx.state.push();
        gfx.state.matrix.translate_self(l.at.position.x, l.at.position.y);
        gfx.state.matrix.rotate_self(rotation);
        gfx.line(line);
        gfx.state.pop();
    }
}

class HierarchicalLabelPainter extends LabelPainter {
    static classes = [sch_items.HierarchicalLabel];

    static color(gfx) {
        return gfx.theme.label_hier;
    }

    static get_text_offset(
        l: sch_items.HierarchicalLabel,
        options: TextOptions
    ): Vec2 {
        const offset_dist = this.get_text_baseline_offset_dist(l, options);
        const offset = new Vec2(offset_dist + l.effects.size.x, 0);
        return offset.rotate(Angle.from_degrees(l.at.rotation));
    }

    static paint_shape(
        gfx: Renderer,
        l: sch_items.HierarchicalLabel,
        shaped: ShapedParagraph
    ): void {
        const s = l.effects.size.y;
        const color = this.color(gfx);
        const thickness = shaped.options.get_effective_thickness(
            this.default_thickness
        );

        gfx.state.push();
        gfx.state.matrix.translate_self(l.at.position.x, l.at.position.y);
        gfx.state.matrix.rotate_self(Angle.from_degrees(l.at.rotation));

        let points: Vec2[];

        switch (l.shape) {
            case "output":
                points = [
                    new Vec2(0, s / 2),
                    new Vec2(s / 2, s / 2),
                    new Vec2(s, 0),
                    new Vec2(s / 2, -s / 2),
                    new Vec2(0, -s / 2),
                    new Vec2(0, s / 2),
                ];
                break;

            case "input":
                points = [
                    new Vec2(s, s / 2),
                    new Vec2(s / 2, s / 2),
                    new Vec2(0, 0),
                    new Vec2(s / 2, -s / 2),
                    new Vec2(s, -s / 2),
                    new Vec2(s, s / 2),
                ];
                break;

            case "bidirectional":
            case "tri-state":
                points = [
                    new Vec2(s / 2, s / 2),
                    new Vec2(s, 0),
                    new Vec2(s / 2, -s / 2),
                    new Vec2(0, 0),
                    new Vec2(s / 2, s / 2),
                ];
                break;

            case "passive":
            default:
                points = [
                    new Vec2(0, s / 2),
                    new Vec2(s, s / 2),
                    new Vec2(s, -s / 2),
                    new Vec2(0, -s / 2),
                    new Vec2(0, s / 2),
                ];
                break;
        }

        gfx.line(new Polyline(points, thickness, color));

        gfx.state.pop();
    }
}

class PinPainter extends ItemPainter {
    static classes = [sch_items.PinDefinition];

    static layers(item: sch_items.PinDefinition) {
        return [":Symbol:Pin"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        p: sch_items.PinDefinition
    ) {
        if (p.hide) {
            return;
        }

        const matrix = Matrix3.identity();
        matrix.translate_self(p.at.position.x, p.at.position.y);
        matrix.rotate_self(Angle.deg_to_rad(-p.at.rotation));

        gfx.state.push();
        gfx.state.multiply(matrix);

        // Little connection circle
        gfx.arc(
            new Arc(
                new Vec2(0, 0),
                0.254,
                new Angle(0),
                new Angle(Math.PI * 2),
                gfx.state.stroke_width,
                gfx.theme.pin
            )
        );

        // Connecting line
        gfx.line(
            new Polyline(
                [new Vec2(0, 0), new Vec2(p.length, 0)],
                gfx.state.stroke_width,
                gfx.theme.pin
            )
        );

        gfx.state.pop();
    }
}

class LibrarySymbolPainter extends ItemPainter {
    static classes = [sch_items.LibrarySymbol];

    static layers(item: sch_items.LibrarySymbol) {
        return [
            ":Symbol:Foreground",
            ":Symbol:Background",
            ":Symbol:Field",
            ":Symbol:Pin",
        ];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        s: sch_items.LibrarySymbol
    ) {
        for (const c of s.children) {
            LibrarySymbolPainter.paint(painter, gfx, layer, c);
        }

        const outline_color = gfx.theme.component_outline;
        const fill_color = gfx.theme.component_body;

        if (
            layer.name == ":Symbol:Background" ||
            layer.name == ":Symbol:Foreground"
        ) {
            for (const g of s.graphics) {
                if (
                    layer.name == ":Symbol:Background" &&
                    g.fill == "background"
                ) {
                    gfx.state.fill = fill_color;
                } else if (
                    layer.name == ":Symbol:Foreground" &&
                    g.fill == "outline"
                ) {
                    gfx.state.fill = outline_color;
                } else {
                    gfx.state.fill = Color.transparent;
                }

                gfx.state.stroke = outline_color;

                painter.paint_item(layer, g);
            }
        }

        if (layer.name == ":Symbol:Pin") {
            for (const pin of Object.values(s.pins)) {
                PinPainter.paint(painter, gfx, layer, pin);
            }
        }
    }
}

class PropertyPainter extends ItemPainter {
    static classes = [sch_items.Property];

    static layers(item: sch_items.Property) {
        return ["Symbol:Field"];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        p: sch_items.Property
    ) {
        if (p.effects.hide || !p.value) {
            return;
        }

        let color = gfx.theme.fields;
        switch (p.key) {
            case "Reference":
                color = gfx.theme.reference;
                break;
            case "Value":
                color = gfx.theme.value;
                break;
        }

        /*
            Drawing text is hard.
            Properties are drawn based on the location and orientation (rotation
            and mirroring) of their parent symbol, which makes interpreting
            the text alignment... difficult. So KiCAD's approach (and ours)
            is to first calculate the bbox of the text drawn the "normal"
            way, then checking the bbox to see if the text needs to be moved
            around. Once the real final coordinates are figured out, it
            draws the text centered on the bbox.
        */

        const text_options = new TextOptions(
            gfx.text_shaper.default_font,
            p.effects.size,
            p.effects.thickness || 0.127,
            p.effects.bold,
            p.effects.italic,
            p.effects.v_align,
            p.effects.h_align,
            p.effects.mirror
        );

        // Prepare a transformation based on the parent's location,
        // rotation, and mirror settings.
        const parent = p.parent as sch_items.SymbolInstance;
        const parent_matrix = Matrix3.identity();
        parent_matrix.translate_self(p.at.position.x, p.at.position.y);
        parent_matrix.scale_self(
            parent.mirror == "y" ? -1 : 1,
            parent.mirror == "x" ? -1 : 1
        );

        // Figure out the total rotation of this text including the
        // parent's rotation.
        let orient = new Angle(0);
        orient.degrees = parent.at.rotation + p.at.rotation;
        orient = orient.normalize();

        // Get the BBox of the text if it was draw as-is without adjusting
        // the alignment.
        let bbox: BBox = gfx.text_shaper.paragraph(
            p.value,
            new Vec2(0, 0),
            orient,
            text_options
        ).bbox;

        bbox = bbox.transform(parent_matrix).grow(0.512);
        const bbox_center = bbox.center;

        // Text is either oriented horizontally (0 deg)or vertically (90 deg),
        // never anything in between.
        if (orient.degrees == 180) {
            orient.degrees = 0;
        }
        if (orient.degrees == 270) {
            orient.degrees = 90;
        }

        // debug: draw bounding box
        // gfx.circle(bbox_center, 0.15, new Color(0, 1, 0, 1));
        // gfx.circle(p.at.position, 0.25, new Color(0, 1, 1, 1));
        // gfx.line([
        //     bbox.top_left,
        //     bbox.top_right,
        //     bbox.bottom_right,
        //     bbox.bottom_left,
        //     bbox.top_left
        // ], 0.1, new Color(0, 1, 0, 1));

        // Now draw the text using the BBox's center as the origin and
        // alignment set to center, center, which side-steps any weirdness
        // with text alignment.

        text_options.v_align = "center";
        text_options.h_align = "center";

        const shaped = gfx.text_shaper.paragraph(
            p.value,
            bbox_center,
            orient,
            text_options
        );

        for (const stroke of shaped.strokes()) {
            gfx.line(new Polyline(Array.from(stroke), 0.127, color));
        }
    }
}

class SymbolInstancePainter extends ItemPainter {
    static classes = [sch_items.SymbolInstance];

    static layers(item: sch_items.SymbolInstance) {
        return [
            ":Symbol:Foreground",
            ":Symbol:Background",
            ":Symbol:Field",
            ":Symbol:Pin",
        ];
    }

    static paint(
        painter: Painter,
        gfx: Renderer,
        layer: Layer,
        si: sch_items.SymbolInstance
    ) {
        const matrix = Matrix3.identity();
        matrix.translate_self(si.at.position.x, si.at.position.y);
        matrix.scale_self(si.mirror == "y" ? -1 : 1, si.mirror == "x" ? 1 : -1);
        matrix.rotate_self(Angle.deg_to_rad(-si.at.rotation));

        gfx.state.push();
        gfx.state.multiply(matrix);

        LibrarySymbolPainter.paint(painter, gfx, layer, si.lib_symbol);

        gfx.state.pop();

        if (layer.name == ":Symbol:Field") {
            for (const p of Object.values(si.properties)) {
                PropertyPainter.paint(painter, gfx, layer, p);
            }
        }
    }
}

const painters = [
    RectanglePainter,
    PolylinePainter,
    WirePainter,
    CirclePainter,
    ArcPainter,
    JunctionPainter,
    TextPainter,
    PinPainter,
    LibrarySymbolPainter,
    PropertyPainter,
    SymbolInstancePainter,
    LabelPainter,
    GlobalLabelPainter,
    HierarchicalLabelPainter,
];

const painter_for_class: Map<any, typeof ItemPainter> = new Map();

for (const painter of painters) {
    for (const item_class of painter.classes) {
        painter_for_class.set(item_class, painter);
    }
}

export class Painter {
    constructor(public gfx: Renderer) {}

    layers_for(item: any): string[] {
        const painter = painter_for_class.get(item.constructor);

        if (painter) {
            return painter.layers(item);
        } else {
            console.log("Unknown", item);
            return [];
        }
    }

    paint_item(layer: Layer, item: any) {
        const painter = painter_for_class.get(item.constructor);

        if (painter) {
            painter.paint(this, this.gfx, layer, item);
        } else {
            console.log("Unknown", item);
        }
    }

    /**
     * Paint all items on the given layer.
     */
    paint_layer(layer: Layer, depth = 0) {
        const bboxes = new Map();

        this.gfx.start_layer(layer.name, depth);

        for (const item of layer.items) {
            this.gfx.start_object();
            this.paint_item(layer, item);
            const bbox = this.gfx.end_object();
            bboxes.set(item, bbox);
        }

        layer.graphics = this.gfx.end_layer();
        layer.bboxes = bboxes;
    }
}