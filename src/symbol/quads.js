// @flow

const Point = require('@mapbox/point-geometry');
const {GLYPH_PBF_BORDER} = require('../style/parse_glyph_pbf');

import type Anchor from './anchor';
import type {PositionedIcon, Shaping} from './shaping';
import type StyleLayer from '../style/style_layer';
import type {Feature} from '../style-spec/function';
import type {GlyphPosition} from '../render/glyph_atlas';

module.exports = {
    getIconQuads,
    getGlyphQuads
};

/**
 * A textured quad for rendering a single icon or glyph.
 *
 * The zoom range the glyph can be shown is defined by minScale and maxScale.
 *
 * @param tl The offset of the top left corner from the anchor.
 * @param tr The offset of the top right corner from the anchor.
 * @param bl The offset of the bottom left corner from the anchor.
 * @param br The offset of the bottom right corner from the anchor.
 * @param tex The texture coordinates.
 *
 * @private
 */
export type SymbolQuad = {
    tl: Point,
    tr: Point,
    bl: Point,
    br: Point,
    tex: {
        x: number,
        y: number,
        w: number,
        h: number
    },
    writingMode: any | void,
    glyphOffset: [number, number]
};

/**
 * Create the quads used for rendering an icon.
 * @private
 */
function getIconQuads(anchor: Anchor,
                      shapedIcon: PositionedIcon,
                      layer: StyleLayer,
                      alongLine: boolean,
                      shapedText: Shaping,
                      globalProperties: Object,
                      feature: Feature): Array<SymbolQuad> {
    const image = shapedIcon.image;
    const layout = layer.layout;

    // If you have a 10px icon that isn't perfectly aligned to the pixel grid it will cover 11 actual
    // pixels. The quad needs to be padded to account for this, otherwise they'll look slightly clipped
    // on one edge in some cases.
    const border = 1;

    const top = shapedIcon.top - border / image.pixelRatio;
    const left = shapedIcon.left - border / image.pixelRatio;
    const bottom = shapedIcon.bottom + border / image.pixelRatio;
    const right = shapedIcon.right + border / image.pixelRatio;
    let tl, tr, br, bl;

    // text-fit mode
    if (layout['icon-text-fit'] !== 'none' && shapedText) {
        const iconWidth = (right - left),
            iconHeight = (bottom - top),
            size = layout['text-size'] / 24,
            textLeft = shapedText.left * size,
            textRight = shapedText.right * size,
            textTop = shapedText.top * size,
            textBottom = shapedText.bottom * size,
            textWidth = textRight - textLeft,
            textHeight = textBottom - textTop,
            padT = layout['icon-text-fit-padding'][0],
            padR = layout['icon-text-fit-padding'][1],
            padB = layout['icon-text-fit-padding'][2],
            padL = layout['icon-text-fit-padding'][3],
            offsetY = layout['icon-text-fit'] === 'width' ? (textHeight - iconHeight) * 0.5 : 0,
            offsetX = layout['icon-text-fit'] === 'height' ? (textWidth - iconWidth) * 0.5 : 0,
            width = layout['icon-text-fit'] === 'width' || layout['icon-text-fit'] === 'both' ? textWidth : iconWidth,
            height = layout['icon-text-fit'] === 'height' || layout['icon-text-fit'] === 'both' ? textHeight : iconHeight;
        tl = new Point(textLeft + offsetX - padL,         textTop + offsetY - padT);
        tr = new Point(textLeft + offsetX + padR + width, textTop + offsetY - padT);
        br = new Point(textLeft + offsetX + padR + width, textTop + offsetY + padB + height);
        bl = new Point(textLeft + offsetX - padL,         textTop + offsetY + padB + height);
    // Normal icon size mode
    } else {
        tl = new Point(left, top);
        tr = new Point(right, top);
        br = new Point(right, bottom);
        bl = new Point(left, bottom);
    }

    const angle = layer.getLayoutValue('icon-rotate', globalProperties, feature) * Math.PI / 180;

    if (angle) {
        const sin = Math.sin(angle),
            cos = Math.cos(angle),
            matrix = [cos, -sin, sin, cos];

        tl._matMult(matrix);
        tr._matMult(matrix);
        bl._matMult(matrix);
        br._matMult(matrix);
    }

    // Icon quad is padded, so texture coordinates also need to be padded.
    const textureRect = {
        x: image.textureRect.x - border,
        y: image.textureRect.y - border,
        w: image.textureRect.w + border * 2,
        h: image.textureRect.h + border * 2
    };

    return [{tl, tr, bl, br, tex: textureRect, writingMode: undefined, glyphOffset: [0, 0]}];
}

/**
 * Create the quads used for rendering a text label.
 * @private
 */
function getGlyphQuads(anchor: Anchor,
                       shaping: Shaping,
                       layer: StyleLayer,
                       alongLine: boolean,
                       globalProperties: Object,
                       feature: Feature,
                       positions: {[number]: GlyphPosition}): Array<SymbolQuad> {

    const oneEm = 24;
    const textRotate = layer.getLayoutValue('text-rotate', globalProperties, feature) * Math.PI / 180;
    const textOffset = layer.getLayoutValue('text-offset', globalProperties, feature).map((t)=> t * oneEm);

    const positionedGlyphs = shaping.positionedGlyphs;
    const quads = [];


    for (let k = 0; k < positionedGlyphs.length; k++) {
        const positionedGlyph = positionedGlyphs[k];
        const glyph = positions[positionedGlyph.glyph];
        if (!glyph) continue;

        const rect = glyph.rect;
        if (!rect) continue;

        // The rects have an addditional buffer that is not included in their size.
        const glyphPadding = 1.0;
        const rectBuffer = GLYPH_PBF_BORDER + glyphPadding;

        const halfAdvance = glyph.metrics.advance / 2;

        const glyphOffset = alongLine ?
            [positionedGlyph.x + halfAdvance, positionedGlyph.y] :
            [0, 0];

        const builtInOffset = alongLine ?
            [0, 0] :
            [positionedGlyph.x + halfAdvance + textOffset[0], positionedGlyph.y + textOffset[1]];


        const x1 = glyph.metrics.left - rectBuffer - halfAdvance + builtInOffset[0];
        const y1 = -glyph.metrics.top - rectBuffer + builtInOffset[1];
        const x2 = x1 + rect.w;
        const y2 = y1 + rect.h;

        const tl = new Point(x1, y1);
        const tr = new Point(x2, y1);
        const bl  = new Point(x1, y2);
        const br = new Point(x2, y2);

        if (alongLine && positionedGlyph.vertical) {
            // Vertical-supporting glyphs are laid out in 24x24 point boxes (1 square em)
            // In horizontal orientation, the y values for glyphs are below the midline
            // and we use a "yOffset" of -17 to pull them up to the middle.
            // By rotating counter-clockwise around the point at the center of the left
            // edge of a 24x24 layout box centered below the midline, we align the center
            // of the glyphs with the horizontal midline, so the yOffset is no longer
            // necessary, but we also pull the glyph to the left along the x axis
            const center = new Point(-halfAdvance, halfAdvance);
            const verticalRotation = -Math.PI / 2;
            const xOffsetCorrection = new Point(5, 0);
            tl._rotateAround(verticalRotation, center)._add(xOffsetCorrection);
            tr._rotateAround(verticalRotation, center)._add(xOffsetCorrection);
            bl._rotateAround(verticalRotation, center)._add(xOffsetCorrection);
            br._rotateAround(verticalRotation, center)._add(xOffsetCorrection);
        }

        if (textRotate) {
            const sin = Math.sin(textRotate),
                cos = Math.cos(textRotate),
                matrix = [cos, -sin, sin, cos];

            tl._matMult(matrix);
            tr._matMult(matrix);
            bl._matMult(matrix);
            br._matMult(matrix);
        }

        quads.push({tl, tr, bl, br, tex: rect, writingMode: shaping.writingMode, glyphOffset});
    }

    return quads;
}
